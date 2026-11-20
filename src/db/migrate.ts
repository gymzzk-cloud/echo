import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./index";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrări aplicate.");
await sql.end();
