package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Arnab-Afk/calyx/apps/api/internal/models"
	"github.com/Arnab-Afk/calyx/apps/api/internal/realtime"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func scanConversation(row scannable) (models.Conversation, error) {
	var conversation models.Conversation
	err := row.Scan(&conversation.ID, &conversation.WorkspaceID, &conversation.MemberOneID,
		&conversation.MemberTwoID, &conversation.CreatedAt)
	return conversation, err
}

func (s *Server) createOrGetConversation(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceID")
	current, err := s.requireMember(r.Context(), workspaceID, userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	var body struct {
		MemberID string `json:"memberId"`
	}
	if decodeJSON(r, &body) != nil || body.MemberID == "" || body.MemberID == current.ID {
		writeErr(w, http.StatusBadRequest, "another workspace member is required")
		return
	}
	var targetWorkspace string
	if err := s.db.QueryRow(r.Context(), `SELECT workspace_id::text FROM chat_members WHERE id=$1`, body.MemberID).Scan(&targetWorkspace); err != nil || targetWorkspace != workspaceID {
		writeErr(w, http.StatusBadRequest, "member does not belong to workspace")
		return
	}
	_, err = s.db.Exec(r.Context(),
		`INSERT INTO chat_conversations (workspace_id, member_one_id, member_two_id)
		 VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, workspaceID, current.ID, body.MemberID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "conversation creation failed")
		return
	}
	conversation, err := scanConversation(s.db.QueryRow(r.Context(),
		`SELECT id::text, workspace_id::text, member_one_id::text, member_two_id::text, created_at
		 FROM chat_conversations
		 WHERE workspace_id=$1 AND ((member_one_id=$2 AND member_two_id=$3) OR
		       (member_one_id=$3 AND member_two_id=$2))`, workspaceID, current.ID, body.MemberID))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "conversation lookup failed")
		return
	}
	writeJSON(w, http.StatusOK, conversation)
}

func (s *Server) conversationForUser(r *http.Request, conversationID string) (models.Conversation, models.Member, error) {
	conversation, err := scanConversation(s.db.QueryRow(r.Context(),
		`SELECT id::text, workspace_id::text, member_one_id::text, member_two_id::text, created_at
		 FROM chat_conversations WHERE id=$1`, conversationID))
	if err != nil {
		return conversation, models.Member{}, err
	}
	member, err := s.requireMember(r.Context(), conversation.WorkspaceID, userID(r.Context()))
	if err != nil || (member.ID != conversation.MemberOneID && member.ID != conversation.MemberTwoID) {
		return conversation, models.Member{}, pgx.ErrNoRows
	}
	return conversation, *member, nil
}

func (s *Server) getConversation(w http.ResponseWriter, r *http.Request) {
	conversation, _, err := s.conversationForUser(r, chi.URLParam(r, "conversationID"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "conversation not found")
		return
	}
	writeJSON(w, http.StatusOK, conversation)
}

func messageLimit(r *http.Request) int {
	limit := 50
	if value := r.URL.Query().Get("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	return limit
}

func (s *Server) listConversationMessages(w http.ResponseWriter, r *http.Request) {
	conversationID := chi.URLParam(r, "conversationID")
	if _, _, err := s.conversationForUser(r, conversationID); err != nil {
		writeErr(w, http.StatusNotFound, "conversation not found")
		return
	}
	parent := r.URL.Query().Get("parentMessageId")
	var rows pgx.Rows
	var err error
	if parent == "" {
		rows, err = s.db.Query(r.Context(),
			`SELECT id::text, body, member_id::text, workspace_id::text, channel_id::text,
			        parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at
			 FROM chat_messages WHERE conversation_id=$1 AND parent_message_id IS NULL
			 ORDER BY created_at DESC LIMIT $2`, conversationID, messageLimit(r))
	} else {
		rows, err = s.db.Query(r.Context(),
			`SELECT id::text, body, member_id::text, workspace_id::text, channel_id::text,
			        parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at
			 FROM chat_messages WHERE conversation_id=$1 AND parent_message_id=$2
			 ORDER BY created_at ASC LIMIT $3`, conversationID, parent, messageLimit(r))
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "message lookup failed")
		return
	}
	defer rows.Close()
	messages := []models.Message{}
	for rows.Next() {
		message, err := scanMessage(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "message scan failed")
			return
		}
		_ = s.populateMessage(r.Context(), &message)
		messages = append(messages, message)
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": messages})
}

func (s *Server) createConversationMessage(w http.ResponseWriter, r *http.Request) {
	conversationID := chi.URLParam(r, "conversationID")
	conversation, member, err := s.conversationForUser(r, conversationID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "conversation not found")
		return
	}
	var body struct {
		Body            string  `json:"body"`
		ParentMessageID *string `json:"parentMessageId"`
		ImageID         *string `json:"imageId"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		writeErr(w, http.StatusBadRequest, "body required")
		return
	}
	if body.ParentMessageID != nil {
		var valid bool
		err = s.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM chat_messages
			 WHERE id=$1 AND workspace_id=$2 AND conversation_id=$3)`,
			*body.ParentMessageID, conversation.WorkspaceID, conversationID).Scan(&valid)
		if err != nil || !valid {
			writeErr(w, http.StatusBadRequest, "parent message must belong to the same conversation")
			return
		}
	}
	imageURL, err := s.uploadURL(r, conversation.WorkspaceID, body.ImageID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	message, err := scanMessage(s.db.QueryRow(r.Context(),
		`INSERT INTO chat_messages
		   (body, member_id, workspace_id, conversation_id, parent_message_id, image_url)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 RETURNING id::text, body, member_id::text, workspace_id::text, channel_id::text,
		           parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at`,
		body.Body, member.ID, conversation.WorkspaceID, conversationID, body.ParentMessageID, imageURL))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "message creation failed")
		return
	}
	_ = s.populateMessage(r.Context(), &message)
	s.hub.Publish(realtime.Event{Type: "message.created", WorkspaceID: conversation.WorkspaceID, Payload: message})
	writeJSON(w, http.StatusCreated, message)
}
