import { describe, expect, it } from "vitest";
import { detailEndpointFromOpenApi, mapRecord } from "../src/core/connectors";

// Bug ZoZo 2026-11-23: lista ShopExpert (/search?details=1) nu trimite descrierea la ~12.000 de produse,
// pagina de detaliu (/product?id=) o trimite. Echo punea subtitlul drept descriere în feed.
const spec = {
  openapi: "3.0.1", servers: [{ url: "https://www.shopexpert.com/ro/api" }],
  components: { securitySchemes: { ApiKeyAuth: { type: "apiKey", in: "query", name: "x-api-key" } } },
  paths: {
    "/search": { get: { parameters: [{ name: "q", in: "query" }, { name: "limit", in: "query" }, { name: "offset", in: "query" }, { name: "details", in: "query" }] } },
    "/product": { get: { parameters: [{ name: "id", in: "query" }] } },
  },
};

describe("descrierea din pagina de detaliu a API-ului", () => {
  it("găsește endpoint-ul de detaliu (GET cu id, fără paginare)", () => {
    expect(detailEndpointFromOpenApi(spec, "https://www.shopexpert.com/ro/openapi.yaml"))
      .toEqual({ url: "https://www.shopexpert.com/ro/api/product", idParam: "id", scheme: { in: "query", name: "x-api-key" } });
  });
  it("fără endpoint de detaliu, nimic", () => {
    expect(detailEndpointFromOpenApi({ ...spec, paths: { "/search": spec.paths["/search"] } }, "https://x.ro/openapi.yaml")).toBeNull();
  });
  it("un produs fără descriere lungă în listă e marcat de citit; unul cu descriere, nu", () => {
    const fara = mapRecord({ id: "1221852", title: "BOSCH GSR 12V-32", url: "https://x.ro/p", price: 795, short_description: "Masina de gaurit si insurubat brushless", description: null });
    expect(fara.needsDetail).toBe(true);
    expect(fara.description).toBe("Masina de gaurit si insurubat brushless");
    const cu = mapRecord({ id: "1", title: "BOSCH GSR 12V-32", url: "https://x.ro/p", price: 795, description: "<p>Prima mașină de găurit de 12 V.</p>" });
    expect(cu.needsDetail).toBeUndefined();
    expect(cu.description).toBe("Prima mașină de găurit de 12 V.");
  });
});

describe("entitățile HTML din descriere", () => {
  it("&icirc; și altele devin litere", () => {
    const p = mapRecord({ id: "1", title: "X", url: "https://x.ro/p", price: 1, description: "<p>găurit şi &icirc;nşurubat &ndash; 30&deg; &#259; &amp; Ø</p>" });
    expect(p.description).toBe("găurit şi înşurubat – 30° ă & Ø");
  });
});
