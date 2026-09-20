package httpapi

import (
	"bytes"
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
		`INSERT INTO chat_uploads (workspace_id, member_id, content_type, size_bytes, data, storage_status)
		 VALUES ($1,$2,$3,$4,NULL,'pending') RETURNING id::text`,
		workspaceID, member.ID, contentType, len(data),
	).Scan(&uploadID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "upload persistence failed")
		return
	}
	objectKey := fmt.Sprintf("workspaces/%s/uploads/%s", workspaceID, uploadID)
	if err := s.objects.Put(r.Context(), objectKey, contentType, data); err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE chat_uploads SET storage_status='failed' WHERE id=$1`, uploadID)
		writeErr(w, http.StatusBadGateway, "object storage write failed")
		return
	}
	result, err := s.db.Exec(r.Context(), `UPDATE chat_uploads
		SET object_key=$2, storage_status='ready' WHERE id=$1 AND storage_status='pending'`, uploadID, objectKey)
	if err != nil || result.RowsAffected() != 1 {
		_ = s.objects.Delete(r.Context(), objectKey)
		_, _ = s.db.Exec(r.Context(), `UPDATE chat_uploads SET storage_status='failed' WHERE id=$1`, uploadID)
		writeErr(w, http.StatusInternalServerError, "upload finalization failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": uploadID, "contentType": contentType, "size": len(data),
		"url": fmt.Sprintf("/v1/uploads/%s", uploadID),
	})
}

func (s *Server) getUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadID")
	var workspaceID, contentType, status string
	var objectKey *string
	var legacyData []byte
	var size int
	if err := s.db.QueryRow(r.Context(),
		`SELECT workspace_id::text, content_type, size_bytes, object_key, storage_status, data
		 FROM chat_uploads WHERE id=$1`, uploadID,
	).Scan(&workspaceID, &contentType, &size, &objectKey, &status, &legacyData); err != nil {
		writeErr(w, http.StatusNotFound, "upload not found")
		return
	}
	if _, err := s.requireMember(r.Context(), workspaceID, userID(r.Context())); err != nil {
		writeErr(w, http.StatusNotFound, "upload not found")
		return
	}
	var reader io.ReadCloser
	if status == "ready" && objectKey != nil {
		var err error
		reader, err = s.objects.Get(r.Context(), *objectKey)
		if err != nil {
			writeErr(w, http.StatusBadGateway, "object storage read failed")
			return
		}
	} else if status == "legacy" && len(legacyData) > 0 {
		reader = io.NopCloser(bytes.NewReader(legacyData))
	} else {
		writeErr(w, http.StatusNotFound, "upload not available")
		return
	}
	defer reader.Close()
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", size))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, reader)
}

func (s *Server) uploadURL(r *http.Request, workspaceID string, uploadID *string) (*string, error) {
	if uploadID == nil {
		return nil, nil
	}
	var exists bool
	err := s.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM chat_uploads
		 WHERE id=$1 AND workspace_id=$2 AND storage_status IN ('ready','legacy'))`,
		*uploadID, workspaceID,
	).Scan(&exists)
	if err != nil || !exists {
		return nil, fmt.Errorf("upload does not belong to workspace")
	}
	value := fmt.Sprintf("/v1/uploads/%s", *uploadID)
	return &value, nil
}
