import { describe, expect, it } from "vitest";
import { endpointFromOpenApi, feedAuth } from "../src/core/connectors";

const spec = {
  openapi: "3.0.1",
  servers: [{ url: "https://shop.example/ro/api" }],
  components: { securitySchemes: { ApiKeyAuth: { type: "apiKey", in: "query", name: "x-api-key" } } },
  paths: {
    "/search": { get: { description: "If details=1, limit is set to max 1000", parameters: [
      { name: "q", in: "query" }, { name: "limit", in: "query" }, { name: "offset", in: "query" },
      { name: "details", in: "query", schema: { enum: [0, 1] } }] } },
    "/product": { get: { parameters: [{ name: "id", in: "query" }] } },
  },
};

describe("API de produse din OpenAPI", () => {
  it("alege endpoint-ul de listare, cu detalii și paginare", () => {
    const ep = endpointFromOpenApi(spec, "https://shop.example/ro/openapi.yaml")!;
    expect(ep.url).toBe("https://shop.example/ro/api/search");
    expect(ep.pageParam).toBe("offset");
    expect(ep.limit).toBe(1000);
    expect(ep.params).toEqual([["details", "1"]]);
    expect(ep.scheme).toEqual({ in: "query", name: "x-api-key" });
  });
  it("pune cheia unde cere specificația sau unde spune magazinul", () => {
    expect(feedAuth("abc", { in: "query", name: "x-api-key" }).query).toEqual([["x-api-key", "abc"]]);
    expect(feedAuth("token=abc").query).toEqual([["token", "abc"]]);
    expect(feedAuth("Authorization: Bearer abc").headers).toEqual({ Authorization: "Bearer abc" });
    expect(feedAuth("abc").headers).toEqual({ "x-api-key": "abc" });
  });
});

describe("YAML scris de mână", () => {
  it("acceptă valori cu „: ” fără ghilimele", async () => {
    const { parseYamlLenient } = await import("../src/core/connectors");
    const d = parseYamlLenient('a:\n  description: Query text (ex: "bormasina makita")\n  b: 1\n') as { a: { description: string; b: number } };
    expect(d.a.description).toBe('Query text (ex: "bormasina makita")');
    expect(d.a.b).toBe(1);
  });
});
