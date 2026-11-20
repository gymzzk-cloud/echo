/**
 * Verificarea domeniului pentru directorul de aplicații ChatGPT: OpenAI cere tokenul,
 * ca text simplu, la /.well-known/openai-apps-challenge. Tokenul stă în OPENAI_APPS_CHALLENGE.
 */
export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("Not found", { status: 404 });
  return new Response(token, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
