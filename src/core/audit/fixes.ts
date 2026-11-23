import { AI_BOTS, type Check } from "./index";

/**
 * „Rezolvă”: generează exact ce trebuie pus pe site, cu instrucțiuni pe platformă.
 * Până avem plugin-uri cu drept de scriere, magazinul copiază codul; apoi se aplică automat.
 */

export type Fix = { title: string; steps: string[]; code?: string; codeLang?: string; file?: string };
type Ctx = {
  domain: string;
  origin: string;
  platform?: string | null;
  storeName: string;
  facts?: { cui?: string; organization?: { telephone?: string; email?: string } };
  products?: { title: string; url: string; price: string | null; currency: string; category: string | null; brand: string | null; inStock: boolean; imageUrl: string | null; gtin: string | null; description: string | null }[];
  currency?: string;
  /** Verificările din audit: „Rezolvă” cere doar ce lipsește cu adevărat. */
  checks?: Pick<Check, "id" | "status" | "missing">[];
  sitemapUrl?: string;
  /** Sigla găsită pe site la scanare (Organization.logo, antet). Fără ea nu inventăm o adresă. */
  logo?: string | null;
};

const failing = (ctx: Ctx, id: string) => ctx.checks?.find((c) => c.id === id && (c.status === "warn" || c.status === "fail"));

const platformHint = (p?: string | null) => ({
  shopify: "În Shopify: Online Store → Themes → Edit code.",
  woocommerce: "În WordPress: cu un plugin SEO (Yoast/Rank Math) sau în fișierul temei.",
  gomag: "În Gomag: Setări → SEO, sau cere echipei Gomag să adauge.",
  merchantpro: "În MerchantPro: Setări → SEO / Cod personalizat.",
  prestashop: "În PrestaShop: prin modulul SEO sau în fișierele temei.",
}[p ?? ""] ?? "Pe platforma ta, în setările SEO sau la dezvoltator.");

export function robotsFix(ctx: Ctx): Fix {
  const important = AI_BOTS.filter((b) => b.important);
  const code = [
    "# Asistenți AI: permitem căutarea și vizitele cerute de utilizatori",
    ...important.flatMap((b) => [`User-agent: ${b.ua}`, "Allow: /", ""]),
    "# Opțional: blochează doar antrenarea, nu și căutarea",
    "# User-agent: GPTBot",
    "# Disallow: /",
    "",
    `Sitemap: ${ctx.sitemapUrl ?? `${ctx.origin}/sitemap.xml`}`,
  ].join("\n");
  return {
    title: "Permite roboții AI în robots.txt",
    file: "/robots.txt",
    steps: [
      "Adaugă blocul de mai jos în robots.txt, înaintea regulilor existente pentru alți roboți.",
      ctx.platform === "shopify" ? "În Shopify: Online Store → Themes → Edit code → creează templates/robots.txt.liquid." : platformHint(ctx.platform),
      "Verifică apoi cu butonul „Reverifică” din pagina de audit.",
    ],
    code, codeLang: "text",
  };
}

export function cloudflareFix(): Fix {
  return {
    title: "Lasă asistenții AI să treacă de firewall (Cloudflare)",
    steps: [
      "Cloudflare → Security → Bots: dacă „Block AI Scrapers and Crawlers” e activ, dezactivează-l sau excepteaza roboții de căutare.",
      "Security → WAF → Custom rules: creează o regulă „Skip” pentru roboții verificați (cf.client.bot) cu acțiunea Skip → All remaining custom rules + Super Bot Fight Mode.",
      "AI Crawl Control (dacă e disponibil în cont): setează OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User pe „Allow”.",
      "Nu dezactiva protecția pentru tot site-ul: excepția se aplică doar roboților verificați de Cloudflare.",
    ],
  };
}

/**
 * Categoria pentru rezumat: primele două niveluri distincte, fără marcă la final
 * („Scule de mână > Scule de mână > Chei … > CROMWELL” → „Scule de mână > Chei …”).
 */
export function categoryHead(category: string | null, brand: string | null): string | null {
  if (!category) return null;
  const segs = category.split(">").map((x) => x.trim()).filter(Boolean)
    .filter((x, i, a) => i === 0 || x.toLowerCase() !== a[i - 1].toLowerCase())
    .filter((x) => !brand || x.toLowerCase() !== brand.toLowerCase());
  return segs.slice(0, 2).join(" > ") || null;
}

export function llmsFix(ctx: Ctx): Fix {
  const cats = new Map<string, number>();
  for (const p of ctx.products ?? []) {
    const c = categoryHead(p.category, p.brand);
    if (c) cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const top = (ctx.products ?? []).filter((p) => p.inStock).slice(0, 15);
  const code = [
    `# ${ctx.storeName}`,
    "",
    // Fără afirmații pe care nu le-am verificat (livrare, plată): magazinul le completează.
    `> Magazin online (${ctx.domain}). [completează: unde livrezi și cum se poate plăti]`,
    "",
    "## Despre noi",
    `- Site: ${ctx.origin}`,
    ctx.facts?.cui ? `- Firma: CUI ${ctx.facts.cui}` : "- Firma: [completează CUI și denumirea]",
    ctx.facts?.organization?.telephone ? `- Telefon: ${ctx.facts.organization.telephone}` : "- Telefon: [completează]",
    `- Politica de retur: ${ctx.origin}/[pagina-retur]`,
    `- Livrare: ${ctx.origin}/[pagina-livrare]`,
    "",
    "## Categorii principale",
    ...(topCats.length ? topCats.map(([c, n]) => `- ${c} (${n} produse)`) : ["- [conectează catalogul pentru completare automată]"]),
    "",
    "## Produse reprezentative",
    ...(top.length ? top.map((p) => `- [${p.title}](${p.url})${p.price ? `: ${p.price} ${p.currency === "RON" ? "lei" : p.currency}` : ""}`) : ["- [conectează catalogul pentru completare automată]"]),
  ].join("\n");
  return {
    title: "Adaugă llms.txt",
    file: "/llms.txt",
    steps: ["Salvează textul de mai jos ca fișier llms.txt în rădăcina site-ului.", platformHint(ctx.platform), "Completează câmpurile dintre paranteze drepte."],
    code, codeLang: "markdown",
  };
}

export function jsonLdFix(ctx: Ctx): Fix {
  const p = (ctx.products ?? []).find((x) => x.price) ?? null;
  const org = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: ctx.storeName,
    url: ctx.origin,
    logo: ctx.logo ?? "[completează: adresa siglei]",
    ...(ctx.facts?.cui ? { vatID: ctx.facts.cui, taxID: ctx.facts.cui } : {}),
    contactPoint: { "@type": "ContactPoint", telephone: ctx.facts?.organization?.telephone ?? "+40...", contactType: "customer service", areaServed: "RO", availableLanguage: ["ro"] },
    hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "RO", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: "[completează: câte zile are clientul pentru retur, ca în politica ta]", returnMethod: "https://schema.org/ReturnByMail" },
  };
  const product = p ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    image: p.imageUrl ?? undefined,
    description: p.description?.slice(0, 300) ?? undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    gtin13: p.gtin ?? undefined,
    offers: { "@type": "Offer", url: p.url, price: p.price, priceCurrency: p.currency, availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: ctx.storeName } },
  } : null;
  // Cu rezultatul auditului cerem doar ce lipsește: un magazin care are deja Product nu primește din nou blocul Product.
  const known = !!ctx.checks;
  const needOrg = !known || !!failing(ctx, "jsonld-org");
  const prodCheck = failing(ctx, "jsonld-product");
  const needProductBlock = !known || !!prodCheck?.missing?.includes("Product");
  const productFieldsMissing = prodCheck && !prodCheck.missing?.includes("Product") ? prodCheck.missing ?? [] : [];
  const parts: string[] = [];
  if (needOrg) parts.push(`<!-- Pe toate paginile -->\n<script type="application/ld+json">\n${JSON.stringify(org, null, 2)}\n</script>`);
  if (needProductBlock && product) parts.push(`<!-- Pe fiecare pagină de produs (exemplu generat din catalogul tău) -->\n<script type="application/ld+json">\n${JSON.stringify(product, null, 2)}\n</script>`);
  const title = needOrg && !needProductBlock && !productFieldsMissing.length
    ? "Adaugă blocul Organization (datele firmei)"
    : !needOrg && !needProductBlock && productFieldsMissing.length
      ? "Completează câmpurile lipsă din Product"
      : "Adaugă date structurate (schema.org)";
  const steps = [
    ...(known && !needProductBlock ? ["Produsele tale au deja schema.org Product. Nu-l schimba și nu-l dubla."] : []),
    ...(needOrg ? ["Blocul OnlineStore merge în <head> pe toate paginile (sau măcar pe pagina principală). Completează logo-ul, telefonul și rețelele sociale reale."] : []),
    ...(needProductBlock ? ["Blocul Product trebuie generat automat pentru fiecare produs (tema sau plugin-ul SEO). Exemplul arată câmpurile obligatorii: preț, monedă, stoc, brand, GTIN."] : []),
    ...(productFieldsMissing.length ? [`În blocul Product existent adaugă: ${productFieldsMissing.join(", ")}.`] : []),
    ctx.platform === "woocommerce" ? "WooCommerce generează Product automat. Verifică să nu fie dezactivat de temă și completează GTIN-ul (ex. cu plugin-ul „GTIN for WooCommerce”)." : platformHint(ctx.platform),
    "Validează cu https://validator.schema.org după publicare.",
  ];
  return { title, steps, code: parts.length ? parts.join("\n\n") : undefined, codeLang: "html" };
}

export function contentFix(): Fix {
  return {
    title: "Îmbunătățește descrierile și paginile de încredere",
    steps: [
      "Fiecare descriere de produs: pentru cine e, ce problemă rezolvă, 3–5 specificații cheie, comparația cu alternativa, ce e în cutie.",
      "Adaugă o secțiune de întrebări frecvente pe produsele importante (garanție, compatibilitate, livrare).",
      "În subsolul site-ului: denumirea firmei, CUI, adresa, link-uri ANPC și SOL, politica de retur, contact.",
      "Titlu și meta description unice pe pagina principală și pe categorii.",
    ],
  };
}

export function sitemapFix(ctx: Ctx): Fix {
  const declare = failing(ctx, "sitemap-robots");
  if (declare && !failing(ctx, "sitemap")) {
    const url = ctx.sitemapUrl ?? declare.missing?.[0] ?? `${ctx.origin}/sitemap.xml`;
    return {
      title: "Declară sitemap-ul în robots.txt",
      file: "/robots.txt",
      steps: [
        "Sitemap-ul tău există și e bun. Lipsește doar linia care le spune roboților unde e.",
        "Adaugă linia de mai jos oriunde în robots.txt (de obicei la final). Dacă ai sitemap-uri și pentru alte limbi, adaugă câte o linie pentru fiecare.",
        "Verifică apoi cu butonul „Verifică din nou” din pagina de audit.",
      ],
      code: `Sitemap: ${url}`, codeLang: "text",
    };
  }
  return {
    title: "Publică un sitemap",
    steps: [platformHint(ctx.platform), `Publică sitemap-ul (de exemplu la ${ctx.origin}/sitemap.xml) și declară-l în robots.txt cu linia „Sitemap: <adresa>”.`, "Include toate produsele active și categoriile."],
  };
}

export function fixFor(kind: string, ctx: Ctx): Fix | null {
  switch (kind) {
    case "robots": return robotsFix(ctx);
    case "cloudflare": return cloudflareFix();
    case "llms": return llmsFix(ctx);
    case "jsonld": return jsonLdFix(ctx);
    case "content": return contentFix();
    case "sitemap": return sitemapFix(ctx);
    default: return null;
  }
}
