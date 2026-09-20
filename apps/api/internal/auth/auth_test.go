package auth

import (
	"testing"
	"time"
)

func TestIssueAndParseToken(t *testing.T) {
	svc := NewService("01234567890123456789012345678901", time.Hour, "calyx-chat-api", "calyx-web")
	token, err := svc.IssueToken("user-1", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := svc.ParseToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != "user-1" || claims.Subject != "user-1" || claims.Issuer != "calyx-chat-api" {
		t.Fatalf("unexpected claims: %#v", claims)
	}
}

func TestParseTokenRejectsWrongAudience(t *testing.T) {
	issuer := NewService("01234567890123456789012345678901", time.Hour, "calyx-chat-api", "other-client")
	verifier := NewService("01234567890123456789012345678901", time.Hour, "calyx-chat-api", "calyx-web")
	token, err := issuer.IssueToken("user-1", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.ParseToken(token); err == nil {
		t.Fatal("expected audience validation failure")
	}
}

func TestParseTokenRejectsExpiredToken(t *testing.T) {
	svc := NewService("01234567890123456789012345678901", -time.Minute, "calyx-chat-api", "calyx-web")
	token, err := svc.IssueToken("user-1", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ParseToken(token); err == nil {
		t.Fatal("expected expiration validation failure")
	}
}
