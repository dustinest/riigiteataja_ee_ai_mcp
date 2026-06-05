import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { xmlToActDetail, xmlToActMetadata } from "./normalize.js";

const xml = readFileSync(
  fileURLToPath(String(new URL("./__fixtures__/act-106012026002.xml", import.meta.url))),
  "utf8",
);

describe("xmlToActMetadata", () => {
  it("extracts header fields from real act XML", () => {
    const m = xmlToActMetadata(xml, "106012026002");
    expect(m.id).toBe("106012026002");
    expect(m.title).toBe("Kultuuriministri määruste kehtetuks tunnistamine");
    expect(m.issuer).toBe("Kultuuriminister");
    expect(m.type).toBe("määrus");
    expect(m.publishedAt).toBe("2026-01-06");
    expect(m.validFrom).toContain("2026-01-09");
    expect(m.url).toBe("https://www.riigiteataja.ee/akt/106012026002");
    expect((m as Record<string, unknown>).text).toBeUndefined();
  });
});

describe("xmlToActDetail", () => {
  it("assembles readable plain text from sisu", () => {
    const d = xmlToActDetail(xml, "106012026002");
    expect(d.title).toBe("Kultuuriministri määruste kehtetuks tunnistamine");
    expect(d.text).toContain("Viljandi Draamateater");
    expect(d.text).toContain("Jõulumäe");
    expect(d.text).toContain("„"); // entity decoded
    expect(d.text).not.toContain("<p>");
    expect(d.text).not.toContain("<b>");
    expect(d.text).not.toContain("&bdquo;");
    expect(d.text.length).toBeGreaterThan(200);
  });
});
