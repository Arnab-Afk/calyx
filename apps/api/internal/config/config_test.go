package config

import "testing"

func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"APP_ENV", "JWT_SECRET", "JWT_TTL_HOURS", "CORS_ORIGINS", "JWT_ISSUER", "JWT_AUDIENCE",
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

func TestLoadProductionUsesSecureCookie(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("CORS_ORIGINS", "https://app.example.com")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.CookieSecure {
		t.Fatal("production cookie must require TLS")
	}
}
