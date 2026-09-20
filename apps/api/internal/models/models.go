package models

import "time"

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Image     *string   `json:"image,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type Workspace struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	JoinCode  string    `json:"joinCode"`
	OwnerID   string    `json:"ownerId"`
	CreatedAt time.Time `json:"createdAt"`
}

type Member struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	WorkspaceID string    `json:"workspaceId"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
	User        *User     `json:"user,omitempty"`
}

type Channel struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	WorkspaceID string    `json:"workspaceId"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Conversation struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	MemberOneID string    `json:"memberOneId"`
	MemberTwoID string    `json:"memberTwoId"`
	CreatedAt   time.Time `json:"createdAt"`
}

type CalyxData struct {
	Query     string   `json:"query"`
	Answer    string   `json:"answer"`
	ChartType *string  `json:"chartType,omitempty"`
	ChartData *string  `json:"chartData,omitempty"`
	ToolNames []string `json:"toolNames"`
	TenantID  string   `json:"tenantId"`
}

type Message struct {
	ID              string     `json:"id"`
	Body            string     `json:"body"`
	MemberID        string     `json:"memberId"`
	WorkspaceID     string     `json:"workspaceId"`
	ChannelID       *string    `json:"channelId,omitempty"`
	ParentMessageID *string    `json:"parentMessageId,omitempty"`
	ConversationID  *string    `json:"conversationId,omitempty"`
	ImageURL        *string    `json:"imageUrl,omitempty"`
	CalyxData       *CalyxData `json:"calyxData,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       *time.Time `json:"updatedAt,omitempty"`
	Member          *Member    `json:"member,omitempty"`
	Reactions       []Reaction `json:"reactions,omitempty"`
	ThreadCount     int        `json:"threadCount"`
}

type Reaction struct {
	ID        string `json:"id"`
	MessageID string `json:"messageId"`
	MemberID  string `json:"memberId"`
	Value     string `json:"value"`
	Count     int    `json:"count,omitempty"`
}
