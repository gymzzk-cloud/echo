"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export async function setLang(form: FormData) {
  const lang = form.get("lang") === "hu" ? "hu" : "ro";
  (await cookies()).set("echo_lang", lang, { path: "/", sameSite: "lax", maxAge: 365 * 864e2 });
  let back = "/";
  try { const u = new URL((await headers()).get("referer") ?? ""); back = u.pathname + u.search; } catch { /* acasă */ }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
