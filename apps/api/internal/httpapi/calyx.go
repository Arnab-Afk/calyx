package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

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

	insert := func(text string, calyx any) (models.Message, error) {
		return scanMessage(s.db.QueryRow(r.Context(),
			`INSERT INTO chat_messages
			   (body, member_id, workspace_id, channel_id, parent_message_id, calyx_data, created_at)
			 VALUES ($1,$2,$3,$4,$5,$6, clock_timestamp())
			 RETURNING id::text, body, member_id::text, workspace_id::text, channel_id::text,
			           parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at`,
			text, member.ID, workspaceID, channelID, body.ParentMessageID, calyx))
	}

	// Persist the question immediately so it shows in the channel while Calyx thinks.
	question, err := insert(quillPlainBody(body.Query), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "question persistence failed")
		return
	}
	_ = s.populateMessage(r.Context(), &question)
	s.hub.Publish(realtime.Event{Type: "message.created", WorkspaceID: workspaceID, ChannelID: channelID, Payload: question})

	payloadMap := map[string]any{
		"message": body.Query,
		"actorId": fmt.Sprintf("web:%s:%s", workspaceID, member.ID),
	}
	if body.ParentMessageID != nil && strings.TrimSpace(*body.ParentMessageID) != "" {
		payloadMap["threadId"] = strings.TrimSpace(*body.ParentMessageID)
	}
	payload, _ := json.Marshal(payloadMap)
	endpoint := fmt.Sprintf("%s/v1/internal/workspaces/%s/ask", s.calyxAskURL, url.PathEscape(workspaceID))
	// Agent tool loops can exceed the default API client timeout.
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "investigation request failed")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Calyx-Internal-Key", s.calyxInternalKey)
	client := s.httpClient
	if client == nil || client.Timeout < 90*time.Second {
		client = &http.Client{Timeout: 95 * time.Second}
	}
	response, err := client.Do(req)
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

	message, err := insert(quillPlainBody(answer.Answer), trustedJSON)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "answer persistence failed")
		return
	}
	_ = s.populateMessage(r.Context(), &message)
	s.hub.Publish(realtime.Event{Type: "message.created", WorkspaceID: workspaceID, ChannelID: channelID, Payload: message})
	writeJSON(w, http.StatusCreated, map[string]any{"question": question, "message": message})
}

// quillPlainBody wraps plain text in the Quill delta JSON shape the web renderer expects.
func quillPlainBody(text string) string {
	text = strings.TrimRight(text, "\n")
	if text == "" {
		text = " "
	}
	payload, err := json.Marshal(map[string]any{
		"ops": []map[string]string{{"insert": text + "\n"}},
	})
	if err != nil {
		return `{"ops":[{"insert":"\n"}]}`
	}
	return string(payload)
}

// postInternalAlert posts an enriched alert card into the workspace's general channel.
// Auth: X-Calyx-Internal-Key (detector → chat API).
func (s *Server) postInternalAlert(w http.ResponseWriter, r *http.Request) {
	if s.calyxInternalKey == "" {
		writeErr(w, http.StatusServiceUnavailable, "internal alerts are not configured")
		return
	}
	supplied := strings.TrimSpace(r.Header.Get("X-Calyx-Internal-Key"))
	if supplied == "" || supplied != s.calyxInternalKey {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	workspaceID := chi.URLParam(r, "workspaceID")
	var body struct {
		Answer    string          `json:"answer"`
		ChartType string          `json:"chartType"`
		ChartData json.RawMessage `json:"chartData"`
		ToolNames []string        `json:"toolNames"`
	}
	if decodeJSON(r, &body) != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Answer = strings.TrimSpace(body.Answer)
	if body.Answer == "" {
		writeErr(w, http.StatusBadRequest, "answer is required")
		return
	}
	chartType := strings.TrimSpace(body.ChartType)
	if chartType == "" {
		chartType = "alert-card"
	}

	var channelID, memberID string
	err := s.db.QueryRow(r.Context(),
		`SELECT c.id::text, m.id::text
		 FROM chat_channels c
		 JOIN chat_workspaces w ON w.id = c.workspace_id
		 JOIN chat_members m ON m.workspace_id = w.id AND m.user_id = w.owner_id
		 WHERE c.workspace_id = $1 AND c.name = 'general'
		 LIMIT 1`,
		workspaceID,
	).Scan(&channelID, &memberID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace general channel not found")
		return
	}

	var chartData *string
	if len(body.ChartData) > 0 && string(body.ChartData) != "null" {
		value := string(body.ChartData)
		chartData = &value
	}
	trusted := models.CalyxData{
		Query:     "alert",
		Answer:    body.Answer,
		ChartType: &chartType,
		ChartData: chartData,
		ToolNames: body.ToolNames,
	}
	trustedJSON, _ := json.Marshal(trusted)

	message, err := scanMessage(s.db.QueryRow(r.Context(),
		`INSERT INTO chat_messages
		   (body, member_id, workspace_id, channel_id, calyx_data)
		 VALUES ($1,$2,$3,$4,$5)
		 RETURNING id::text, body, member_id::text, workspace_id::text, channel_id::text,
		           parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at`,
		body.Answer, memberID, workspaceID, channelID, trustedJSON))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "alert persistence failed")
		return
	}
	_ = s.populateMessage(r.Context(), &message)
	s.hub.Publish(realtime.Event{
		Type: "message.created", WorkspaceID: workspaceID, ChannelID: channelID, Payload: message,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"message": message})
}

// linkWorkspaceTenant best-effort maps a new chat workspace to the observability tenant
// so /calyx ask and MCP credentials work without a separate CLI step.
// Prefer CALYX_TENANT_ID (ops/mgmt tenant) over CALYX_DEFAULT_TENANT; never invent a tenant.
func (s *Server) linkWorkspaceTenant(ctx context.Context, workspaceID string) {
	if s.calyxAskURL == "" || s.calyxInternalKey == "" {
		return
	}
	tenant := strings.TrimSpace(s.calyxDefaultTenant)
	if tenant == "" {
		return
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
