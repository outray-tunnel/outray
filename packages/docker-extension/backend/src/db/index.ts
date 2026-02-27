import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql/node';
import { createClient } from '@libsql/client';


export const DB_PATH = process.env.DB_FILE_NAME || "file:./outray.db";

export const client = createClient({
    url: DB_PATH,
});

export const db = drizzle({ client });
