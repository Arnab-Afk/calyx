package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func TestHubFansOutAcrossInstancesAndIsolatesWorkspaces(t *testing.T) {
	server := miniredis.RunT(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	first, err := NewHub(ctx, "redis://"+server.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := NewHub(ctx, "redis://"+server.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()

	localClient, local := first.Subscribe("workspace-1")
	defer first.Unsubscribe(localClient)
	remoteClient, remote := second.Subscribe("workspace-1")
	defer second.Unsubscribe(remoteClient)
	otherClient, other := second.Subscribe("workspace-2")
	defer second.Unsubscribe(otherClient)

	first.Publish(Event{Type: "message.created", WorkspaceID: "workspace-1", Payload: map[string]string{"id": "message-1"}})
	assertEvent(t, local, "message.created")
	assertEvent(t, remote, "message.created")
	select {
	case message := <-other:
		t.Fatalf("cross-workspace event: %s", message)
	case <-time.After(100 * time.Millisecond):
	}
}

func assertEvent(t *testing.T, messages <-chan []byte, eventType string) {
	t.Helper()
	select {
	case message := <-messages:
		var event Event
		if err := json.Unmarshal(message, &event); err != nil {
			t.Fatal(err)
		}
		if event.Type != eventType {
			t.Fatalf("unexpected event type %q", event.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
}
