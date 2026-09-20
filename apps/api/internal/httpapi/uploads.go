package httpapi

import (
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

const maxUploadBytes = 5 << 20

var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

func (s *Server) createUpload(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceID")
	member, err := s.requireMember(r.Context(), workspaceID, userID(r.Context()))
	if err != nil {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeErr(w, http.StatusRequestEntityTooLarge, "upload must be a multipart image up to 5 MiB")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxUploadBytes {
		writeErr(w, http.StatusRequestEntityTooLarge, "image must contain 1 byte to 5 MiB")
		return
	}
	contentType := http.DetectContentType(data)
	if !allowedImageTypes[contentType] {
		writeErr(w, http.StatusUnsupportedMediaType, "only JPEG, PNG, GIF, and WebP images are supported")
		return
	}
	var uploadID string
	err = s.db.QueryRow(r.Context(),
		`INSERT INTO chat_uploads (workspace_id, member_id, content_type, size_bytes, data)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
		workspaceID, member.ID, contentType, len(data), data,
	).Scan(&uploadID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "upload persistence failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": uploadID, "contentType": contentType, "size": len(data),
		"url": fmt.Sprintf("/v1/uploads/%s", uploadID),
	})
}

func (s *Server) getUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadID")
	var workspaceID, contentType string
	var size int
	if err := s.db.QueryRow(r.Context(),
		`SELECT workspace_id::text, content_type, size_bytes FROM chat_uploads WHERE id=$1`, uploadID,
	).Scan(&workspaceID, &contentType, &size); err != nil {
		writeErr(w, http.StatusNotFound, "upload not found")
		return
	}
	if _, err := s.requireMember(r.Context(), workspaceID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusNotFound, "upload not found")
		return
	}
	var data []byte
	if err := s.db.QueryRow(r.Context(), `SELECT data FROM chat_uploads WHERE id=$1`, uploadID).Scan(&data); err != nil {
		writeErr(w, http.StatusNotFound, "upload not found")
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", size))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *Server) uploadURL(r *http.Request, workspaceID string, uploadID *string) (*string, error) {
	if uploadID == nil {
		return nil, nil
	}
	var exists bool
	err := s.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM chat_uploads WHERE id=$1 AND workspace_id=$2)`,
		*uploadID, workspaceID,
	).Scan(&exists)
	if err != nil || !exists {
		return nil, fmt.Errorf("upload does not belong to workspace")
	}
	value := fmt.Sprintf("/v1/uploads/%s", *uploadID)
	return &value, nil
}
