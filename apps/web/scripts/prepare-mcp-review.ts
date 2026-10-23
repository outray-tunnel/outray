import { prepareMcpReview } from "../src/lib/mcp/review-fixtures";
import { pool } from "../src/db";
import { redis } from "../src/lib/redis";

try {
  const email = process.env.MCP_REVIEW_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set MCP_REVIEW_EMAIL to the dedicated review mailbox");
  const database = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && !process.argv.includes("--allow-remote")) throw new Error("A hosted review database requires --allow-remote");
  let ingest = process.env.MCP_REVIEW_INGEST_ORIGIN;
  if (ingest) {
    const url = new URL(ingest);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("MCP_REVIEW_INGEST_ORIGIN must be an HTTPS origin");
    ingest = url.origin;
  }
  if (!process.argv.includes("--apply")) console.log("Dry run: would prepare one isolated reviewer account, demo vault, paused monitor, status draft and incident draft. Add --apply to create them. No email will be sent.");
  else console.log(JSON.stringify(await prepareMcpReview(email, ingest), null, 2));
} catch (error) {
  // Product/database exceptions can carry secret inputs. Only known operator
  // validation is printed; never dump an exception object or failed SQL row.
  console.error("Review preparation failed. Check the dedicated mailbox, target, migrations and product configuration.");
  if (error instanceof Error && !error.cause && /^(Set MCP_REVIEW|A hosted review|MCP_REVIEW_INGEST|Use a dedicated|The review|Directory review)/.test(error.message)) console.error(error.message);
  process.exitCode = 1;
} finally { await redis.quit(); await pool.end(); }
