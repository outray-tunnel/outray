import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});

export const tunnels = sqliteTable("tunnels", {
    containerId: text("container_id").primaryKey(),
    port: integer("port").notNull(),
    subdomain: text("subdomain"),
    status: text("status").default("offline"),
    url: text("url"),
    createdAt: text("created_at")
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});
