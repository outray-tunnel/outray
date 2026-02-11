import type { Config } from "drizzle-kit";
import { DB_PATH } from "./src/db";

export default {
    schema: "./src/db/schema.ts",
    out: "./src/drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: DB_PATH,
    },
} satisfies Config;
