package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Arnab-Afk/calyx/apps/api/internal/auth"
	"github.com/Arnab-Afk/calyx/apps/api/internal/models"
	"github.com/Arnab-Afk/calyx/apps/api/internal/objectstore"
	"github.com/Arnab-Afk/calyx/apps/api/internal/realtime"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"nhooyr.io/websocket"
)

const sessionCookie = "calyx_session"

type Server struct {
	db                 *pgxpool.Pool
	auth               *auth.Service
	hub                *realtime.Hub
	objects            objectstore.Store
	cookieSecure       bool
	cookieSameSite     http.SameSite
	cookieDomain       string
	cookieTTL          time.Duration
	wsOrigins          []string
	calyxAskURL        string
	calyxInternalKey   string
	calyxDefaultTenant string
	googleClientID     string
	googleClientSecret string
	googleRedirectURL  string
	githubClientID     string
	githubClientSecret string
	githubRedirectURL  string
	webAppURL          string
	httpClient         *http.Client
}

func New(
	db *pgxpool.Pool,
	authSvc *auth.Service,
	hub *realtime.Hub,
	objects objectstore.Store,
	corsOrigins string,
	cookieSecure bool,
	cookieSameSite http.SameSite,
	cookieDomain string,
	cookieTTL time.Duration,
	calyxAskURL, calyxInternalKey, calyxDefaultTenant string,
	googleClientID, googleClientSecret, googleRedirectURL, webAppURL string,
	githubClientID, githubClientSecret, githubRedirectURL string,
) http.Handler {
	origins := strings.Split(corsOrigins, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	s := &Server{
		db: db, auth: authSvc, hub: hub, objects: objects,
		cookieSecure: cookieSecure, cookieSameSite: cookieSameSite, cookieDomain: cookieDomain,
		cookieTTL: cookieTTL, wsOrigins: websocketOrigins(corsOrigins),
		calyxAskURL: strings.TrimRight(calyxAskURL, "/"), calyxInternalKey: calyxInternalKey,
		calyxDefaultTenant: calyxDefaultTenant,
		googleClientID:     strings.TrimSpace(googleClientID),
		googleClientSecret: strings.TrimSpace(googleClientSecret),
		googleRedirectURL:  strings.TrimSpace(googleRedirectURL),
		githubClientID:     strings.TrimSpace(githubClientID),
		githubClientSecret: strings.TrimSpace(githubClientSecret),
		githubRedirectURL:  strings.TrimSpace(githubRedirectURL),
		webAppURL:          strings.TrimRight(strings.TrimSpace(webAppURL), "/"),
		httpClient:         &http.Client{Timeout: 25 * time.Second},
	}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)
	r.Use(maxRequestBody(1<<20, 6<<20))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "calyx-chat-api"})
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := s.db.Ping(ctx); err != nil {
			writeErr(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}
		if err := s.hub.Ready(ctx); err != nil {
			writeErr(w, http.StatusServiceUnavailable, "redis unavailable")
			return
		}
		if err := s.objects.Ready(ctx); err != nil {
			writeErr(w, http.StatusServiceUnavailable, "object storage unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "calyx-chat-api"})
	})

	r.Route("/v1", func(r chi.Router) {
		r.Post("/auth/register", s.register)
		r.Post("/auth/login", s.login)
		r.Post("/auth/logout", s.logout)
		r.Get("/auth/google", s.googleStart)
		r.Get("/auth/google/callback", s.googleCallback)
		r.Get("/auth/github", s.githubStart)
		r.Get("/auth/github/callback", s.githubCallback)

		// Service-to-service: detector posts enriched alerts into the workspace default channel.
		r.Post("/internal/workspaces/{workspaceID}/alerts", s.postInternalAlert)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Get("/auth/me", s.me)

			r.Get("/workspaces", s.listWorkspaces)
			r.Post("/workspaces", s.createWorkspace)
			r.Post("/workspaces/join", s.joinWorkspace)
			r.Get("/workspaces/{workspaceID}", s.getWorkspace)
			r.Get("/workspaces/{workspaceID}/info", s.getWorkspaceInfo)
			r.Patch("/workspaces/{workspaceID}", s.updateWorkspace)
			r.Delete("/workspaces/{workspaceID}", s.deleteWorkspace)
			r.Post("/workspaces/{workspaceID}/join-code", s.rotateJoinCode)
			r.Post("/workspaces/{workspaceID}/invites", s.inviteToWorkspace)
			r.Post("/workspaces/{workspaceID}/share-project", s.shareProject)
			r.Get("/workspaces/{workspaceID}/mcp-credentials", s.listMCPCredentials)
			r.Post("/workspaces/{workspaceID}/mcp-credentials", s.createMCPCredential)
			r.Delete("/workspaces/{workspaceID}/mcp-credentials/{credentialID}", s.revokeMCPCredential)

			r.Get("/workspaces/{workspaceID}/members", s.listMembers)
			r.Post("/workspaces/{workspaceID}/uploads", s.createUpload)
			r.Get("/uploads/{uploadID}", s.getUpload)
			r.Get("/workspaces/{workspaceID}/members/me", s.currentMember)
			r.Get("/members/{memberID}", s.getMember)
			r.Patch("/members/{memberID}", s.updateMember)
			r.Delete("/members/{memberID}", s.deleteMember)
			r.Get("/workspaces/{workspaceID}/channels", s.listChannels)
			r.Post("/workspaces/{workspaceID}/channels", s.createChannel)

			r.Get("/channels/{channelID}", s.getChannel)
			r.Patch("/channels/{channelID}", s.renameChannel)
			r.Delete("/channels/{channelID}", s.deleteChannel)
			r.Get("/channels/{channelID}/messages", s.listMessages)
			r.Post("/channels/{channelID}/messages", s.createMessage)
			r.Post("/channels/{channelID}/calyx", s.askCalyx)

			r.Post("/workspaces/{workspaceID}/conversations", s.createOrGetConversation)
			r.Get("/conversations/{conversationID}", s.getConversation)
			r.Get("/conversations/{conversationID}/messages", s.listConversationMessages)
			r.Post("/conversations/{conversationID}/messages", s.createConversationMessage)

			r.Get("/messages/{messageID}", s.getMessage)
			r.Patch("/messages/{messageID}", s.updateMessage)
			r.Delete("/messages/{messageID}", s.deleteMessage)
			r.Post("/messages/{messageID}/reactions", s.toggleReaction)

			r.Get("/workspaces/{workspaceID}/ws", s.workspaceWS)
		})
	})

	return r
}

type ctxKey string

const userIDKey ctxKey = "userID"

func maxRequestBody(defaultLimit, uploadLimit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			limit := defaultLimit
			if strings.Contains(r.URL.Path, "/uploads") {
				limit = uploadLimit
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}

func websocketOrigins(origins string) []string {
	patterns := make([]string, 0)
	for _, origin := range strings.Split(origins, ",") {
		parsed, err := url.Parse(strings.TrimSpace(origin))
		if err == nil && parsed.Host != "" {
			patterns = append(patterns, parsed.Host)
		}
	}
	return patterns
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var token string
		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			token = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		} else if cookie, err := r.Cookie(sessionCookie); err == nil {
			token = cookie.Value
		}
		if token == "" {
			writeErr(w, http.StatusUnauthorized, "missing session")
			return
		}
		claims, err := s.auth.ParseToken(token)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", HttpOnly: true,
		Secure: s.cookieSecure, SameSite: s.cookieSameSite, Domain: s.cookieDomain,
		MaxAge: int(s.cookieTTL.Seconds()),
	})
}

func (s *Server) logout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", HttpOnly: true,
		Secure: s.cookieSecure, SameSite: s.cookieSameSite, Domain: s.cookieDomain,
		MaxAge: -1,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func userID(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func joinCode() string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, 6)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		b[i] = alphabet[n.Int64()]
	}
	return string(b)
}

// ── Auth ────────────────────────────────────────────────────────────────────

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	body.Name = strings.TrimSpace(body.Name)
	if body.Email == "" || len(body.Password) < 8 || body.Name == "" {
		writeErr(w, http.StatusBadRequest, "email, name, and password (8+) required")
		return
	}
	hash, err := s.auth.HashPassword(body.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash failed")
		return
	}
	var u models.User
	err = s.db.QueryRow(r.Context(),
		`INSERT INTO chat_users (email, name, password_hash) VALUES ($1,$2,$3)
		 RETURNING id::text, email, name, image, created_at`,
		body.Email, body.Name, hash,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			writeErr(w, http.StatusConflict, "email already registered")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	token, err := s.auth.IssueToken(u.ID, u.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token failed")
		return
	}
	s.setSessionCookie(w, token)
	s.acceptPendingInvites(r.Context(), u.ID, u.Email)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": u})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	var u models.User
	var hash string
	err := s.db.QueryRow(r.Context(),
		`SELECT id::text, email, name, image, created_at, password_hash FROM chat_users WHERE email=$1`,
		body.Email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt, &hash)
	if err != nil || !s.auth.CheckPassword(hash, body.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := s.auth.IssueToken(u.ID, u.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token failed")
		return
	}
	s.setSessionCookie(w, token)
	s.acceptPendingInvites(r.Context(), u.ID, u.Email)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.getUser(r.Context(), userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) getUser(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := s.db.QueryRow(ctx,
		`SELECT id::text, email, name, image, created_at FROM chat_users WHERE id=$1`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ── Workspaces ──────────────────────────────────────────────────────────────

func (s *Server) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	uid := userID(r.Context())
	rows, err := s.db.Query(r.Context(),
		`SELECT `+workspaceSelect+`
		 FROM chat_workspaces w
		 JOIN chat_members m ON m.workspace_id = w.id
		 WHERE m.user_id=$1
		 ORDER BY w.created_at DESC`, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	out := []models.Workspace{}
	for rows.Next() {
		ws, err := scanWorkspace(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, ws)
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": out})
}

func (s *Server) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if len(body.Name) < 3 || len(body.Name) > 40 {
		writeErr(w, http.StatusBadRequest, "name must be 3-40 chars")
		return
	}
	uid := userID(r.Context())
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	code := joinCode()
	var ws models.Workspace
	row := tx.QueryRow(r.Context(),
		`INSERT INTO chat_workspaces (name, join_code, owner_id) VALUES ($1,$2,$3)
		 RETURNING `+workspaceReturning,
		body.Name, code, uid,
	)
	ws, err = scanWorkspace(row)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	var memberID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO chat_members (user_id, workspace_id, role) VALUES ($1,$2,'admin') RETURNING id::text`,
		uid, ws.ID,
	).Scan(&memberID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, err = tx.Exec(r.Context(),
		`INSERT INTO chat_channels (name, workspace_id) VALUES ('general', $1)`, ws.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.linkWorkspaceTenant(r.Context(), ws.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"workspace": ws, "memberId": memberID})
}

func (s *Server) joinWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		JoinCode    string `json:"joinCode"`
		WorkspaceID string `json:"workspaceId"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.JoinCode = strings.ToLower(strings.TrimSpace(body.JoinCode))
	ws, err := scanWorkspace(s.db.QueryRow(r.Context(),
		`SELECT `+workspaceSelect+` FROM chat_workspaces w WHERE w.id=$1`,
		body.WorkspaceID,
	))
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if ws.JoinCode != body.JoinCode {
		writeErr(w, http.StatusForbidden, "invalid join code")
		return
	}
	uid := userID(r.Context())
	_, err = s.db.Exec(r.Context(),
		`INSERT INTO chat_members (user_id, workspace_id, role) VALUES ($1,$2,'member')
		 ON CONFLICT (workspace_id, user_id) DO NOTHING`,
		uid, ws.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspace": ws})
}

func (s *Server) getWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	if _, err := s.requireMember(r.Context(), wsID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	ws, err := scanWorkspace(s.db.QueryRow(r.Context(),
		`SELECT `+workspaceSelect+` FROM chat_workspaces w WHERE w.id=$1`, wsID,
	))
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) rotateJoinCode(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	m, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil || m.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	code := joinCode()
	_, err = s.db.Exec(r.Context(), `UPDATE chat_workspaces SET join_code=$1 WHERE id=$2`, code, wsID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"joinCode": code})
}

func (s *Server) requireMember(ctx context.Context, workspaceID, uid string) (*models.Member, error) {
	var m models.Member
	err := s.db.QueryRow(ctx,
		`SELECT id::text, user_id::text, workspace_id::text, role, created_at
		 FROM chat_members WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, uid,
	).Scan(&m.ID, &m.UserID, &m.WorkspaceID, &m.Role, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	if _, err := s.requireMember(r.Context(), wsID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	rows, err := s.db.Query(r.Context(),
		`SELECT m.id::text, m.user_id::text, m.workspace_id::text, m.role, m.created_at,
		        u.id::text, u.email, u.name, u.image, u.created_at
		 FROM chat_members m
		 JOIN chat_users u ON u.id = m.user_id
		 WHERE m.workspace_id=$1
		 ORDER BY m.created_at ASC`, wsID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	out := []models.Member{}
	for rows.Next() {
		var m models.Member
		var u models.User
		if err := rows.Scan(&m.ID, &m.UserID, &m.WorkspaceID, &m.Role, &m.CreatedAt,
			&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		m.User = &u
		out = append(out, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": out})
}

// ── Channels ────────────────────────────────────────────────────────────────

func (s *Server) listChannels(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	if _, err := s.requireMember(r.Context(), wsID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	rows, err := s.db.Query(r.Context(),
		`SELECT id::text, name, workspace_id::text, created_at FROM chat_channels
		 WHERE workspace_id=$1 ORDER BY name ASC`, wsID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	out := []models.Channel{}
	for rows.Next() {
		var c models.Channel
		if err := rows.Scan(&c.ID, &c.Name, &c.WorkspaceID, &c.CreatedAt); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"channels": out})
}

func (s *Server) createChannel(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	m, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil || m.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Name = strings.TrimSpace(strings.ToLower(body.Name))
	if body.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	var c models.Channel
	err = s.db.QueryRow(r.Context(),
		`INSERT INTO chat_channels (name, workspace_id) VALUES ($1,$2)
		 RETURNING id::text, name, workspace_id::text, created_at`,
		body.Name, wsID,
	).Scan(&c.ID, &c.Name, &c.WorkspaceID, &c.CreatedAt)
	if err != nil {
		writeErr(w, http.StatusConflict, "channel exists or create failed")
		return
	}
	s.hub.Publish(realtime.Event{Type: "channel.created", WorkspaceID: wsID, Payload: c})
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) channelWorkspace(ctx context.Context, channelID string) (string, error) {
	var wsID string
	err := s.db.QueryRow(ctx, `SELECT workspace_id::text FROM chat_channels WHERE id=$1`, channelID).Scan(&wsID)
	return wsID, err
}

func (s *Server) renameChannel(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	wsID, err := s.channelWorkspace(r.Context(), channelID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	m, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil || m.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Name = strings.TrimSpace(strings.ToLower(body.Name))
	var c models.Channel
	err = s.db.QueryRow(r.Context(),
		`UPDATE chat_channels SET name=$1 WHERE id=$2
		 RETURNING id::text, name, workspace_id::text, created_at`,
		body.Name, channelID,
	).Scan(&c.ID, &c.Name, &c.WorkspaceID, &c.CreatedAt)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) deleteChannel(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	wsID, err := s.channelWorkspace(r.Context(), channelID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	m, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil || m.Role != "admin" {
		writeErr(w, http.StatusForbidden, "admin required")
		return
	}
	_, err = s.db.Exec(r.Context(), `DELETE FROM chat_channels WHERE id=$1`, channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Messages ────────────────────────────────────────────────────────────────

func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	wsID, err := s.channelWorkspace(r.Context(), channelID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	if _, err := s.requireMember(r.Context(), wsID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	parent := r.URL.Query().Get("parentMessageId")

	var rows pgx.Rows
	if parent != "" {
		rows, err = s.db.Query(r.Context(),
			`SELECT id::text, body, member_id::text, workspace_id::text, channel_id::text,
			        parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at
			 FROM chat_messages
			 WHERE channel_id=$1 AND parent_message_id=$2
			 ORDER BY created_at ASC, id ASC LIMIT $3`, channelID, parent, limit)
	} else {
		rows, err = s.db.Query(r.Context(),
			`SELECT id::text, body, member_id::text, workspace_id::text, channel_id::text,
			        parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at
			 FROM chat_messages
			 WHERE channel_id=$1 AND parent_message_id IS NULL
			 ORDER BY created_at DESC, id DESC LIMIT $2`, channelID, limit)
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	msgs := []models.Message{}
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		msgs = append(msgs, msg)
	}
	for i := range msgs {
		_ = s.populateMessage(r.Context(), &msgs[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

type scannable interface {
	Scan(dest ...any) error
}

func scanMessage(row scannable) (models.Message, error) {
	var m models.Message
	var calyx []byte
	err := row.Scan(&m.ID, &m.Body, &m.MemberID, &m.WorkspaceID, &m.ChannelID,
		&m.ParentMessageID, &m.ConversationID, &m.ImageURL, &calyx, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return m, err
	}
	if len(calyx) > 0 {
		var cd models.CalyxData
		if json.Unmarshal(calyx, &cd) == nil {
			m.CalyxData = &cd
		}
	}
	return m, nil
}

func (s *Server) populateMessage(ctx context.Context, m *models.Message) error {
	var mem models.Member
	var u models.User
	err := s.db.QueryRow(ctx,
		`SELECT m.id::text, m.user_id::text, m.workspace_id::text, m.role, m.created_at,
		        u.id::text, u.email, u.name, u.image, u.created_at
		 FROM chat_members m JOIN chat_users u ON u.id=m.user_id WHERE m.id=$1`, m.MemberID,
	).Scan(&mem.ID, &mem.UserID, &mem.WorkspaceID, &mem.Role, &mem.CreatedAt,
		&u.ID, &u.Email, &u.Name, &u.Image, &u.CreatedAt)
	if err == nil {
		mem.User = &u
		m.Member = &mem
	}
	_ = s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM chat_messages WHERE parent_message_id=$1`, m.ID,
	).Scan(&m.ThreadCount)

	rows, err := s.db.Query(ctx,
		`SELECT value, COUNT(*)::int, MIN(id::text), ARRAY_AGG(member_id::text)
		 FROM chat_reactions WHERE message_id=$1 GROUP BY value`, m.ID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	m.Reactions = []models.Reaction{}
	for rows.Next() {
		var rx models.Reaction
		if err := rows.Scan(&rx.Value, &rx.Count, &rx.ID, &rx.MemberIDs); err != nil {
			return err
		}
		rx.MessageID = m.ID
		m.Reactions = append(m.Reactions, rx)
	}
	return nil
}

func (s *Server) createMessage(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	wsID, err := s.channelWorkspace(r.Context(), channelID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	mem, err := s.requireMember(r.Context(), wsID, userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	var body struct {
		Body            string  `json:"body"`
		ParentMessageID *string `json:"parentMessageId"`
		ImageID         *string `json:"imageId"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		writeErr(w, http.StatusBadRequest, "body required")
		return
	}
	if body.ParentMessageID != nil {
		var validParent bool
		err = s.db.QueryRow(r.Context(),
			`SELECT EXISTS(
			   SELECT 1 FROM chat_messages
			   WHERE id=$1 AND workspace_id=$2 AND channel_id=$3
			 )`, *body.ParentMessageID, wsID, channelID,
		).Scan(&validParent)
		if err != nil || !validParent {
			writeErr(w, http.StatusBadRequest, "parent message must belong to the same channel")
			return
		}
	}
	imageURL, err := s.uploadURL(r, wsID, body.ImageID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	row := s.db.QueryRow(r.Context(),
		`INSERT INTO chat_messages (body, member_id, workspace_id, channel_id, parent_message_id, image_url, upload_id, calyx_data)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING id::text, body, member_id::text, workspace_id::text, channel_id::text,
		           parent_message_id::text, conversation_id::text, image_url, calyx_data, created_at, updated_at`,
		body.Body, mem.ID, wsID, channelID, body.ParentMessageID, imageURL, body.ImageID, nil,
	)
	msg, err := scanMessage(row)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = s.populateMessage(r.Context(), &msg)
	s.hub.Publish(realtime.Event{
		Type: "message.created", WorkspaceID: wsID, ChannelID: channelID, Payload: msg,
	})
	writeJSON(w, http.StatusCreated, msg)
}

func (s *Server) updateMessage(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	var body struct {
		Body string `json:"body"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		writeErr(w, http.StatusBadRequest, "body required")
		return
	}
	uid := userID(r.Context())
	row := s.db.QueryRow(r.Context(),
		`UPDATE chat_messages m SET body=$1, updated_at=NOW()
		 FROM chat_members mem
		 WHERE m.id=$2 AND m.member_id=mem.id AND mem.user_id=$3
		 RETURNING m.id::text, m.body, m.member_id::text, m.workspace_id::text, m.channel_id::text,
		           m.parent_message_id::text, m.conversation_id::text, m.image_url, m.calyx_data, m.created_at, m.updated_at`,
		body.Body, msgID, uid,
	)
	msg, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusForbidden, "cannot edit")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = s.populateMessage(r.Context(), &msg)
	ch := ""
	if msg.ChannelID != nil {
		ch = *msg.ChannelID
	}
	s.hub.Publish(realtime.Event{Type: "message.updated", WorkspaceID: msg.WorkspaceID, ChannelID: ch, Payload: msg})
	writeJSON(w, http.StatusOK, msg)
}

func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	uid := userID(r.Context())
	var wsID string
	var channelID *string
	err := s.db.QueryRow(r.Context(),
		`DELETE FROM chat_messages m
		 USING chat_members mem
		 WHERE m.id=$1 AND m.member_id=mem.id AND mem.user_id=$2
		 RETURNING m.workspace_id::text, m.channel_id::text`,
		msgID, uid,
	).Scan(&wsID, &channelID)
	if err != nil {
		writeErr(w, http.StatusForbidden, "cannot delete")
		return
	}
	ch := ""
	if channelID != nil {
		ch = *channelID
	}
	s.hub.Publish(realtime.Event{
		Type: "message.deleted", WorkspaceID: wsID, ChannelID: ch,
		Payload: map[string]string{"id": msgID},
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) toggleReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	var body struct {
		Value string `json:"value"`
	}
	if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Value) == "" {
		writeErr(w, http.StatusBadRequest, "value required")
		return
	}
	uid := userID(r.Context())
	var wsID, memberID string
	err := s.db.QueryRow(r.Context(),
		`SELECT m.workspace_id::text, mem.id::text
		 FROM chat_messages m
		 JOIN chat_members mem ON mem.workspace_id=m.workspace_id AND mem.user_id=$2
		 LEFT JOIN chat_conversations c ON c.id=m.conversation_id
		 WHERE m.id=$1 AND (m.conversation_id IS NULL OR mem.id IN (c.member_one_id, c.member_two_id))`, msgID, uid,
	).Scan(&wsID, &memberID)
	if err != nil {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	tag, err := s.db.Exec(r.Context(),
		`DELETE FROM chat_reactions WHERE message_id=$1 AND member_id=$2 AND value=$3`,
		msgID, memberID, body.Value)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	added := false
	if tag.RowsAffected() == 0 {
		_, err = s.db.Exec(r.Context(),
			`INSERT INTO chat_reactions (workspace_id, message_id, member_id, value) VALUES ($1,$2,$3,$4)`,
			wsID, msgID, memberID, body.Value)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		added = true
	}
	s.hub.Publish(realtime.Event{
		Type: "reaction.updated", WorkspaceID: wsID,
		Payload: map[string]string{"messageId": msgID},
	})
	writeJSON(w, http.StatusOK, map[string]any{"added": added, "value": body.Value})
}

// ── WebSocket ───────────────────────────────────────────────────────────────

func (s *Server) workspaceWS(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceID")
	if _, err := s.requireMember(r.Context(), wsID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: s.wsOrigins,
	})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	c, ch := s.hub.Subscribe(wsID)
	defer s.hub.Unsubscribe(c)

	ctx := r.Context()
	go func() {
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				return
			}
		}
	}()

	_ = conn.Write(ctx, websocket.MessageText, []byte(`{"type":"connected"}`))
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(writeCtx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
