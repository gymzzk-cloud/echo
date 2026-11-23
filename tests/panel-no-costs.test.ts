import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Panoul magazinului nu arată costurile noastre de AI, tokenii sau plafonul (KNOWLEDGE B40). Ele stau în /admin/costuri. */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });

describe("panoul magazinului fără costuri AI", () => {
  it("nicio pagină din /panou nu arată cost, tokeni sau buget", () => {
    const bad = files("src/app/panou").filter((f) => {
      const s = readFileSync(f, "utf8");
      return /projectUsageThisMonth\([^)]*\)[\s\S]*usage\.usd|monthlyCostEstimate|Cost estimat|Buget lunar|Tokeni \(|budgetLeft/.test(s);
    });
    expect(bad).toEqual([]);
  });
});
