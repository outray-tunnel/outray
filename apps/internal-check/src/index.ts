import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgTable, text } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

// --- Schema Definitions (Simplified for this service) ---
// We only need what's necessary for the check

const tunnels = pgTable("tunnels", {
  id: text("id").primaryKey(),
  url: text("url").notNull().unique(),
});

const domains = pgTable("domains", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  status: text("status").notNull(),
});

// --- Database Connection ---

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function connectDb() {
  try {
    await client.connect();
    console.log("Connected to database");
  } catch (err) {
    console.error("Failed to connect to database", err);
    process.exit(1);
  }
}

connectDb();

const db = drizzle(client);

const app = express();
const port = process.env.PORT || 3001;

app.get("/internal/domain-check", async (req, res) => {
  const domain = req.query.domain as string;

  if (!domain) {
    return res.status(400).send(); // Caddy expects 200 for allow, non-200 for deny
  }

  console.log(`Checking domain: ${domain}`);

  try {
    // 0. Allow infrastructure domains
    const ALLOWED_INFRA_DOMAINS = [
      "outray.app",
      "www.outray.app",
      "edge.outray.app",
      "api.outray.app",
      "api.outray.dev",
    ];

    if (ALLOWED_INFRA_DOMAINS.includes(domain)) {
      return res.status(200).send();
    }

    // 1. Check if it's a subdomain of outray.app
    if (domain.endsWith(".outray.app")) {
      // Construct the full URL to match what's stored in the database
      const tunnelUrl = `https://${domain}`;

      // Check if tunnel exists by full URL
      const tunnel = await db
        .select()
        .from(tunnels)
        .where(eq(tunnels.url, tunnelUrl))
        .limit(1);

      if (tunnel.length > 0) {
        return res.status(200).send();
      }
    }

    // 2. Check if it's a custom domain
    const [customDomain] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, domain))
      .limit(1);

    if (customDomain?.status === "active") {
      return res.status(200).send();
    }

    // Deny
    return res.status(403).send();
  } catch (error) {
    console.error("Error checking domain:", error);
    return res.status(500).send();
  }
});

app.listen(port, () => {
  console.log(`Internal check service listening on port ${port}`);
});
