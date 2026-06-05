import { describe, it, expect } from "vitest";
import { parseActXml, collectText } from "./xml.js";

describe("parseActXml", () => {
  it("parses elements and drops attributes", () => {
    const obj = parseActXml('<root id="x"><a>hello</a><b>world</b></root>') as Record<string, any>;
    expect(obj.root.a).toBe("hello");
    expect(obj.root.b).toBe("world");
    expect(obj.root["@_id"]).toBeUndefined();
  });
  it("captures CDATA content as text", () => {
    const obj = parseActXml('<root><c><![CDATA[<p>hi</p>]]></c></root>') as Record<string, any>;
    expect(String(obj.root.c)).toContain("<p>hi</p>");
  });
});

describe("collectText", () => {
  it("gathers all leaf strings in document order", () => {
    const tree = { a: "one", b: { c: "two", d: ["three", "four"] } };
    expect(collectText(tree)).toEqual(["one", "two", "three", "four"]);
  });
  it("ignores null and undefined", () => {
    expect(collectText({ a: null, b: undefined, c: "x" })).toEqual(["x"]);
  });
});
