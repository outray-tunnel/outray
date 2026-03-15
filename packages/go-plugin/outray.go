// Package outray provides a Go client for creating Outray tunnels.
//
// Outray exposes your localhost server to the internet, similar to ngrok.
// This package allows you to programmatically create HTTP, TCP, and UDP tunnels.
//
// Basic usage:
//
//	client := outray.New(outray.Options{
//	    LocalPort: 8080,
//	    OnTunnelReady: func(url string) {
//	        fmt.Printf("Tunnel ready at: %s\n", url)
//	    },
//	})
//
//	if err := client.Start(); err != nil {
//	    log.Fatal(err)
//	}
//	defer client.Stop()
//
//	// Keep running...
//	select {}
package outray

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// DefaultServerURL is the default Outray server URL
	DefaultServerURL = "wss://api.outray.dev/"

	// pingInterval is how often we send pings to keep the connection alive
	pingInterval = 25 * time.Second

	// pongTimeout is how long we wait for a pong before considering connection dead
	pongTimeout = 10 * time.Second
)

// Protocol specifies the tunnel protocol type
type Protocol string

const (
	ProtocolHTTP Protocol = "http"
	ProtocolTCP  Protocol = "tcp"
	ProtocolUDP  Protocol = "udp"
)

// RequestInfo contains information about a proxied request
type RequestInfo struct {
	Method     string
	Path       string
	StatusCode int
	Duration   time.Duration
	Error      string
}

// Options configures the Outray client
type Options struct {
	// LocalPort is the local port to tunnel (required)
	LocalPort int

	// ServerURL is the Outray server URL (optional, defaults to wss://api.outray.dev/)
	ServerURL string

	// APIKey is the API key for authentication (optional, can also use OUTRAY_API_KEY env var)
	APIKey string

	// Subdomain requests a specific subdomain (optional, can also use OUTRAY_SUBDOMAIN env var)
	Subdomain string

	// CustomDomain uses a custom domain instead of subdomain (optional)
	CustomDomain string

	// Protocol specifies the tunnel protocol (http, tcp, udp). Defaults to http.
	Protocol Protocol

	// RemotePort is the port to expose on the server (for TCP/UDP tunnels)
	RemotePort int

	// OnTunnelReady is called when the tunnel is established
	OnTunnelReady func(url string, port int)

	// OnRequest is called for each proxied request
	OnRequest func(info RequestInfo)

	// OnError is called when an error occurs
	OnError func(err error, code string)

	// OnReconnecting is called when attempting to reconnect
	OnReconnecting func(attempt int, delay time.Duration)

	// OnClose is called when the tunnel is closed
	OnClose func(reason string)

	// Silent suppresses log output when true
	Silent bool

	// Logger is the logger to use (optional, defaults to standard logger)
	Logger *log.Logger
}

// Client is the Outray tunnel client
type Client struct {
	options Options
	conn    *websocket.Conn
	mu      sync.RWMutex

	shouldReconnect   bool
	assignedURL       string
	subdomain         string
	forceTakeover     bool
	reconnectAttempts int
	lastPongReceived  time.Time

	stopChan   chan struct{}
	doneChan   chan struct{}
	pingTicker *time.Ticker

	logger *log.Logger
}

// New creates a new Outray client with the given options
func New(opts Options) *Client {
	// Apply defaults
	if opts.ServerURL == "" {
		opts.ServerURL = os.Getenv("OUTRAY_SERVER_URL")
		if opts.ServerURL == "" {
			opts.ServerURL = DefaultServerURL
		}
	}

	if opts.APIKey == "" {
		opts.APIKey = os.Getenv("OUTRAY_API_KEY")
	}

	if opts.Subdomain == "" {
		opts.Subdomain = os.Getenv("OUTRAY_SUBDOMAIN")
	}

	if opts.Protocol == "" {
		opts.Protocol = ProtocolHTTP
	}

	logger := opts.Logger
	if logger == nil {
		if opts.Silent {
			logger = log.New(io.Discard, "", 0)
		} else {
			logger = log.New(os.Stdout, "[outray] ", log.LstdFlags)
		}
	}

	return &Client{
		options:          opts,
		subdomain:        opts.Subdomain,
		shouldReconnect:  true,
		lastPongReceived: time.Now(),
		logger:           logger,
	}
}

// Start initiates the tunnel connection
func (c *Client) Start() error {
	if c.options.LocalPort == 0 {
		return fmt.Errorf("LocalPort is required")
	}

	c.mu.Lock()
	c.shouldReconnect = true
	c.stopChan = make(chan struct{})
	c.doneChan = make(chan struct{})
	c.mu.Unlock()

	return c.connect()
}

// Stop closes the tunnel connection
func (c *Client) Stop() {
	c.mu.Lock()
	c.shouldReconnect = false
	if c.stopChan != nil {
		close(c.stopChan)
	}
	if c.pingTicker != nil {
		c.pingTicker.Stop()
	}
	if c.conn != nil {
		c.conn.Close()
	}
	c.mu.Unlock()

	// Wait for message loop to finish
	if c.doneChan != nil {
		<-c.doneChan
	}
}

// URL returns the assigned tunnel URL, or empty string if not connected
func (c *Client) URL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.assignedURL
}

// IsConnected returns true if the client is currently connected
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.conn != nil
}

func (c *Client) connect() error {
	c.logger.Printf("Connecting to %s...", c.options.ServerURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.Dial(c.options.ServerURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.lastPongReceived = time.Now()
	c.mu.Unlock()

	// Set up pong handler
	conn.SetPongHandler(func(string) error {
		c.mu.Lock()
		c.lastPongReceived = time.Now()
		c.mu.Unlock()
		return nil
	})

	// Send handshake
	if err := c.sendHandshake(); err != nil {
		conn.Close()
		return err
	}

	// Start ping loop
	c.startPing()

	// Start message loop
	go c.messageLoop()

	return nil
}

func (c *Client) sendHandshake() error {
	msg := openTunnelMessage{
		Type:          "open_tunnel",
		APIKey:        c.options.APIKey,
		Subdomain:     c.subdomain,
		CustomDomain:  c.options.CustomDomain,
		ForceTakeover: c.forceTakeover,
		Protocol:      string(c.options.Protocol),
		RemotePort:    c.options.RemotePort,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	return conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) messageLoop() {
	defer func() {
		if c.doneChan != nil {
			close(c.doneChan)
		}
	}()

	for {
		select {
		case <-c.stopChan:
			return
		default:
		}

		c.mu.RLock()
		conn := c.conn
		c.mu.RUnlock()

		if conn == nil {
			return
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			c.handleDisconnect(err)
			return
		}

		c.handleMessage(data)
	}
}

func (c *Client) handleMessage(data []byte) {
	var msg message
	if err := json.Unmarshal(data, &msg); err != nil {
		c.logger.Printf("Failed to parse message: %v", err)
		return
	}

	switch msg.Type {
	case "tunnel_opened":
		var tunnelMsg tunnelOpenedMessage
		if err := json.Unmarshal(data, &tunnelMsg); err != nil {
			c.logger.Printf("Failed to parse tunnel_opened: %v", err)
			return
		}

		c.mu.Lock()
		c.assignedURL = tunnelMsg.URL
		c.forceTakeover = false
		c.reconnectAttempts = 0

		// Extract subdomain from URL
		if subdomain := c.extractSubdomain(tunnelMsg.URL); subdomain != "" {
			c.subdomain = subdomain
		}
		c.mu.Unlock()

		c.logger.Printf("Tunnel ready at: %s", tunnelMsg.URL)

		if c.options.OnTunnelReady != nil {
			c.options.OnTunnelReady(tunnelMsg.URL, tunnelMsg.Port)
		}

	case "error":
		var errMsg errorMessage
		if err := json.Unmarshal(data, &errMsg); err != nil {
			c.logger.Printf("Failed to parse error: %v", err)
			return
		}

		c.handleError(errMsg.Code, errMsg.Message)

	case "request":
		var reqMsg requestMessage
		if err := json.Unmarshal(data, &reqMsg); err != nil {
			c.logger.Printf("Failed to parse request: %v", err)
			return
		}

		go c.handleRequest(reqMsg)
	}
}

func (c *Client) handleError(code, message string) {
	c.logger.Printf("Error [%s]: %s", code, message)

	// If reconnecting and subdomain is in use, try to take over
	c.mu.RLock()
	assignedURL := c.assignedURL
	forceTakeover := c.forceTakeover
	c.mu.RUnlock()

	if code == "SUBDOMAIN_IN_USE" && assignedURL != "" && !forceTakeover {
		c.mu.Lock()
		c.forceTakeover = true
		c.mu.Unlock()

		c.mu.RLock()
		conn := c.conn
		c.mu.RUnlock()
		if conn != nil {
			conn.Close()
		}
		return
	}

	if c.options.OnError != nil {
		c.options.OnError(fmt.Errorf(message), code)
	}

	// Fatal errors - stop reconnecting
	if code == "AUTH_FAILED" || code == "LIMIT_EXCEEDED" {
		c.mu.Lock()
		c.shouldReconnect = false
		c.mu.Unlock()
		c.Stop()
	}
}

func (c *Client) handleRequest(req requestMessage) {
	startTime := time.Now()

	// Build the local URL
	localURL := fmt.Sprintf("http://localhost:%d%s", c.options.LocalPort, req.Path)

	// Decode body if present
	var body io.Reader
	if req.Body != "" {
		decoded, err := base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			c.sendErrorResponse(req.RequestID, 502, fmt.Sprintf("Failed to decode body: %v", err))
			return
		}
		body = bytes.NewReader(decoded)
	}

	// Create the request
	httpReq, err := http.NewRequest(req.Method, localURL, body)
	if err != nil {
		c.sendErrorResponse(req.RequestID, 502, fmt.Sprintf("Failed to create request: %v", err))
		return
	}

	// Set headers
	for key, value := range req.Headers {
		switch v := value.(type) {
		case string:
			httpReq.Header.Set(key, v)
		case []interface{}:
			for _, hv := range v {
				if s, ok := hv.(string); ok {
					httpReq.Header.Add(key, s)
				}
			}
		}
	}

	// Make the request
	client := &http.Client{
		Timeout: 60 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		duration := time.Since(startTime)

		if c.options.OnRequest != nil {
			c.options.OnRequest(RequestInfo{
				Method:     req.Method,
				Path:       req.Path,
				StatusCode: 502,
				Duration:   duration,
				Error:      err.Error(),
			})
		}

		c.sendErrorResponse(req.RequestID, 502, fmt.Sprintf("Bad Gateway: %v", err))
		return
	}
	defer resp.Body.Close()

	// Read response body
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		c.sendErrorResponse(req.RequestID, 502, fmt.Sprintf("Failed to read response: %v", err))
		return
	}

	duration := time.Since(startTime)

	if c.options.OnRequest != nil {
		c.options.OnRequest(RequestInfo{
			Method:     req.Method,
			Path:       req.Path,
			StatusCode: resp.StatusCode,
			Duration:   duration,
		})
	}

	// Build response headers
	headers := make(map[string]interface{})
	for key, values := range resp.Header {
		if len(values) == 1 {
			headers[strings.ToLower(key)] = values[0]
		} else {
			headers[strings.ToLower(key)] = values
		}
	}

	// Send response
	respMsg := responseMessage{
		Type:       "response",
		RequestID:  req.RequestID,
		StatusCode: resp.StatusCode,
		Headers:    headers,
	}

	if len(bodyBytes) > 0 {
		respMsg.Body = base64.StdEncoding.EncodeToString(bodyBytes)
	}

	c.sendMessage(respMsg)
}

func (c *Client) sendErrorResponse(requestID string, statusCode int, message string) {
	respMsg := responseMessage{
		Type:       "response",
		RequestID:  requestID,
		StatusCode: statusCode,
		Headers:    map[string]interface{}{"content-type": "text/plain"},
		Body:       base64.StdEncoding.EncodeToString([]byte(message)),
	}
	c.sendMessage(respMsg)
}

func (c *Client) sendMessage(msg interface{}) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	if conn == nil {
		return fmt.Errorf("not connected")
	}

	return conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) startPing() {
	c.mu.Lock()
	if c.pingTicker != nil {
		c.pingTicker.Stop()
	}
	c.pingTicker = time.NewTicker(pingInterval)
	c.mu.Unlock()

	go func() {
		for {
			select {
			case <-c.stopChan:
				return
			case <-c.pingTicker.C:
				c.mu.RLock()
				conn := c.conn
				lastPong := c.lastPongReceived
				c.mu.RUnlock()

				if conn == nil {
					return
				}

				// Check if pong timeout exceeded
				if time.Since(lastPong) > pingInterval+pongTimeout {
					c.logger.Println("Pong timeout - connection may be dead")
					conn.Close()
					return
				}

				if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)); err != nil {
					c.logger.Printf("Failed to send ping: %v", err)
				}
			}
		}
	}()
}

func (c *Client) handleDisconnect(err error) {
	c.mu.Lock()
	if c.pingTicker != nil {
		c.pingTicker.Stop()
	}
	c.conn = nil

	if !c.shouldReconnect {
		c.mu.Unlock()
		return
	}

	// If we previously had a tunnel URL, force takeover on reconnect
	if c.assignedURL != "" {
		c.forceTakeover = true
	}

	attempts := c.reconnectAttempts
	c.reconnectAttempts++
	c.mu.Unlock()

	// Exponential backoff
	delay := time.Duration(math.Min(float64(2*time.Second)*math.Pow(2, float64(attempts)), float64(30*time.Second)))

	c.logger.Printf("Connection lost, reconnecting in %v (attempt %d)...", delay, attempts+1)

	if c.options.OnReconnecting != nil {
		c.options.OnReconnecting(attempts+1, delay)
	}

	time.Sleep(delay)

	// Check if we should still reconnect
	c.mu.RLock()
	shouldReconnect := c.shouldReconnect
	c.mu.RUnlock()

	if shouldReconnect {
		c.doneChan = make(chan struct{})
		if err := c.connect(); err != nil {
			c.logger.Printf("Reconnect failed: %v", err)
			c.handleDisconnect(err)
		}
	}
}

func (c *Client) extractSubdomain(tunnelURL string) string {
	parsed, err := url.Parse(tunnelURL)
	if err != nil {
		return ""
	}

	parts := strings.Split(parsed.Hostname(), ".")
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}

// Message types for JSON serialization
type message struct {
	Type string `json:"type"`
}

type openTunnelMessage struct {
	Type          string `json:"type"`
	APIKey        string `json:"apiKey,omitempty"`
	Subdomain     string `json:"subdomain,omitempty"`
	CustomDomain  string `json:"customDomain,omitempty"`
	ForceTakeover bool   `json:"forceTakeover,omitempty"`
	Protocol      string `json:"protocol,omitempty"`
	RemotePort    int    `json:"remotePort,omitempty"`
}

type tunnelOpenedMessage struct {
	Type     string `json:"type"`
	TunnelID string `json:"tunnelId"`
	URL      string `json:"url"`
	Plan     string `json:"plan,omitempty"`
	Protocol string `json:"protocol,omitempty"`
	Port     int    `json:"port,omitempty"`
}

type errorMessage struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type requestMessage struct {
	Type      string                 `json:"type"`
	RequestID string                 `json:"requestId"`
	Method    string                 `json:"method"`
	Path      string                 `json:"path"`
	Headers   map[string]interface{} `json:"headers"`
	Body      string                 `json:"body,omitempty"`
}

type responseMessage struct {
	Type       string                 `json:"type"`
	RequestID  string                 `json:"requestId"`
	StatusCode int                    `json:"statusCode"`
	Headers    map[string]interface{} `json:"headers"`
	Body       string                 `json:"body,omitempty"`
}
