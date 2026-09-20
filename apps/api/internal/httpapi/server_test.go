package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Arnab-Afk/calyx/apps/api/internal/auth"
)

func testAuth(t *testing.T) (*auth.Service, string) {
	t.Helper()
	svc := auth.NewService("01234567890123456789012345678901", time.Hour, "calyx-chat-api", "calyx-web")
	token, err := svc.IssueToken("user-1", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}
	return svc, token
}

func TestRequireAuthAcceptsHTTPOnlySessionCookie(t *testing.T) {
	svc, token := testAuth(t)
	s := &Server{auth: svc}
	handler := s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := userID(r.Context()); got != "user-1" {
			t.Fatalf("unexpected user id %q", got)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/v1/workspaces", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("unexpected status %d", res.Code)
	}
}

func TestLogoutClearsSessionCookie(t *testing.T) {
	s := &Server{cookieSecure: true}
	res := httptest.NewRecorder()
	s.logout(res, httptest.NewRequest(http.MethodPost, "/v1/auth/logout", nil))
	cookies := res.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != sessionCookie || cookies[0].MaxAge != -1 {
		t.Fatalf("session cookie was not cleared: %#v", cookies)
	}
	if !cookies[0].HttpOnly || !cookies[0].Secure {
		t.Fatalf("cookie flags missing: %#v", cookies[0])
	}
}

func TestWebsocketOriginsUseConfiguredHosts(t *testing.T) {
	got := websocketOrigins("https://app.example.com,http://localhost:3000")
	if len(got) != 2 || got[0] != "app.example.com" || got[1] != "localhost:3000" {
		t.Fatalf("unexpected origins: %#v", got)
	}
}
