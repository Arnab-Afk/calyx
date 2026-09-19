package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr            string
	DatabaseURL     string
	JWTSecret       string
	TokenTTL        time.Duration
	CORSOrigins     string
	CalyxAskURL     string // optional proxy to Node POST /v1/ask
}

func Load() Config {
	ttlHours := 720 // 30 days
	if v := os.Getenv("JWT_TTL_HOURS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			ttlHours = n
		}
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "dev-only-change-me-calyx-chat-api"
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":14000"
	}
	db := os.Getenv("DATABASE_URL")
	if db == "" {
		db = "postgres://calyx:calyx@localhost:15432/calyx"
	}
	return Config{
		Addr:        addr,
		DatabaseURL: db,
		JWTSecret:   secret,
		TokenTTL:    time.Duration(ttlHours) * time.Hour,
		CORSOrigins: envOr("CORS_ORIGINS", "*"),
		CalyxAskURL: os.Getenv("CALYX_ASK_URL"),
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
