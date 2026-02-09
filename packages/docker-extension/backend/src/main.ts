import { migrate } from "drizzle-orm/libsql/migrator";
import express from "express";
import fs from "node:fs";
import { join } from "node:path";
import { db } from "./db";
import apiKeyRouter from "./modules/api-key/api-key.route";
import { globalErrorHandler } from "./modules/error/global-error-handler";
import tunnelRouter from "./modules/tunnel/tunnel.route";
import { tunnelService } from "./modules/tunnel/tunnel.service";


const SOCKET_PATH = process.argv.includes("-socket")
    ? process.argv[process.argv.indexOf("-socket") + 1]
    : "/run/guest-services/backend.sock";

const app = express();
app.use(express.json());

// Routes
app.use("/api-key", apiKeyRouter);
app.use("/tunnels", tunnelRouter);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.all("*all", (_req, res) => {
    res.status(404).json({ success: false, error: "Route not found" })
});

// Error handler
app.use(globalErrorHandler);


// Auto run migrations on startup
async function migrateDb() {
    await migrate(db, {
        migrationsFolder: join(__dirname, "drizzle"),
        migrationsSchema: join(__dirname, "drizzle", "schema.ts")
    });
}

// Start server on Unix socket
async function startServer() {

    await migrateDb();

    try {
        if (fs.existsSync(SOCKET_PATH)) {
            fs.unlinkSync(SOCKET_PATH);
        }
    } catch {
        // Ignore if file doesn't exist
    }

    const server = app.listen(SOCKET_PATH, () => {
        console.log(`Outray docker extension backend listening on ${SOCKET_PATH}`);
        tunnelService.restoreTunnels();
    });

    server.on("error", (err) => {
        console.error("Server error:", err);
        process.exit(1);
    });

    const cleanup = () => {
        try {
            if (fs.existsSync(SOCKET_PATH)) {
                fs.unlinkSync(SOCKET_PATH);
            }
        } catch {
            // ignore
        }
        process.exit();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
}

startServer();


