package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (s *Server) requireWorkspaceAdmin(r *http.Request) (string, bool) {
	workspaceID := chi.URLParam(r, "workspaceID")
	member, err := s.requireMember(r.Context(), workspaceID, userID(r.Context()))
	return workspaceID, err == nil && member.Role == "admin"
}

func (s *Server) proxyMCPCredentials(w http.ResponseWriter, r *http.Request, action string, payload map[string]any) {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		writeErr(w, http.StatusServiceUnavailable, "Calyx connector management is not configured")
		return
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, s.calyxAskURL+"/v1/mcp/credentials/"+action, bytes.NewReader(body))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "connector request failed")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Calyx-Internal-Key", s.calyxInternalKey)
	response, err := s.httpClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Calyx connector service unavailable")
		return
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "invalid connector response")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(responseBody)
}

func (s *Server) listMCPCredentials(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := s.requireWorkspaceAdmin(r)
	if !ok {
		writeErr(w, http.StatusForbidden, "workspace admin access required")
		return
	}
	s.proxyMCPCredentials(w, r, "list", map[string]any{"workspaceId": workspaceID})
}

func (s *Server) createMCPCredential(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := s.requireWorkspaceAdmin(r)
	if !ok {
		writeErr(w, http.StatusForbidden, "workspace admin access required")
		return
	}
	var body struct {
		Name          string `json:"name"`
		ExpiresInDays *int   `json:"expiresInDays"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len(body.Name) > 80 {
		writeErr(w, http.StatusBadRequest, "name must contain 1-80 characters")
		return
	}
	if body.ExpiresInDays != nil && (*body.ExpiresInDays < 1 || *body.ExpiresInDays > 365) {
		writeErr(w, http.StatusBadRequest, "expiry must be between 1 and 365 days")
		return
	}
	payload := map[string]any{
		"workspaceId": workspaceID,
		"name":        body.Name,
		"scopes":      []string{"logs:read", "incidents:read", "incidents:ask"},
	}
	if body.ExpiresInDays != nil {
		payload["expiresInDays"] = *body.ExpiresInDays
	}
	s.proxyMCPCredentials(w, r, "create", payload)
}

func (s *Server) revokeMCPCredential(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := s.requireWorkspaceAdmin(r)
	if !ok {
		writeErr(w, http.StatusForbidden, "workspace admin access required")
		return
	}
	credentialID := strings.TrimSpace(chi.URLParam(r, "credentialID"))
	if credentialID == "" || len(credentialID) > 100 {
		writeErr(w, http.StatusBadRequest, "invalid credential id")
		return
	}
	s.proxyMCPCredentials(w, r, "revoke", map[string]any{"workspaceId": workspaceID, "credentialId": credentialID})
}
