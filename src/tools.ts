import { z } from "zod";
import { ActNotFoundError } from "./types.js";
import { searchActs, fetchActXml, PAGE_SIZE } from "./upstream.js";
import { toActSummary, xmlToActDetail, xmlToActMetadata } from "./normalize.js";
import type { ActSummary } from "./types.js";

export type ToolResult = { structured: unknown; text: string; isError?: boolean };

export type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  inputSchema: Record<string, unknown>;
  handler: (rawInput: unknown) => Promise<ToolResult>;
};

const STATUS_VALUES = ["KEHTIVAD_KEHTETUTETA", "JOUSTUVAD", "KEHTETUD", "KOIK_OTSITAVAD"] as const;

const SearchInput = z.object({
  query: z.string().min(1),
  query2: z.string().optional(),
  operator: z.enum(["AND", "OR"]).default("AND"),
  inText: z.boolean().default(true),
  inTitle: z.boolean().default(true),
  morph: z.boolean().default(false),
  status: z.enum(STATUS_VALUES).default("KEHTIVAD_KEHTETUTETA"),
  oldestFirst: z.boolean().default(false),
  page: z.number().int().positive().default(1),
});

const GetInput = z.object({ id: z.string().min(1) });

function searchSummary(acts: ActSummary[], total: number): string {
  if (acts.length === 0) return "No acts found.";
  const lines = acts.map(
    (a) => `- ${a.title}${a.abbreviation ? ` (${a.abbreviation})` : ""} [${a.status ?? "?"}] ${a.url}`,
  );
  return `${total} act(s) found. Showing ${acts.length}:\n${lines.join("\n")}`;
}

async function handleSearchActs(raw: unknown): Promise<ToolResult> {
  const input = SearchInput.parse(raw);
  const resp = await searchActs(
    {
      query: input.query,
      query2: input.query2 ?? "",
      operator: input.operator,
      inText: input.inText,
      inTitle: input.inTitle,
      morph: input.morph,
      status: input.status,
      oldestFirst: input.oldestFirst,
      page: input.page,
    },
    new Date(),
  );
  const acts = (resp.results ?? []).map(toActSummary);
  const total = resp.koik ?? 0;
  const searchAfter = (input.page - 1) * PAGE_SIZE;
  const structured = {
    acts,
    total,
    page: input.page,
    pageSize: PAGE_SIZE,
    hasMore: searchAfter + acts.length < total,
    counts: {
      inForce: resp.kehtivad ?? 0,
      repealed: resp.kehtetud ?? 0,
      enteringIntoForce: resp.joustuvad ?? 0,
    },
  };
  return { structured, text: searchSummary(acts, total) };
}

async function handleGetAct(raw: unknown): Promise<ToolResult> {
  const { id } = GetInput.parse(raw);
  try {
    const xml = await fetchActXml(id);
    const detail = xmlToActDetail(xml, id);
    return {
      structured: { act: detail, found: true },
      text: `${detail.title}\n${detail.url}\n\n${detail.text}`,
    };
  } catch (err) {
    if (err instanceof ActNotFoundError) {
      return { structured: { act: null, found: false }, text: `No act found with id ${id}`, isError: true };
    }
    throw err;
  }
}

async function handleGetActMetadata(raw: unknown): Promise<ToolResult> {
  const { id } = GetInput.parse(raw);
  try {
    const xml = await fetchActXml(id);
    const meta = xmlToActMetadata(xml, id);
    return {
      structured: { act: meta, found: true },
      text: `${meta.title}\n${meta.issuer ?? ""} ${meta.type ?? ""}\nvalidFrom: ${meta.validFrom ?? "?"}\n${meta.url}`,
    };
  } catch (err) {
    if (err instanceof ActNotFoundError) {
      return { structured: { act: null, found: false }, text: `No act found with id ${id}`, isError: true };
    }
    throw err;
  }
}

function define(
  name: string,
  description: string,
  schema: z.ZodTypeAny,
  handler: ToolDef["handler"],
): ToolDef {
  return { name, description, schema, inputSchema: z.toJSONSchema(schema) as Record<string, unknown>, handler };
}

export const TOOLS: ToolDef[] = [
  define(
    "search_acts",
    "Search Estonian legislation and legal acts in the official state gazette Riigi Teataja (riigiteataja.ee): laws, regulations, and codes. Use this for any question about Estonian law, statutes, or regulations, or to find the text of a specific provision. Otsi Eesti seadustikust ja õigusaktidest (seadus, määrus, õigusakt) Riigi Teatajast. Returns act summaries with matched snippets, pagination, and status counts. Newest acts first by default.",
    SearchInput,
    handleSearchActs,
  ),
  define(
    "get_act",
    "Fetch the full text and metadata of a single Estonian legal act by its id (the id returned by search_acts). Use this to read the actual text of a law or regulation. Tagastab ühe õigusakti (seadus, määrus) täisteksti ja metaandmed id järgi.",
    GetInput,
    handleGetAct,
  ),
  define(
    "get_act_metadata",
    "Fetch a single act's header fields (title, issuer, type, dates, url) by id, without the full text body. Useful when you already have an act id, for example from a legal citation or cross-reference, and want to confirm the act cheaply. Tagastab õigusakti päise (pealkiri, väljaandja, kuupäevad) ilma täistekstita.",
    GetInput,
    handleGetActMetadata,
  ),
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
