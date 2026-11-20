// Șterge TOT din baza de test (schemele public și drizzle). Rulează doar cu RESET_DB=sterge-tot.
// Folosit o singură dată pe Render, când istoricul migrărilor s-a schimbat înainte de lansare.
import postgres from "postgres";

if (process.env.RESET_DB !== "sterge-tot") process.exit(0);
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
console.log("Baza de test a fost golită (RESET_DB). Scoate variabila după această pornire.");
await sql.end();
