import "server-only";
import { notFound } from "next/navigation";
import { currentUser } from "./auth";

/** Paginile interne Echo: doar pentru adresele din ADMIN_EMAILS (separate prin virgulă). */
export async function requireAdmin() {
  const user = await currentUser();
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!user || !admins.includes(user.email.toLowerCase())) notFound();
  return user;
}
