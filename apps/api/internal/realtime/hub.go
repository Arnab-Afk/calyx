package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const redisChannel = "calyx:chat:realtime:v1"

type Event struct {
	Type        string `json:"type"`
	WorkspaceID string `json:"workspaceId"`
	ChannelID   string `json:"channelId,omitempty"`
	Payload     any    `json:"payload"`
}

type envelope struct {
	Origin string          `json:"origin"`
	Event  json.RawMessage `json:"event"`
}

type client struct {
	workspaceID string
	ch          chan []byte
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
	redis   *redis.Client
	origin  string
	cancel  context.CancelFunc
	done    chan struct{}
}

func NewHub(ctx context.Context, redisURL string) (*Hub, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	redisClient := redis.NewClient(opts)
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := redisClient.Ping(pingCtx).Err(); err != nil {
		_ = redisClient.Close()
		return nil, fmt.Errorf("connect redis: %w", err)
	}

	listenCtx, stop := context.WithCancel(ctx)
	pubsub := redisClient.Subscribe(listenCtx, redisChannel)
	readyCtx, readyCancel := context.WithTimeout(ctx, 5*time.Second)
	defer readyCancel()
	if _, err := pubsub.Receive(readyCtx); err != nil {
		stop()
		_ = pubsub.Close()
		_ = redisClient.Close()
		return nil, fmt.Errorf("subscribe redis: %w", err)
	}
	h := &Hub{
		clients: make(map[*client]struct{}),
		redis:   redisClient,
		origin:  randomID(),
		cancel:  stop,
		done:    make(chan struct{}),
	}
	go h.listen(listenCtx, pubsub)
	return h, nil
}

func randomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("instance-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
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
	h.dispatch(ev.WorkspaceID, b)

	message, err := json.Marshal(envelope{Origin: h.origin, Event: b})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := h.redis.Publish(ctx, redisChannel, message).Err(); err != nil {
		log.Printf("realtime publish: %v", err)
	}
}

func (h *Hub) dispatch(workspaceID string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.workspaceID != workspaceID {
			continue
		}
		select {
		case c.ch <- message:
		default:
			// Drop for slow clients; the durable API remains the source of truth.
		}
	}
}

func (h *Hub) listen(ctx context.Context, pubsub *redis.PubSub) {
	defer close(h.done)
	defer pubsub.Close()
	for message := range pubsub.Channel() {
		var wrapped envelope
		if err := json.Unmarshal([]byte(message.Payload), &wrapped); err != nil || wrapped.Origin == h.origin {
			continue
		}
		var event Event
		if err := json.Unmarshal(wrapped.Event, &event); err != nil || event.WorkspaceID == "" {
			continue
		}
		h.dispatch(event.WorkspaceID, wrapped.Event)
	}
}

func (h *Hub) Close() error {
	h.cancel()
	_ = h.redis.Close()
	select {
	case <-h.done:
	case <-time.After(3 * time.Second):
		return fmt.Errorf("realtime subscriber did not stop")
	}
	return nil
}
