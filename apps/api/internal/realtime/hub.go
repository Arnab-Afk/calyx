package realtime

import (
	"encoding/json"
	"sync"
)

type Event struct {
	Type        string `json:"type"`
	WorkspaceID string `json:"workspaceId"`
	ChannelID   string `json:"channelId,omitempty"`
	Payload     any    `json:"payload"`
}

type client struct {
	workspaceID string
	ch          chan []byte
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*client]struct{})}
}

func (h *Hub) Subscribe(workspaceID string) (*client, <-chan []byte) {
	c := &client{workspaceID: workspaceID, ch: make(chan []byte, 32)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	return c, c.ch
}

func (h *Hub) Unsubscribe(c *client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.ch)
	}
	h.mu.Unlock()
}

func (h *Hub) Publish(ev Event) {
	b, err := json.Marshal(ev)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.workspaceID != ev.WorkspaceID {
			continue
		}
		select {
		case c.ch <- b:
		default:
			// drop if slow consumer
		}
	}
}
