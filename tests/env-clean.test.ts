import { describe, expect, it } from "vitest";
import { cleanEnvValue } from "../src/core/ai/live";

describe("cleanEnvValue", () => {
  it("scoate spațiile și rândurile noi lipite la copierea cheii", () => {
    expect(cleanEnvValue("  sk-abc123\n")).toBe("sk-abc123");
  });
  it("scoate ghilimelele din jurul cheii", () => {
    expect(cleanEnvValue('"sk-abc123"')).toBe("sk-abc123");
    expect(cleanEnvValue("'sk-abc123'")).toBe("sk-abc123");
  });
  it("lasă neschimbată o cheie curată și valoarea goală", () => {
    expect(cleanEnvValue("sk-abc123")).toBe("sk-abc123");
    expect(cleanEnvValue("")).toBe("");
  });
});
