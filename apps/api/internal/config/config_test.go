package config

import (
	"net/http"
	"testing"
)

func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"APP_ENV", "JWT_SECRET", "JWT_TTL_HOURS", "CORS_ORIGINS", "JWT_ISSUER", "JWT_AUDIENCE",
		"CALYX_ASK_URL", "CALYX_INTERNAL_API_KEY", "COOKIE_SAMESITE", "COOKIE_DOMAIN", "CALYX_DEFAULT_TENANT", "REDIS_URL",
		"OBJECT_STORAGE_ENDPOINT", "OBJECT_STORAGE_REGION", "OBJECT_STORAGE_BUCKET", "OBJECT_STORAGE_ACCESS_KEY_ID",
		"OBJECT_STORAGE_SECRET_ACCESS_KEY", "OBJECT_STORAGE_PATH_STYLE", "OBJECT_STORAGE_USE_IAM",
	} {
		t.Setenv(key, "")
	}
}

func TestLoadDevelopmentDefaults(t *testing.T) {
	clearConfigEnv(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CookieSecure {
		t.Fatal("development cookie must not require TLS")
	}
	if cfg.JWTIssuer != "calyx-chat-api" || cfg.JWTAudience != "calyx-web" {
		t.Fatalf("unexpected JWT identity: %#v", cfg)
	}
}

func TestLoadProductionRequiresSecret(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ORIGINS", "https://app.example.com")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing production secret to fail")
	}
}

func TestLoadProductionRejectsWildcardCORS(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("CORS_ORIGINS", "*")
	if _, err := Load(); err == nil {
		t.Fatal("expected wildcard CORS to fail")
	}
}

func TestLoadRejectsPartialCalyxIntegration(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("CALYX_ASK_URL", "http://ingestion:3000")
	if _, err := Load(); err == nil {
		t.Fatal("expected partial Calyx integration to fail")
	}
}

func TestLoadProductionRequiresRedis(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("CORS_ORIGINS", "https://app.example.com")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing production Redis URL to fail")
	}
}

func setObjectStorageEnv(t *testing.T) {
	t.Helper()
	t.Setenv("OBJECT_STORAGE_ENDPOINT", "https://account.r2.cloudflarestorage.com")
	t.Setenv("OBJECT_STORAGE_BUCKET", "calyx-uploads")
	t.Setenv("OBJECT_STORAGE_ACCESS_KEY_ID", "access-key")
	t.Setenv("OBJECT_STORAGE_SECRET_ACCESS_KEY", "secret-key")
}

func TestLoadProductionRequiresObjectStorage(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("CORS_ORIGINS", "https://app.example.com")
	t.Setenv("REDIS_URL", "redis://redis:6379")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing production object storage to fail")
	}
}

func TestLoadProductionAcceptsIAMObjectStorage(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("CORS_ORIGINS", "https://app.example.com")
	t.Setenv("REDIS_URL", "rediss://redis.example.com:6379")
	t.Setenv("OBJECT_STORAGE_USE_IAM", "true")
	t.Setenv("OBJECT_STORAGE_BUCKET", "calyx-uploads")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.ObjectUseIAM || cfg.ObjectAccessKeyID != "" {
		t.Fatalf("unexpected object storage config: %#v", cfg)
	}
}

func TestLoadProductionUsesSecureCookie(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("CORS_ORIGINS", "https://app.example.com")
	t.Setenv("REDIS_URL", "redis://redis:6379")
	setObjectStorageEnv(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.CookieSecure {
		t.Fatal("production cookie must require TLS")
	}
	if cfg.CookieSameSite != http.SameSiteNoneMode {
		t.Fatalf("production default SameSite want None, got %v", cfg.CookieSameSite)
	}
}

func TestLoadTrimsCORSOrigins(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("CORS_ORIGINS", " https://app.example.com , http://localhost:3000 ")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CORSOrigins != "https://app.example.com,http://localhost:3000" {
		t.Fatalf("unexpected CORS_ORIGINS %q", cfg.CORSOrigins)
	}
}
