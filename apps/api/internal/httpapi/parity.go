package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Arnab-Afk/calyx/apps/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func (s *Server) getWorkspaceInfo(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	var name string
	if err := s.db.QueryRow(r.Context(), `SELECT name FROM chat_workspaces WHERE id=$1`, wsID).Scan(&name); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	member, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	role := ""
	if err == nil {
		role = member.Role
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "isMember": err == nil, "role": role})
}

func (s *Server) updateWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	member, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil || member.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if len(body.Name) < 3 || len(body.Name) > 40 {
		writeErr(w, http.StatusBadRequest, "name must be 3-40 chars")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE chat_workspaces SET name=$1 WHERE id=$2`, body.Name, wsID); err != nil {
		writeErr(w, http.StatusInternalServerError, "workspace update failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": wsID, "name": body.Name})
}

func (s *Server) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	var ownerID string
	if err := s.db.QueryRow(r.Context(), `SELECT owner_id::text FROM chat_workspaces WHERE id=$1`, wsID).Scan(&ownerID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if ownerID != userID(r.Context()) {
		writeErr(w, http.StatusForbidden, "workspace owner required")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM chat_workspaces WHERE id=$1`, wsID); err != nil {
		writeErr(w, http.StatusInternalServerError, "workspace deletion failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func scanMemberWithUser(row scannable) (models.Member, error) {
	var member models.Member
	var user models.User
	err := row.Scan(&member.ID, &member.UserID, &member.WorkspaceID, &member.Role, &member.CreatedAt,
		&user.ID, &user.Email, &user.Name, &user.Image, &user.CreatedAt)
	if err == nil {
		member.User = &user
	}
	return member, err
}

func (s *Server) memberByID(r *http.Request, memberID string) (models.Member, error) {
	return scanMemberWithUser(s.db.QueryRow(r.Context(),
		`SELECT m.id::text, m.user_id::text, m.workspace_id::text, m.role, m.created_at,
		        u.id::text, u.email, u.name, u.image, u.created_at
		 FROM chat_members m JOIN chat_users u ON u.id=m.user_id WHERE m.id=$1`, memberID))
}

func (s *Server) currentMember(w http.ResponseWriter, r *http.Request) {
	member, err := s.requireMember(r.Context(), chi.URLParam(r, "workspaceID"), userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (s *Server) getMember(w http.ResponseWriter, r *http.Request) {
	member, err := s.memberByID(r, chi.URLParam(r, "memberID"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	if _, err := s.requireMember(r.Context(), member.WorkspaceID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (s *Server) updateMember(w http.ResponseWriter, r *http.Request) {
	target, err := s.memberByID(r, chi.URLParam(r, "memberID"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	actor, err := s.requireMember(r.Context(), target.WorkspaceID, userID(r.Context()))
	if err != nil || actor.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if decodeJSON(r, &body) != nil || (body.Role != "admin" && body.Role != "member") {
		writeErr(w, http.StatusBadRequest, "role must be admin or member")
		return
	}
	var ownerID string
	_ = s.db.QueryRow(r.Context(), `SELECT owner_id::text FROM chat_workspaces WHERE id=$1`, target.WorkspaceID).Scan(&ownerID)
	if target.UserID == ownerID && body.Role != "admin" {
		writeErr(w, http.StatusConflict, "workspace owner must remain an admin")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE chat_members SET role=$1 WHERE id=$2`, body.Role, target.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "member update failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": target.ID, "role": body.Role})
}

func (s *Server) deleteMember(w http.ResponseWriter, r *http.Request) {
	target, err := s.memberByID(r, chi.URLParam(r, "memberID"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	actor, err := s.requireMember(r.Context(), target.WorkspaceID, userID(r.Context()))
	if err != nil || (actor.Role != "admin" && actor.ID != target.ID) {
		writeErr(w, http.StatusForbidden, "admin or self required")
		return
	}
	var ownerID string
	_ = s.db.QueryRow(r.Context(), `SELECT owner_id::text FROM chat_workspaces WHERE id=$1`, target.WorkspaceID).Scan(&ownerID)
	if target.UserID == ownerID {
		writeErr(w, http.StatusConflict, "workspace owner cannot be removed")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM chat_members WHERE id=$1`, target.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "member deletion failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) getChannel(w http.ResponseWriter, r *http.Request) {
	var channel models.Channel
	err := s.db.QueryRow(r.Context(),
		`SELECT id::text, name, workspace_id::text, created_at FROM chat_channels WHERE id=$1`,
		chi.URLParam(r, "channelID"),
	).Scan(&channel.ID, &channel.Name, &channel.WorkspaceID, &channel.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "channel lookup failed")
		return
	}
	if _, err := s.requireMember(r.Context(), channel.WorkspaceID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	writeJSON(w, http.StatusOK, channel)
}

func (s *Server) getMessage(w http.ResponseWriter, r *http.Request) {
	row := s.db.QueryRow(r.Context(),
		`SELECT id::text, body, member_id::text, workspace_id::text, channel_id::text,
		        parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at
		 FROM chat_messages WHERE id=$1`, chi.URLParam(r, "messageID"))
	message, err := scanMessage(row)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "message not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "message lookup failed")
		return
	}
	if message.ConversationID != nil {
		if _, _, err := s.conversationForUser(r, *message.ConversationID); err != nil {
			writeErr(w, http.StatusNotFound, "message not found")
			return
		}
	} else if _, err := s.requireMember(r.Context(), message.WorkspaceID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	_ = s.populateMessage(r.Context(), &message)
	writeJSON(w, http.StatusOK, message)
}
