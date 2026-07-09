# Outray Go Client

Expose your localhost Go server to the internet using [Outray](https://outray.dev).

## Installation

```bash
go get github.com/outray-tunnel/outray-go
```

## Quick Start

### Basic Usage

```go
package main

import (
    "fmt"
    "log"
    "net/http"

    outray "github.com/outray-tunnel/outray-go"
)

func main() {
    // Start your local server
    go func() {
        http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
            fmt.Fprintf(w, "Hello from Go!")
        })
        http.ListenAndServe(":8080", nil)
    }()

    // Create tunnel
    client := outray.New(outray.Options{
        LocalPort: 8080,
        OnTunnelReady: func(url string, port int) {
            fmt.Printf("🚀 Tunnel ready at: %s\n", url)
        },
    })

    if err := client.Start(); err != nil {
        log.Fatal(err)
    }
    defer client.Stop()

    // Keep running
    select {}
}
```

### With Authentication

```go
client := outray.New(outray.Options{
    LocalPort: 8080,
    APIKey:    "your-api-key", // or set OUTRAY_API_KEY env var
    Subdomain: "my-go-app",    // or set OUTRAY_SUBDOMAIN env var
    OnTunnelReady: func(url string, port int) {
        fmt.Printf("Tunnel ready at: %s\n", url)
    },
    OnError: func(err error, code string) {
        fmt.Printf("Error [%s]: %v\n", code, err)
    },
})
```

### With Gin

```go
package main

import (
    "fmt"
    "log"

    "github.com/gin-gonic/gin"
    outray "github.com/outray-tunnel/outray-go"
)

func main() {
    r := gin.Default()

    r.GET("/", func(c *gin.Context) {
        c.JSON(200, gin.H{"message": "Hello from Gin!"})
    })

    // Start tunnel
    client := outray.New(outray.Options{
        LocalPort: 8080,
        OnTunnelReady: func(url string, port int) {
            fmt.Printf("🚀 Tunnel: %s\n", url)
        },
    })

    if err := client.Start(); err != nil {
        log.Fatal(err)
    }
    defer client.Stop()

    // Start Gin server
    r.Run(":8080")
}
```

### With Echo

```go
package main

import (
    "fmt"
    "log"
    "net/http"

    "github.com/labstack/echo/v4"
    outray "github.com/outray-tunnel/outray-go"
)

func main() {
    e := echo.New()

    e.GET("/", func(c echo.Context) error {
        return c.JSON(http.StatusOK, map[string]string{"message": "Hello from Echo!"})
    })

    // Start tunnel
    client := outray.New(outray.Options{
        LocalPort: 8080,
        OnTunnelReady: func(url string, port int) {
            fmt.Printf("🚀 Tunnel: %s\n", url)
        },
    })

    if err := client.Start(); err != nil {
        log.Fatal(err)
    }
    defer client.Stop()

    // Start Echo server
    e.Start(":8080")
}
```

### With Fiber

```go
package main

import (
    "fmt"
    "log"

    "github.com/gofiber/fiber/v2"
    outray "github.com/outray-tunnel/outray-go"
)

func main() {
    app := fiber.New()

    app.Get("/", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"message": "Hello from Fiber!"})
    })

    // Start tunnel
    client := outray.New(outray.Options{
        LocalPort: 3000,
        OnTunnelReady: func(url string, port int) {
            fmt.Printf("🚀 Tunnel: %s\n", url)
        },
    })

    if err := client.Start(); err != nil {
        log.Fatal(err)
    }
    defer client.Stop()

    // Start Fiber server
    app.Listen(":3000")
}
```

## Options

| Option           | Type                                     | Description                                                      |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `LocalPort`      | `int`                                    | **Required.** The local port to tunnel                           |
| `ServerURL`      | `string`                                 | Outray server URL (default: `wss://api.outray.dev/`)             |
| `APIKey`         | `string`                                 | API key for authentication (or use `OUTRAY_API_KEY` env var)     |
| `Subdomain`      | `string`                                 | Request a specific subdomain (or use `OUTRAY_SUBDOMAIN` env var) |
| `CustomDomain`   | `string`                                 | Use a custom domain instead of subdomain                         |
| `Protocol`       | `Protocol`                               | Tunnel protocol: `ProtocolHTTP`, `ProtocolTCP`, `ProtocolUDP`    |
| `RemotePort`     | `int`                                    | Port to expose on server (for TCP/UDP tunnels)                   |
| `OnTunnelReady`  | `func(url string, port int)`             | Called when tunnel is established                                |
| `OnRequest`      | `func(info RequestInfo)`                 | Called for each proxied request                                  |
| `OnError`        | `func(err error, code string)`           | Called when an error occurs                                      |
| `OnReconnecting` | `func(attempt int, delay time.Duration)` | Called when reconnecting                                         |
| `OnClose`        | `func(reason string)`                    | Called when tunnel is closed                                     |
| `Silent`         | `bool`                                   | Suppress log output                                              |
| `Logger`         | `*log.Logger`                            | Custom logger                                                    |

## TCP Tunnels

```go
client := outray.New(outray.Options{
    LocalPort:  5432, // PostgreSQL
    Protocol:   outray.ProtocolTCP,
    RemotePort: 5432, // Optional: request specific port
    OnTunnelReady: func(url string, port int) {
        fmt.Printf("TCP tunnel ready on port %d\n", port)
    },
})
```

## UDP Tunnels

```go
client := outray.New(outray.Options{
    LocalPort:  53, // DNS
    Protocol:   outray.ProtocolUDP,
    OnTunnelReady: func(url string, port int) {
        fmt.Printf("UDP tunnel ready on port %d\n", port)
    },
})
```

## Request Logging

```go
client := outray.New(outray.Options{
    LocalPort: 8080,
    OnRequest: func(info outray.RequestInfo) {
        fmt.Printf("%s %s -> %d (%v)\n",
            info.Method,
            info.Path,
            info.StatusCode,
            info.Duration,
        )
    },
})
```

## Environment Variables

| Variable            | Description                |
| ------------------- | -------------------------- |
| `OUTRAY_API_KEY`    | API key for authentication |
| `OUTRAY_SUBDOMAIN`  | Requested subdomain        |
| `OUTRAY_SERVER_URL` | Custom server URL          |

## Error Codes

| Code                 | Description                           |
| -------------------- | ------------------------------------- |
| `AUTH_FAILED`        | Invalid API key                       |
| `LIMIT_EXCEEDED`     | Tunnel limit exceeded for your plan   |
| `SUBDOMAIN_IN_USE`   | Requested subdomain is already in use |
| `BANDWIDTH_EXCEEDED` | Monthly bandwidth limit exceeded      |

## License

MIT
