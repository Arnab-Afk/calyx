package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/Arnab-Afk/calyx/apps/api/internal/models"
	"github.com/Arnab-Afk/calyx/apps/api/internal/realtime"
	"github.com/go-chi/chi/v5"
)

type calyxAskResponse struct {
	Answer        string `json:"answer"`
	ToolCallsMade []struct {
		ToolName string `json:"toolName"`
		Summary  string `json:"summary"`
	} `json:"toolCallsMade"`
	ChartType *string         `json:"chartType"`
	ChartData json.RawMessage `json:"chartData"`
}

func (s *Server) askCalyx(w http.ResponseWriter, r *http.Request) {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		writeErr(w, http.StatusServiceUnavailable, "Calyx investigation service is not configured")
		return
	}
	channelID := chi.URLParam(r, "channelID")
	workspaceID, err := s.channelWorkspace(r.Context(), channelID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	member, err := s.requireMember(r.Context(), workspaceID, userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	var body struct {
		Query           string  `json:"query"`
		ParentMessageID *string `json:"parentMessageId"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Query = strings.TrimSpace(body.Query)
	if body.Query == "" || len(body.Query) > 4000 {
		writeErr(w, http.StatusBadRequest, "query must contain 1-4000 characters")
		return
	}
	if body.ParentMessageID != nil {
		var valid bool
		err = s.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM chat_messages WHERE id=$1 AND workspace_id=$2 AND channel_id=$3)`,
			*body.ParentMessageID, workspaceID, channelID).Scan(&valid)
		if err != nil || !valid {
			writeErr(w, http.StatusBadRequest, "parent message must belong to the same channel")
			return
		}
	}

	payload, _ := json.Marshal(map[string]any{
		"message":  body.Query,
		"threadId": body.ParentMessageID,
		"actorId":  fmt.Sprintf("web:%s:%s", workspaceID, member.ID),
	})
	endpoint := fmt.Sprintf("%s/v1/internal/workspaces/%s/ask", s.calyxAskURL, url.PathEscape(workspaceID))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "investigation request failed")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Calyx-Internal-Key", s.calyxInternalKey)
	response, err := s.httpClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Calyx investigation service unavailable")
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		writeErr(w, http.StatusBadGateway, "Calyx investigation failed")
		return
	}
	var answer calyxAskResponse
	if json.NewDecoder(http.MaxBytesReader(w, response.Body, 2<<20)).Decode(&answer) != nil || strings.TrimSpace(answer.Answer) == "" {
		writeErr(w, http.StatusBadGateway, "Calyx returned an invalid response")
		return
	}

	toolNames := make([]string, 0, len(answer.ToolCallsMade))
	for _, call := range answer.ToolCallsMade {
		toolNames = append(toolNames, call.ToolName)
	}
	var chartData *string
	if len(answer.ChartData) > 0 && string(answer.ChartData) != "null" {
		value := string(answer.ChartData)
		chartData = &value
	}
	trusted := models.CalyxData{
		Query: body.Query, Answer: answer.Answer, ChartType: answer.ChartType,
		ChartData: chartData, ToolNames: toolNames,
	}
	trustedJSON, _ := json.Marshal(trusted)

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "message transaction failed")
		return
	}
	defer tx.Rollback(r.Context())
	insert := func(text string, calyx any) (models.Message, error) {
		return scanMessage(tx.QueryRow(r.Context(),
			`INSERT INTO chat_messages
			   (body, member_id, workspace_id, channel_id, parent_message_id, calyx_data)
			 VALUES ($1,$2,$3,$4,$5,$6)
			 RETURNING id::text, body, member_id::text, workspace_id::text, channel_id::text,
			           parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at`,
			text, member.ID, workspaceID, channelID, body.ParentMessageID, calyx))
	}
	question, err := insert(body.Query, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "question persistence failed")
		return
	}
	message, err := insert(answer.Answer, trustedJSON)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "answer persistence failed")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeErr(w, http.StatusInternalServerError, "message transaction failed")
		return
	}
	_ = s.populateMessage(r.Context(), &question)
	_ = s.populateMessage(r.Context(), &message)
	s.hub.Publish(realtime.Event{Type: "message.created", WorkspaceID: workspaceID, ChannelID: channelID, Payload: question})
	s.hub.Publish(realtime.Event{Type: "message.created", WorkspaceID: workspaceID, ChannelID: channelID, Payload: message})
	writeJSON(w, http.StatusCreated, map[string]any{"question": question, "message": message})
}

// linkWorkspaceTenant best-effort maps a new chat workspace to the observability tenant
// so /calyx ask and MCP credentials work without a separate CLI step.
func (s *Server) linkWorkspaceTenant(ctx context.Context, workspaceID string) {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		return
	}
	tenant := strings.TrimSpace(s.calyxDefaultTenant)
	if tenant == "" {
		tenant = "default"
	}
	payload, _ := json.Marshal(map[string]string{"tenantId": tenant})
	endpoint := fmt.Sprintf("%s/v1/internal/workspaces/%s/link", s.calyxAskURL, url.PathEscape(workspaceID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
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
}
