import { XMLParser } from "fast-xml-parser";

// Attributes (UUID ids) are noise for us, so drop them. CDATA content is merged
// into the element's text value by default, which is what we want for HTMLKonteiner.
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep values as strings; do not coerce numbers or dates
  trimValues: true,
});

// Parse an act XML document into a plain object tree.
export function parseActXml(xml: string): unknown {
  return parser.parse(xml);
}

// Recursively collect every leaf string in document order. Used to assemble the
// readable act body from the nested sisu structure without knowing its exact shape.
export function collectText(node: unknown): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number" || typeof node === "boolean") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === "object") {
    return Object.values(node as Record<string, unknown>).flatMap(collectText);
  }
  return [];
}
