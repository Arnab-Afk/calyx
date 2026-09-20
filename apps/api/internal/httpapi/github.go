package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const (
	githubAuthURL  = "https://github.com/login/oauth/authorize"
	githubTokenURL = "https://github.com/login/oauth/access_token"
	githubUserURL  = "https://api.github.com/user"
	githubEmailURL = "https://api.github.com/user/emails"
)

func (s *Server) githubConfigured() bool {
	return s.githubClientID != "" && s.githubClientSecret != "" && s.githubRedirectURL != "" && s.webAppURL != ""
}

func (s *Server) githubStart(w http.ResponseWriter, r *http.Request) {
	if !s.githubConfigured() {
		writeErr(w, http.StatusNotImplemented, "github oauth is not configured")
		return
	}
	state, err := randomHex(16)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "state failed")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: s.cookieSameSite,
		Domain:   s.cookieDomain,
		MaxAge:   600,
	})
	q := url.Values{}
	q.Set("client_id", s.githubClientID)
	q.Set("redirect_uri", s.githubRedirectURL)
	q.Set("scope", "read:user user:email")
	q.Set("state", state)
	q.Set("allow_signup", "true")
	http.Redirect(w, r, githubAuthURL+"?"+q.Encode(), http.StatusFound)
}

func (s *Server) githubCallback(w http.ResponseWriter, r *http.Request) {
	if !s.githubConfigured() {
		writeErr(w, http.StatusNotImplemented, "github oauth is not configured")
		return
	}
	if errMsg := r.URL.Query().Get("error"); errMsg != "" {
		http.Redirect(w, r, strings.TrimRight(s.webAppURL, "/")+"/auth?error="+url.QueryEscape(errMsg), http.StatusFound)
		return
	}
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	cookie, err := r.Cookie(oauthStateCookie)
	if err != nil || state == "" || code == "" || cookie.Value == "" || cookie.Value != state {
		writeErr(w, http.StatusBadRequest, "invalid oauth state")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: oauthStateCookie, Value: "", Path: "/", HttpOnly: true,
		Secure: s.cookieSecure, SameSite: s.cookieSameSite, Domain: s.cookieDomain, MaxAge: -1,
	})

	token, err := s.exchangeGitHubCode(r, code)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "github token exchange failed")
		return
	}
	profile, err := s.fetchGitHubProfile(r, token)
	if err != nil || profile.Email == "" {
		writeErr(w, http.StatusBadGateway, "github profile failed")
		return
	}
	email := strings.TrimSpace(strings.ToLower(profile.Email))
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = strings.TrimSpace(profile.Login)
	}
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	u, err := s.upsertOAuthUser(r, email, name, profile.AvatarURL)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "user upsert failed")
		return
	}
	session, err := s.auth.IssueToken(u.ID, u.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token failed")
		return
	}
	s.setSessionCookie(w, session)
	http.Redirect(w, r, strings.TrimRight(s.webAppURL, "/")+"/", http.StatusFound)
}

func (s *Server) exchangeGitHubCode(r *http.Request, code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", s.githubClientID)
	form.Set("client_secret", s.githubClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", s.githubRedirectURL)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, githubTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	res, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("token status %d: %s", res.StatusCode, string(body))
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || parsed.AccessToken == "" {
		if parsed.Error != "" {
			return "", fmt.Errorf("token error: %s", parsed.Error)
		}
		return "", fmt.Errorf("token parse failed")
	}
	return parsed.AccessToken, nil
}

func (s *Server) fetchGitHubProfile(r *http.Request, accessToken string) (struct {
	Email     string
	Name      string
	Login     string
	AvatarURL string
}, error) {
	var out struct {
		Email     string
		Name      string
		Login     string
		AvatarURL string
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, githubUserURL, nil)
	if err != nil {
		return out, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	res, err := s.httpClient.Do(req)
	if err != nil {
		return out, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return out, fmt.Errorf("user status %d", res.StatusCode)
	}
	var user struct {
		Email     string `json:"email"`
		Name      string `json:"name"`
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return out, err
	}
	out.Name = user.Name
	out.Login = user.Login
	out.AvatarURL = user.AvatarURL
	out.Email = strings.TrimSpace(user.Email)
	if out.Email == "" {
		email, err := s.fetchGitHubPrimaryEmail(r, accessToken)
		if err != nil {
			return out, err
		}
		out.Email = email
	}
	return out, nil
}

func (s *Server) fetchGitHubPrimaryEmail(r *http.Request, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, githubEmailURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	res, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("emails status %d", res.StatusCode)
	}
	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.Unmarshal(body, &emails); err != nil {
		return "", err
	}
	var fallback string
	for _, e := range emails {
		if !e.Verified || e.Email == "" {
			continue
		}
		if e.Primary {
			return e.Email, nil
		}
		if fallback == "" {
			fallback = e.Email
		}
	}
	if fallback != "" {
		return fallback, nil
	}
	return "", fmt.Errorf("no verified github email")
}
