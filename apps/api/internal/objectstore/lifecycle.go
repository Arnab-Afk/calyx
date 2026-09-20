package objectstore

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RunDeletionWorker(ctx context.Context, pool *pgxpool.Pool, store Store) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		if err := ReconcileStaleUploads(ctx, pool); err != nil && ctx.Err() == nil {
			log.Printf("stale upload reconciliation: %v", err)
		}
		for {
			processed, err := CleanupOne(ctx, pool, store)
			if err != nil && ctx.Err() == nil {
				log.Printf("object deletion worker: %v", err)
			}
			if err != nil || !processed {
				break
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func ReconcileStaleUploads(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		WITH stale AS (
		  DELETE FROM chat_uploads
		  WHERE storage_status IN ('pending','failed')
		    AND created_at < NOW() - INTERVAL '15 minutes'
		  RETURNING id, workspace_id
		)
		INSERT INTO chat_object_deletions (object_key)
		SELECT 'workspaces/' || workspace_id::text || '/uploads/' || id::text FROM stale
		ON CONFLICT (object_key) DO NOTHING
	`)
	return err
}

func CleanupOne(ctx context.Context, pool *pgxpool.Pool, store Store) (bool, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	var key string
	err = tx.QueryRow(ctx, `
		SELECT object_key FROM chat_object_deletions
		WHERE available_at <= NOW()
		ORDER BY created_at
		FOR UPDATE SKIP LOCKED LIMIT 1
	`).Scan(&key)
	if err == pgx.ErrNoRows {
		_ = tx.Rollback(ctx)
		return false, nil
	}
	if err != nil {
		_ = tx.Rollback(ctx)
		return false, err
	}
	_, err = tx.Exec(ctx, `UPDATE chat_object_deletions
		SET attempts=attempts+1, available_at=NOW()+INTERVAL '5 minutes'
		WHERE object_key=$1`, key)
	if err != nil {
		_ = tx.Rollback(ctx)
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}

	if err := store.Delete(ctx, key); err != nil {
		_, _ = pool.Exec(ctx, `UPDATE chat_object_deletions SET last_error=$2 WHERE object_key=$1`, key, err.Error())
		return false, err
	}
	_, err = pool.Exec(ctx, `DELETE FROM chat_object_deletions WHERE object_key=$1`, key)
	return true, err
}

func Backfill(ctx context.Context, pool *pgxpool.Pool, store Store) (int, error) {
	rows, err := pool.Query(ctx, `
		SELECT id::text, workspace_id::text, content_type, data
		FROM chat_uploads
		WHERE data IS NOT NULL AND object_key IS NULL
		ORDER BY created_at
	`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	type upload struct {
		id, workspaceID, contentType string
		data                         []byte
	}
	var uploads []upload
	for rows.Next() {
		var item upload
		if err := rows.Scan(&item.id, &item.workspaceID, &item.contentType, &item.data); err != nil {
			return 0, err
		}
		uploads = append(uploads, item)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	completed := 0
	for _, item := range uploads {
		key := fmt.Sprintf("workspaces/%s/uploads/%s", item.workspaceID, item.id)
		if err := store.Put(ctx, key, item.contentType, item.data); err != nil {
			return completed, fmt.Errorf("backfill upload %s: %w", item.id, err)
		}
		result, err := pool.Exec(ctx, `UPDATE chat_uploads
			SET object_key=$2, storage_status='ready', data=NULL
			WHERE id=$1 AND data IS NOT NULL AND object_key IS NULL`, item.id, key)
		if err != nil {
			return completed, err
		}
		if result.RowsAffected() == 1 {
			completed++
		}
	}
	return completed, nil
}
