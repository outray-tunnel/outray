import dotenv from "dotenv";

dotenv.config();

export const config = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  tigerDataUrl:
    process.env.TIGER_DATA_URL || "postgresql://localhost:5432/outray",
  // SSL mode: "" (auto/use connection string), "disable", "require", "verify-ca", "verify-full"
  // Default empty string means pg will use sslmode from connection string if present
  tigerDataSslMode: process.env.TIGER_DATA_SSL_MODE || "",
  tigerDataSslCa: process.env.TIGER_DATA_SSL_CA || "",
};
