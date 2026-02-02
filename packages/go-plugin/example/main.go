package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	outray "github.com/outray-tunnel/outray-go"
)

func main() {
	// Start a simple HTTP server
	go func() {
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"message": "Hello from Go!", "path": "%s", "method": "%s"}`, r.URL.Path, r.Method)
		})

		http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"status": "ok", "timestamp": "%s"}`, time.Now().Format(time.RFC3339))
		})

		log.Println("Starting local server on :8080...")
		if err := http.ListenAndServe(":8080", nil); err != nil {
			log.Fatal(err)
		}
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Create and start the tunnel
	client := outray.New(outray.Options{
		LocalPort: 8080,
		// Subdomain: "my-go-app", // Uncomment to request specific subdomain
		// APIKey:    "your-api-key", // Or set OUTRAY_API_KEY env var

		OnTunnelReady: func(url string, port int) {
			fmt.Printf("\n🚀 Tunnel ready!\n")
			fmt.Printf("   Public URL: %s\n", url)
			fmt.Printf("   Local:      http://localhost:8080\n\n")
		},

		OnRequest: func(info outray.RequestInfo) {
			statusEmoji := "✅"
			if info.StatusCode >= 400 {
				statusEmoji = "❌"
			}
			fmt.Printf("%s %s %s -> %d (%v)\n",
				statusEmoji,
				info.Method,
				info.Path,
				info.StatusCode,
				info.Duration.Round(time.Millisecond),
			)
		},

		OnError: func(err error, code string) {
			fmt.Printf("❌ Error [%s]: %v\n", code, err)
		},

		OnReconnecting: func(attempt int, delay time.Duration) {
			fmt.Printf("🔄 Reconnecting (attempt %d) in %v...\n", attempt, delay)
		},
	})

	if err := client.Start(); err != nil {
		log.Fatalf("Failed to start tunnel: %v", err)
	}
	defer client.Stop()

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n\nShutting down...")
}
