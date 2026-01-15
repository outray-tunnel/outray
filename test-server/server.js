const http = require("http");

const PORT = 4800;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // Collect body for POST/PUT/PATCH
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    console.log(`${method} ${path}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Custom-Header",
    );

    if (method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    // Routes
    if (path === "/" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          message: "Welcome to test server",
          timestamp: Date.now(),
        }),
      );
    }

    if (path === "/users" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify([
          { id: 1, name: "Alice", email: "alice@example.com" },
          { id: 2, name: "Bob", email: "bob@example.com" },
          { id: 3, name: "Charlie", email: "charlie@example.com" },
        ]),
      );
    }

    if (path === "/users" && method === "POST") {
      const data = body ? JSON.parse(body) : {};
      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ id: 4, ...data, createdAt: new Date().toISOString() }),
      );
    }

    if (path.match(/^\/users\/\d+$/) && method === "GET") {
      const id = path.split("/")[2];
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          id: parseInt(id),
          name: "User " + id,
          email: `user${id}@example.com`,
        }),
      );
    }

    if (path.match(/^\/users\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const data = body ? JSON.parse(body) : {};
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          id: parseInt(id),
          ...data,
          updatedAt: new Date().toISOString(),
        }),
      );
    }

    if (path.match(/^\/users\/\d+$/) && method === "DELETE") {
      res.writeHead(204);
      return res.end();
    }

    if (path === "/posts" && method === "GET") {
      const page = url.searchParams.get("page") || "1";
      const limit = url.searchParams.get("limit") || "10";
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          data: [
            { id: 1, title: "First Post", body: "Content here..." },
            { id: 2, title: "Second Post", body: "More content..." },
          ],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 100,
          },
        }),
      );
    }

    if (path === "/upload" && method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          success: true,
          size: body.length,
          message: "File received",
        }),
      );
    }

    if (path === "/echo" && method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          echo: body ? JSON.parse(body) : null,
          headers: req.headers,
        }),
      );
    }

    if (path === "/slow" && method === "GET") {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Slow response", delay: 2000 }));
      }, 2000);
      return;
    }

    if (path === "/error/400") {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Bad Request", message: "Invalid input" }),
      );
    }

    if (path === "/error/401") {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "Unauthorized",
          message: "Authentication required",
        }),
      );
    }

    if (path === "/error/403") {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Forbidden", message: "Access denied" }),
      );
    }

    if (path === "/error/404") {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Not Found", message: "Resource not found" }),
      );
    }

    if (path === "/error/500") {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: "Something went wrong",
        }),
      );
    }

    if (path === "/html" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(
        "<html><body><h1>Hello HTML</h1><p>This is HTML content</p></body></html>",
      );
    }

    if (path === "/text" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("Plain text response\nLine 2\nLine 3");
    }

    if (path === "/headers" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Custom-Header": "custom-value",
        "X-Request-Id": "req-" + Date.now(),
        "Cache-Control": "no-cache",
      });
      return res.end(JSON.stringify({ receivedHeaders: req.headers }));
    }

    // 404 fallback
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", path }));
  });
});

server.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log("\nAvailable endpoints:");
  console.log("  GET  /              - Welcome message");
  console.log("  GET  /users         - List users");
  console.log("  POST /users         - Create user");
  console.log("  GET  /users/:id     - Get user");
  console.log("  PUT  /users/:id     - Update user");
  console.log("  DELETE /users/:id   - Delete user");
  console.log("  GET  /posts?page=&limit= - Paginated posts");
  console.log("  POST /upload        - Upload endpoint");
  console.log("  POST /echo          - Echo request body");
  console.log("  GET  /slow          - 2s delayed response");
  console.log("  GET  /error/400     - Bad Request");
  console.log("  GET  /error/401     - Unauthorized");
  console.log("  GET  /error/403     - Forbidden");
  console.log("  GET  /error/404     - Not Found");
  console.log("  GET  /error/500     - Server Error");
  console.log("  GET  /html          - HTML response");
  console.log("  GET  /text          - Plain text response");
  console.log("  GET  /headers       - Custom headers");
});
