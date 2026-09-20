package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr             string
	DatabaseURL      string
	JWTSecret        string
	JWTIssuer        string
	JWTAudience      string
	TokenTTL         time.Duration
	CORSOrigins      string
	CookieSecure     bool
	CalyxAskURL      string
	CalyxInternalKey string
}

func Load() (Config, error) {
	environment := strings.ToLower(envOr("APP_ENV", "development"))
	production := environment == "production"

	ttlHours := 24
	if v := os.Getenv("JWT_TTL_HOURS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 || n > 720 {
			return Config{}, fmt.Errorf("JWT_TTL_HOURS must be between 1 and 720")
		}
		ttlHours = n
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" && !production {
		secret = "dev-only-change-me-calyx-chat-api"
	}
	if len(secret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must contain at least 32 characters")
	}

	corsOrigins := envOr("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
	if production && strings.Contains(corsOrigins, "*") {
		return Config{}, fmt.Errorf("CORS_ORIGINS must list explicit origins in production")
	}
	calyxAskURL := os.Getenv("CALYX_ASK_URL")
	calyxInternalKey := os.Getenv("CALYX_INTERNAL_API_KEY")
	if (calyxAskURL == "") != (calyxInternalKey == "") {
		return Config{}, fmt.Errorf("CALYX_ASK_URL and CALYX_INTERNAL_API_KEY must be configured together")
	}

	return Config{
		Addr:             envOr("ADDR", ":14000"),
		DatabaseURL:      envOr("DATABASE_URL", "postgres://calyx:calyx@localhost:15432/calyx"),
		JWTSecret:        secret,
		JWTIssuer:        envOr("JWT_ISSUER", "calyx-chat-api"),
		JWTAudience:      envOr("JWT_AUDIENCE", "calyx-web"),
		TokenTTL:         time.Duration(ttlHours) * time.Hour,
		CORSOrigins:      corsOrigins,
		CookieSecure:     production,
		CalyxAskURL:      calyxAskURL,
		CalyxInternalKey: calyxInternalKey,
	}, nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
