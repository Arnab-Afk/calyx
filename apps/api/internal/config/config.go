package config

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr               string
	DatabaseURL        string
	RedisURL           string
	ObjectEndpoint     string
	ObjectRegion       string
	ObjectBucket       string
	ObjectAccessKeyID  string
	ObjectSecretKey    string
	ObjectPathStyle    bool
	ObjectUseIAM       bool
	JWTSecret          string
	JWTIssuer          string
	JWTAudience        string
	TokenTTL           time.Duration
	CORSOrigins        string
	CookieSecure       bool
	CookieSameSite     http.SameSite
	CookieDomain       string
	CalyxAskURL        string
	CalyxInternalKey   string
	CalyxDefaultTenant string
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

	corsOrigins := normalizeOrigins(envOr("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"))
	if production && strings.Contains(corsOrigins, "*") {
		return Config{}, fmt.Errorf("CORS_ORIGINS must list explicit origins in production")
	}
	redisURL := strings.TrimSpace(envOr("REDIS_URL", "redis://localhost:16379"))
	if production && os.Getenv("REDIS_URL") == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required in production")
	}
	objectEndpoint := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_ENDPOINT"))
	objectBucket := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_BUCKET"))
	objectAccessKey := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_ACCESS_KEY_ID"))
	objectSecretKey := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_SECRET_ACCESS_KEY"))
	objectUseIAM, err := strconv.ParseBool(envOr("OBJECT_STORAGE_USE_IAM", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("OBJECT_STORAGE_USE_IAM must be true or false")
	}
	if !production {
		if objectEndpoint == "" {
			objectEndpoint = "http://localhost:19000"
		}
		if objectBucket == "" {
			objectBucket = "calyx-uploads"
		}
		if objectAccessKey == "" {
			objectAccessKey = "calyx-minio"
		}
		if objectSecretKey == "" {
			objectSecretKey = "calyx-minio-secret"
		}
	}
	if objectBucket == "" || (!objectUseIAM && (objectEndpoint == "" || objectAccessKey == "" || objectSecretKey == "")) {
		return Config{}, fmt.Errorf("object storage bucket and either IAM role mode or endpoint credentials are required")
	}
	objectPathStyle, err := strconv.ParseBool(envOr("OBJECT_STORAGE_PATH_STYLE", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("OBJECT_STORAGE_PATH_STYLE must be true or false")
	}
	calyxAskURL := strings.TrimSpace(os.Getenv("CALYX_ASK_URL"))
	calyxInternalKey := strings.TrimSpace(os.Getenv("CALYX_INTERNAL_API_KEY"))
	if (calyxAskURL == "") != (calyxInternalKey == "") {
		return Config{}, fmt.Errorf("CALYX_ASK_URL and CALYX_INTERNAL_API_KEY must be configured together")
	}

	sameSite, err := parseSameSite(envOr("COOKIE_SAMESITE", defaultSameSite(production, os.Getenv("COOKIE_DOMAIN"))))
	if err != nil {
		return Config{}, err
	}
	cookieDomain := strings.TrimSpace(os.Getenv("COOKIE_DOMAIN"))
	if sameSite == http.SameSiteNoneMode && !production {
		// None requires Secure; allow in non-prod only when explicitly forced secure.
	}

	return Config{
		Addr:               envOr("ADDR", ":14000"),
		DatabaseURL:        envOr("DATABASE_URL", "postgres://calyx:calyx@localhost:15432/calyx"),
		RedisURL:           redisURL,
		ObjectEndpoint:     objectEndpoint,
		ObjectRegion:       envOr("OBJECT_STORAGE_REGION", "auto"),
		ObjectBucket:       objectBucket,
		ObjectAccessKeyID:  objectAccessKey,
		ObjectSecretKey:    objectSecretKey,
		ObjectPathStyle:    objectPathStyle,
		ObjectUseIAM:       objectUseIAM,
		JWTSecret:          secret,
		JWTIssuer:          envOr("JWT_ISSUER", "calyx-chat-api"),
		JWTAudience:        envOr("JWT_AUDIENCE", "calyx-web"),
		TokenTTL:           time.Duration(ttlHours) * time.Hour,
		CORSOrigins:        corsOrigins,
		CookieSecure:       production || sameSite == http.SameSiteNoneMode,
		CookieSameSite:     sameSite,
		CookieDomain:       cookieDomain,
		CalyxAskURL:        calyxAskURL,
		CalyxInternalKey:   calyxInternalKey,
		CalyxDefaultTenant: envOr("CALYX_DEFAULT_TENANT", "default"),
	}, nil
}

func defaultSameSite(production bool, cookieDomain string) string {
	// Cross-origin SPAs (e.g. Vercel → api.example.com) need None.
	// Sibling subdomains can use Lax; prefer None in production unless Domain is set for first-party.
	if production && strings.TrimSpace(cookieDomain) == "" {
		return "none"
	}
	return "lax"
}

func parseSameSite(v string) (http.SameSite, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "", "lax":
		return http.SameSiteLaxMode, nil
	case "none":
		return http.SameSiteNoneMode, nil
	case "strict":
		return http.SameSiteStrictMode, nil
	default:
		return 0, fmt.Errorf("COOKIE_SAMESITE must be lax, none, or strict")
	}
}

func normalizeOrigins(raw string) string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, ",")
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
