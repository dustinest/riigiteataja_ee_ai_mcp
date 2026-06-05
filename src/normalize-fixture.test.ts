import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toActSummary } from "./normalize.js";
import type { UpstreamResult } from "./types.js";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(String(new URL("./__fixtures__/search-kuritegu.json", import.meta.url))),
    "utf8",
  ),
) as { results: UpstreamResult[] };

// Expected public key sets for the no-leak assertions.
const SUMMARY_KEYS = ["abbreviation", "id", "issuer", "matches", "status", "title", "type", "url", "validFrom", "validTo"];
const MATCH_KEYS = ["location", "sectionTitle", "snippet"];

describe("toActSummary over real search-kuritegu fixture", () => {
  const summaries = fixture.results.map(toActSummary);

  it("produces one summary per fixture result (30 total)", () => {
    expect(summaries).toHaveLength(fixture.results.length);
    expect(summaries).toHaveLength(30);
  });

  it("each summary has exactly the ActSummary keys and no upstream keys", () => {
    for (const s of summaries) {
      expect(Object.keys(s).sort()).toEqual(SUMMARY_KEYS);
    }
  });

  it("each match has exactly the ActMatch keys and no upstream keys", () => {
    for (const s of summaries) {
      for (const m of s.matches) {
        expect(Object.keys(m).sort()).toEqual(MATCH_KEYS);
      }
    }
  });

  it("serialized output does not contain upstream field names that cannot appear as natural words", () => {
    // "punkt" is a real Estonian word and appears in snippet text, so it is
    // NOT checked here. It is guarded by the key-shape assertions above instead.
    const blob = JSON.stringify(summaries);
    expect(blob).not.toContain("reportIssuer");
    expect(blob).not.toContain("reportType");
    expect(blob).not.toContain("reportStatus");
    expect(blob).not.toContain("reportDateStart");
    expect(blob).not.toContain("reportDateEnd");
    expect(blob).not.toContain('"contexts"');
    expect(blob).not.toContain('"peatykk"');
    expect(blob).not.toContain('"loige"');
    expect(blob).not.toContain('"paragraph"');
  });

  it("every summary id is a string and url starts with https://www.riigiteataja.ee/akt/", () => {
    for (const s of summaries) {
      expect(typeof s.id).toBe("string");
      expect(s.url).toMatch(/^https:\/\/www\.riigiteataja\.ee\/akt\//);
    }
  });

  it("at least one summary has a match with a non-null location (multi-level structural data present)", () => {
    const matchesWithLocation = summaries.flatMap((s) => s.matches).filter((m) => m.location !== null);
    expect(matchesWithLocation.length).toBeGreaterThan(0);
  });
});
