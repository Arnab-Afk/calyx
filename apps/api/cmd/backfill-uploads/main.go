package main

import (
	"context"
	"log"
	"os"
	"strconv"

	"github.com/Arnab-Afk/calyx/apps/api/internal/db"
	"github.com/Arnab-Afk/calyx/apps/api/internal/objectstore"
)

func required(name string) string {
	value := os.Getenv(name)
	if value == "" {
		log.Fatalf("%s is required", name)
	}
	return value
}

func main() {
	ctx := context.Background()
	pool, err := db.Connect(ctx, required("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()
	if err := db.VerifyMigrations(ctx, pool); err != nil {
		log.Fatalf("database schema: %v", err)
	}
	pathStyle, err := strconv.ParseBool(os.Getenv("OBJECT_STORAGE_PATH_STYLE"))
	if err != nil {
		log.Fatalf("OBJECT_STORAGE_PATH_STYLE: %v", err)
	}
	region := os.Getenv("OBJECT_STORAGE_REGION")
	if region == "" {
		region = "auto"
	}
	store, err := objectstore.NewS3(ctx, objectstore.Config{
		Endpoint: required("OBJECT_STORAGE_ENDPOINT"), Region: region,
		Bucket:          required("OBJECT_STORAGE_BUCKET"),
		AccessKeyID:     required("OBJECT_STORAGE_ACCESS_KEY_ID"),
		SecretAccessKey: required("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
		UsePathStyle:    pathStyle,
	})
	if err != nil {
		log.Fatalf("object storage: %v", err)
	}
	count, err := objectstore.Backfill(ctx, pool, store)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("backfilled %d uploads", count)
}
