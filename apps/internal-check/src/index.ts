import express from "express";
import pg from "pg";
import dotenv from "dotenv";
import postgresConfig from "../../../shared/postgres-ssl";
import { certificateDomainAllowed, normalizeCertificateDomain } from "./domain-authorization";

dotenv.config();

// --- Database Connection ---

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
  query_timeout: 3_000,
  statement_timeout: 3_000,
  ssl: postgresConfig.postgresSsl(process.env.DATABASE_URL || "", process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"),
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

const app = express();
const port = process.env.INTERNAL_CHECK_PORT || process.env.PORT || 3344;
app.get("/health", (_req, res) => res.status(200).send("ok"));

app.get("/internal/domain-check", async (req, res) => {
  const domain = normalizeCertificateDomain(req.query.domain);
  if (!domain) {
    return res.status(400).send(); // Caddy expects 200 for allow, non-200 for deny
  }

  console.log(`Checking domain: ${domain}`);

  try {
    const allowed = await certificateDomainAllowed(domain, (sql, parameters) => pool.query(sql, parameters));
    return res.status(allowed ? 200 : 403).send();
  } catch (error) {
    console.error("Error checking domain:", error);
    return res.status(500).send();
  }
});

app.listen(Number(port), process.env.INTERNAL_CHECK_BIND_HOST || "0.0.0.0", () => {
  console.log(`Internal check service listening on port ${port}`);
});
