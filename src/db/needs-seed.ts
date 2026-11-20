// Iese cu codul 10 dacă baza nu are încă niciun utilizator (atunci pornirea rulează seed-ul o singură dată).
import { sql } from "./index";

const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
await sql.end();
process.exit(n === 0 ? 10 : 0);
