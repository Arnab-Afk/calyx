package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Arnab-Afk/calyx/apps/api/internal/auth"
	"github.com/Arnab-Afk/calyx/apps/api/internal/config"
	"github.com/Arnab-Afk/calyx/apps/api/internal/db"
	"github.com/Arnab-Afk/calyx/apps/api/internal/httpapi"
	"github.com/Arnab-Afk/calyx/apps/api/internal/realtime"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	ctx := context.Background()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("chat schema ready")

	hub := realtime.NewHub()
	authSvc := auth.NewService(cfg.JWTSecret, cfg.TokenTTL, cfg.JWTIssuer, cfg.JWTAudience)
	handler := httpapi.New(
		pool, authSvc, hub, cfg.CORSOrigins, cfg.CookieSecure, cfg.TokenTTL,
		cfg.CalyxAskURL, cfg.CalyxInternalKey,
	)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		log.Printf("calyx chat API listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Println("shutdown complete")
}
