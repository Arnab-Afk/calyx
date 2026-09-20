package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/Arnab-Afk/calyx/apps/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const workspaceCols = `id::text, name, join_code, owner_id::text, created_at,
	COALESCE(kind, 'standard'), parent_workspace_id::text, scoped_project_id, scoped_project_slug`

func scanWorkspace(scanner interface {
	Scan(dest ...any) error
}) (models.Workspace, error) {
	var ws models.Workspace
	var parent, scopedID, scopedSlug sql.NullString
	err := scanner.Scan(
		&ws.ID, &ws.Name, &ws.JoinCode, &ws.OwnerID, &ws.CreatedAt,
		&ws.Kind, &parent, &scopedID, &scopedSlug,
	)
	if err != nil {
		return ws, err
	}
	if ws.Kind == "" {
		ws.Kind = "standard"
	}
	if parent.Valid && parent.String != "" {
		ws.ParentWorkspaceID = &parent.String
	}
	if scopedID.Valid && scopedID.String != "" {
		ws.ScopedProjectID = &scopedID.String
	}
	if scopedSlug.Valid && scopedSlug.String != "" {
		ws.ScopedProjectSlug = &scopedSlug.String
	}
	return ws, nil
}

func (s *Server) inviteToWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	member, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil || member.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || !strings.Contains(email, "@") {
		writeErr(w, http.StatusBadRequest, "valid email required")
		return
	}
	role := body.Role
	if role != "admin" {
		role = "member"
	}

	result, err := s.addOrInviteMember(r.Context(), wsID, email, role, userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) shareProject(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "workspaceID")
	member, err := s.requireMember(r.Context(), hostID, userID(r.Context()))
	if err != nil || member.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}

	var body struct {
		Email       string `json:"email"`
		ProjectID   string `json:"projectId"`
		ProjectSlug string `json:"projectSlug"`
		ProjectName string `json:"projectName"`
		Role        string `json:"role"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	projectID := strings.TrimSpace(body.ProjectID)
	projectSlug := strings.TrimSpace(body.ProjectSlug)
	if email == "" || !strings.Contains(email, "@") {
		writeErr(w, http.StatusBadRequest, "valid email required")
		return
	}
	if projectID == "" || projectSlug == "" {
		writeErr(w, http.StatusBadRequest, "projectId and projectSlug required")
		return
	}
	role := body.Role
	if role != "admin" {
		role = "member"
	}
	name := strings.TrimSpace(body.ProjectName)
	if name == "" {
		name = projectSlug
	}
	if len(name) < 3 {
		name = projectSlug + "-share"
	}
	if len(name) > 40 {
		name = name[:40]
	}

	// One guest workspace per (host, project) — invitees join the same shared view.
	var guest models.Workspace
	existing, findErr := s.findProjectShareWorkspace(r.Context(), hostID, projectID)
	if findErr == nil {
		guest = existing
	} else if findErr != pgx.ErrNoRows {
		writeErr(w, http.StatusInternalServerError, findErr.Error())
		return
	} else {
		created, createErr := s.createProjectShareWorkspace(r.Context(), hostID, name, projectID, projectSlug, userID(r.Context()))
		if createErr != nil {
			writeErr(w, http.StatusInternalServerError, createErr.Error())
			return
		}
		guest = created
	}

	result, err := s.addOrInviteMember(r.Context(), guest.ID, email, role, userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"workspace": guest,
		"invite":    result,
	})
}

func (s *Server) findProjectShareWorkspace(ctx context.Context, hostID, projectID string) (models.Workspace, error) {
	row := s.db.QueryRow(ctx,
		`SELECT `+workspaceCols+` FROM chat_workspaces
		 WHERE parent_workspace_id=$1::uuid AND scoped_project_id=$2 AND kind='project_share'
		 LIMIT 1`,
		hostID, projectID,
	)
	return scanWorkspace(row)
}

func (s *Server) createProjectShareWorkspace(ctx context.Context, hostID, name, projectID, projectSlug, ownerID string) (models.Workspace, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return models.Workspace{}, err
	}
	defer tx.Rollback(ctx)

	code := joinCode()
	row := tx.QueryRow(ctx,
		`INSERT INTO chat_workspaces
		   (name, join_code, owner_id, kind, parent_workspace_id, scoped_project_id, scoped_project_slug)
		 VALUES ($1,$2,$3::uuid,'project_share',$4::uuid,$5,$6)
		 RETURNING `+workspaceCols,
		name, code, ownerID, hostID, projectID, projectSlug,
	)
	guest, err := scanWorkspace(row)
	if err != nil {
		return models.Workspace{}, err
	}
	// Owner is host admin; invitee will be added separately. Still create general channel.
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_members (user_id, workspace_id, role) VALUES ($1::uuid,$2::uuid,'admin')
		 ON CONFLICT (workspace_id, user_id) DO NOTHING`,
		ownerID, guest.ID,
	)
	if err != nil {
		return models.Workspace{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO chat_channels (name, workspace_id) VALUES ('general', $1::uuid)`, guest.ID)
	if err != nil {
		return models.Workspace{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.Workspace{}, err
	}

	// Link guest workspace to the same observability tenant + project scope as the host.
	s.linkWorkspaceTenantLike(ctx, guest.ID, hostID)
	s.setWorkspaceProjectScope(ctx, guest.ID, hostID, projectID, projectSlug)
	return guest, nil
}

func (s *Server) addOrInviteMember(ctx context.Context, workspaceID, email, role, createdBy string) (map[string]any, error) {
	var userIDFound string
	err := s.db.QueryRow(ctx, `SELECT id::text FROM chat_users WHERE email=$1`, email).Scan(&userIDFound)
	if err == nil {
		var memberID string
		err = s.db.QueryRow(ctx,
			`INSERT INTO chat_members (user_id, workspace_id, role) VALUES ($1::uuid,$2::uuid,$3)
			 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
			 RETURNING id::text`,
			userIDFound, workspaceID, role,
		).Scan(&memberID)
		if err != nil {
			return nil, err
		}
		return map[string]any{"status": "added", "memberId": memberID, "email": email}, nil
	}
	if err != pgx.ErrNoRows {
		return nil, err
	}

	var inviteID string
	err = s.db.QueryRow(ctx,
		`INSERT INTO chat_workspace_invites (workspace_id, email, role, created_by)
		 VALUES ($1::uuid,$2,$3,$4::uuid)
		 ON CONFLICT (workspace_id, email) DO UPDATE
		   SET role = EXCLUDED.role, accepted_at = NULL, created_at = NOW()
		 RETURNING id::text`,
		workspaceID, email, role, createdBy,
	).Scan(&inviteID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"status": "invited", "inviteId": inviteID, "email": email}, nil
}

func (s *Server) acceptPendingInvites(ctx context.Context, uid, email string) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return
	}
	rows, err := s.db.Query(ctx,
		`SELECT id::text, workspace_id::text, role FROM chat_workspace_invites
		 WHERE email=$1 AND accepted_at IS NULL`, email)
	if err != nil {
		return
	}
	defer rows.Close()
	type inv struct {
		ID, WorkspaceID, Role string
	}
	var list []inv
	for rows.Next() {
		var item inv
		if rows.Scan(&item.ID, &item.WorkspaceID, &item.Role) == nil {
			list = append(list, item)
		}
	}
	for _, item := range list {
		_, _ = s.db.Exec(ctx,
			`INSERT INTO chat_members (user_id, workspace_id, role) VALUES ($1::uuid,$2::uuid,$3)
			 ON CONFLICT (workspace_id, user_id) DO NOTHING`,
			uid, item.WorkspaceID, item.Role,
		)
		_, _ = s.db.Exec(ctx, `UPDATE chat_workspace_invites SET accepted_at=NOW() WHERE id=$1::uuid`, item.ID)
	}
}

func (s *Server) linkWorkspaceTenantLike(ctx context.Context, guestID, hostID string) {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		return
	}
	tenant := s.fetchWorkspaceTenant(ctx, hostID)
	if tenant == "" {
		tenant = strings.TrimSpace(s.calyxDefaultTenant)
		if tenant == "" {
			tenant = "default"
		}
	}
	payload, _ := json.Marshal(map[string]string{"tenantId": tenant})
	endpoint := fmt.Sprintf("%s/v1/internal/workspaces/%s/link", s.calyxAskURL, url.PathEscape(guestID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(payload)))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Calyx-Internal-Key", s.calyxInternalKey)
	res, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
}

func (s *Server) fetchWorkspaceTenant(ctx context.Context, workspaceID string) string {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		return ""
	}
	endpoint := fmt.Sprintf("%s/v1/internal/workspaces/%s/link", s.calyxAskURL, url.PathEscape(workspaceID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("X-Calyx-Internal-Key", s.calyxInternalKey)
	res, err := s.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<16))
	if res.StatusCode >= 300 {
		return ""
	}
	var parsed struct {
		TenantID string `json:"tenantId"`
	}
	_ = json.Unmarshal(body, &parsed)
	return strings.TrimSpace(parsed.TenantID)
}

func (s *Server) setWorkspaceProjectScope(ctx context.Context, guestID, hostID, projectID, projectSlug string) {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		return
	}
	payload, _ := json.Marshal(map[string]string{
		"hostWorkspaceId": hostID,
		"projectId":       projectID,
		"projectSlug":     projectSlug,
	})
	endpoint := fmt.Sprintf("%s/v1/internal/workspaces/%s/project-scope", s.calyxAskURL, url.PathEscape(guestID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(payload)))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Calyx-Internal-Key", s.calyxInternalKey)
	res, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
}
