package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Arnab-Afk/calyx/apps/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserInfoURL = "https://openidconnect.googleapis.com/v1/userinfo"
	oauthStateCookie  = "calyx_oauth_state"
)

func (s *Server) googleConfigured() bool {
	return s.googleClientID != "" && s.googleClientSecret != "" && s.googleRedirectURL != "" && s.webAppURL != ""
}

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	if !s.googleConfigured() {
		writeErr(w, http.StatusNotImplemented, "google oauth is not configured")
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
	q.Set("client_id", s.googleClientID)
	q.Set("redirect_uri", s.googleRedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", "openid email profile")
	q.Set("state", state)
	q.Set("access_type", "online")
	q.Set("prompt", "select_account")
	http.Redirect(w, r, googleAuthURL+"?"+q.Encode(), http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	if !s.googleConfigured() {
		writeErr(w, http.StatusNotImplemented, "google oauth is not configured")
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

	token, err := s.exchangeGoogleCode(r, code)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "google token exchange failed")
		return
	}
	profile, err := s.fetchGoogleProfile(r, token)
	if err != nil || profile.Email == "" {
		writeErr(w, http.StatusBadGateway, "google profile failed")
		return
	}
	if !profile.EmailVerified {
		http.Redirect(w, r, strings.TrimRight(s.webAppURL, "/")+"/auth?error="+url.QueryEscape("google_email_unverified"), http.StatusFound)
		return
	}
	email := strings.TrimSpace(strings.ToLower(profile.Email))
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	u, err := s.upsertOAuthUser(r, email, name, profile.Picture)
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

func (s *Server) exchangeGoogleCode(r *http.Request, code string) (string, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", s.googleClientID)
	form.Set("client_secret", s.googleClientSecret)
	form.Set("redirect_uri", s.googleRedirectURL)
	form.Set("grant_type", "authorization_code")
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
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
	}
	if err := json.Unmarshal(body, &parsed); err != nil || parsed.AccessToken == "" {
		return "", fmt.Errorf("token parse failed")
	}
	return parsed.AccessToken, nil
}

func (s *Server) fetchGoogleProfile(r *http.Request, accessToken string) (struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}, error) {
	var profile struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return profile, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	res, err := s.httpClient.Do(req)
	if err != nil {
		return profile, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return profile, fmt.Errorf("userinfo status %d", res.StatusCode)
	}
	if err := json.Unmarshal(body, &profile); err != nil {
		return profile, err
	}
	return profile, nil
}

// upsertOAuthUser finds or creates a chat user by normalized email so Google,
// GitHub, and password sign-in with the same address share one account.
func (s *Server) upsertOAuthUser(r *http.Request, email, name, image string) (*models.User, error) {
	var u models.User
	err := s.db.QueryRow(r.Context(),
		`SELECT id::text, email, name, image, created_at FROM chat_users WHERE email=$1`, email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt)
	if err == nil {
		if image != "" {
			_, _ = s.db.Exec(r.Context(),
				`UPDATE chat_users SET image=$2 WHERE id=$1::uuid`,
				u.ID, image,
			)
			u.Image = &image
		}
		s.acceptPendingInvites(r.Context(), u.ID, u.Email)
		return &u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	hash, err := s.auth.HashPassword(randomPassword())
	if err != nil {
		return nil, err
	}
	var img any
	if image != "" {
		img = image
	}
	err = s.db.QueryRow(r.Context(),
		`INSERT INTO chat_users (email, name, password_hash, image) VALUES ($1,$2,$3,$4)
		 RETURNING id::text, email, name, image, created_at`,
		email, name, hash, img,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt)
	if err == nil {
		s.acceptPendingInvites(r.Context(), u.ID, u.Email)
		return &u, nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		err = s.db.QueryRow(r.Context(),
			`SELECT id::text, email, name, image, created_at FROM chat_users WHERE email=$1`, email,
		).Scan(&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt)
		if err != nil {
			return nil, err
		}
		s.acceptPendingInvites(r.Context(), u.ID, u.Email)
		return &u, nil
	}
	return nil, err
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func randomPassword() string {
	s, err := randomHex(24)
	if err != nil {
		return fmt.Sprintf("oauth-%d", time.Now().UnixNano())
	}
	return "oauth-" + s
}
