import dotenv from "dotenv";

dotenv.config();

export const config = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  tigerDataUrl:
    process.env.TIGER_DATA_URL || "postgresql://localhost:5432/outray",
  // PostgreSQL for web app (subscriptions)
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/outray",
  // Paystack
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
};
