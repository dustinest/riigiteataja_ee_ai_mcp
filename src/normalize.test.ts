import { describe, it, expect } from "vitest";
import { htmlToText, actUrl, buildLocation, toActSummary } from "./normalize.js";
import type { UpstreamResult } from "./types.js";

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p><b>1)</b> &bdquo;Ugala&ldquo; &amp; co</p>")).toBe("1) „Ugala“ & co");
  });
  it("turns block boundaries into newlines", () => {
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one\ntwo");
  });
  it("decodes numeric entities", () => {
    expect(htmlToText("a&#167;b")).toBe("a§b");
  });
  it("collapses runs of whitespace", () => {
    expect(htmlToText("a   \n  b")).toBe("a b");
  });
});

describe("actUrl", () => {
  it("builds the public riigiteataja.ee url", () => {
    expect(actUrl("112052026006")).toBe("https://www.riigiteataja.ee/akt/112052026006");
  });
});

describe("buildLocation", () => {
  it("renders a human path from structural fields", () => {
    expect(buildLocation({ peatykk: "22", paragraph: "240", loige: "2", punkt: "5" })).toBe(
      "ptk 22, § 240 lg 2 p 5",
    );
  });
  it("returns null when nothing structural is present", () => {
    expect(buildLocation({})).toBeNull();
  });
  it("omits missing parts", () => {
    expect(buildLocation({ paragraph: "5" })).toBe("§ 5");
  });
});

describe("toActSummary", () => {
  const raw: UpstreamResult = {
    id: 112052026006,
    title: "Halduskohtumenetluse seadustik",
    abbreviation: "HKMS",
    reportIssuer: "Riigikogu",
    reportType: "seadus",
    reportStatus: "KEHTIV",
    reportDateStart: "2026-05-15T00:00:00+03:00",
    reportDateEnd: "2026-06-11T00:00:00+03:00",
    contexts: [
      { html: "<b>kuritegu</b>, mille ta on toime pannud", title: "Teistmise alused", paragraph: "240", loige: "2", punkt: "5", peatykk: "22" },
    ],
  };
  it("maps upstream fields to ActSummary without leaking names", () => {
    const s = toActSummary(raw);
    expect(s.id).toBe("112052026006");
    expect(s.title).toBe("Halduskohtumenetluse seadustik");
    expect(s.abbreviation).toBe("HKMS");
    expect(s.issuer).toBe("Riigikogu");
    expect(s.type).toBe("seadus");
    expect(s.status).toBe("KEHTIV");
    expect(s.validFrom).toBe("2026-05-15T00:00:00+03:00");
    expect(s.validTo).toBe("2026-06-11T00:00:00+03:00");
    expect(s.url).toBe("https://www.riigiteataja.ee/akt/112052026006");
    expect(s.matches).toEqual([
      { snippet: "kuritegu, mille ta on toime pannud", sectionTitle: "Teistmise alused", location: "ptk 22, § 240 lg 2 p 5" },
    ]);
  });
  it("defaults missing optional fields to null and empty matches", () => {
    const s = toActSummary({ id: 1, title: "X" });
    expect(s.abbreviation).toBeNull();
    expect(s.issuer).toBeNull();
    expect(s.matches).toEqual([]);
  });
});
