import { buyerTools } from "@/core/mcp";
import { mcpGet, mcpResponse } from "@/lib/mcp-http";
import { BRAND } from "@/lib/brand";

export async function POST(req: Request) {
  return mcpResponse(req, { name: `${BRAND.name} – magazine verificate RO/HU`, tools: buyerTools() });
}
export const GET = mcpGet;
