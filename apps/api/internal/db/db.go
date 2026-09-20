package db

import (
	"context"
	"crypto/sha256"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}

func VerifyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(entries)
	for _, path := range entries {
		contents, err := migrationFiles.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", path, err)
		}
		checksum := sha256.Sum256(contents)
		var stored []byte
		if err := pool.QueryRow(ctx,
			"SELECT checksum FROM chat_schema_migrations WHERE version=$1", path,
		).Scan(&stored); err != nil {
			return fmt.Errorf("required migration %s is not applied: %w", path, err)
		}
		if string(stored) != string(checksum[:]) {
			return fmt.Errorf("migration %s checksum differs from the deployed binary", path)
		}
	}
	return nil
}

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock(hashtext('calyx-chat-migrations'))"); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	defer conn.Exec(context.Background(), "SELECT pg_advisory_unlock(hashtext('calyx-chat-migrations'))")

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS chat_schema_migrations (
		version TEXT PRIMARY KEY,
		checksum BYTEA NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	entries, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(entries)
	for _, path := range entries {
		contents, err := migrationFiles.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", path, err)
		}
		checksum := sha256.Sum256(contents)
		var stored []byte
		err = conn.QueryRow(ctx, "SELECT checksum FROM chat_schema_migrations WHERE version=$1", path).Scan(&stored)
		if err == nil {
			if string(stored) != string(checksum[:]) {
				return fmt.Errorf("migration %s checksum changed after application", path)
			}
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("read migration ledger for %s: %w", path, err)
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", path, err)
		}
		if _, err = tx.Exec(ctx, string(contents)); err == nil {
			_, err = tx.Exec(ctx,
				"INSERT INTO chat_schema_migrations (version,checksum) VALUES ($1,$2)",
				path, checksum[:],
			)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", path, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", path, err)
		}
	}
	return nil
}
