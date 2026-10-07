import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgTable, text } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import { isStatusNamespaceHost, statusPageSlugFromHost } from "./status-host";

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
  purpose: text("purpose").notNull(),
});

// --- Database Connection ---

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
  query_timeout: 3_000,
  statement_timeout: 3_000,
});

async function connectDb() {
  try {
    await pool.query("select 1");
    console.log("Connected to database");
  } catch (err) {
    console.error("Failed to connect to database", err);
    process.exit(1);
  }
}

connectDb();

const db = drizzle(pool);

const app = express();
const port = process.env.INTERNAL_CHECK_PORT || process.env.PORT || 3344;

app.get("/internal/domain-check", async (req, res) => {
  const domain =
    typeof req.query.domain === "string"
      ? req.query.domain.toLowerCase().replace(/\.$/, "")
      : "";

  if (
    !domain ||
    domain.length > 253 ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    domain.includes("..")
  ) {
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
      "status.outray.app",
    ];

    if (ALLOWED_INFRA_DOMAINS.includes(domain)) {
      return res.status(200).send();
    }

    // A page hostname can never be authorized as a tunnel or custom tunnel
    // domain. The wildcard certificate handles normal page traffic; this
    // fail-closed check also protects the catch-all on-demand TLS path.
    if (isStatusNamespaceHost(domain)) {
      const slug = statusPageSlugFromHost(domain);
      if (process.env.UPTIME_ENABLED !== "true" || !slug)
        return res.status(403).send();
      const page = await pool.query(
        "SELECT 1 FROM uptime_status_pages WHERE slug = $1 AND published = true LIMIT 1",
        [slug],
      );
      return res.status(page.rowCount === 1 ? 200 : 403).send();
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

    if (
      customDomain?.status === "active" &&
      customDomain.purpose === "tunnel"
    ) {
      return res.status(200).send();
    }

    if (
      customDomain?.status === "active" &&
      customDomain.purpose === "status"
    ) {
      const statusPage = await pool.query(
        "SELECT 1 FROM uptime_status_pages WHERE domain_id = $1 AND published = true LIMIT 1",
        [customDomain.id],
      );
      if (statusPage.rowCount === 1) return res.status(200).send();
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
