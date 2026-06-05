// Normalized act statuses accepted by search_acts. These are the only values the
// upstream precise.status field accepts; anything else makes upstream return koik:null.
export type ActStatus =
  | "KEHTIVAD_KEHTETUTETA" // in force, repealed excluded (default)
  | "JOUSTUVAD"            // entering into force (future)
  | "KEHTETUD"             // repealed
  | "KOIK_OTSITAVAD";      // all searchable

// One matched snippet from a search result. Search only.
export type ActMatch = {
  snippet: string;             // cleaned plain text from contexts[].html
  sectionTitle: string | null; // contexts[].title
  location: string | null;     // human path, e.g. "ptk 22, § 240 lg 2 p 5"
};

// A search hit. Upstream field names never leak past normalize.
export type ActSummary = {
  id: string;
  title: string;
  abbreviation: string | null;
  issuer: string | null;
  type: string | null;
  status: string | null;
  validFrom: string | null;
  validTo: string | null;
  url: string;
  matches: ActMatch[];
};

// A fully fetched act, including assembled readable text.
export type ActDetail = {
  id: string;
  title: string;
  issuer: string | null;
  type: string | null;
  publishedAt: string | null;
  validFrom: string | null;
  url: string;
  text: string;
};

// Act header without the full text body.
export type ActMetadata = Omit<ActDetail, "text">;

// --- Upstream shapes (only the fields we read) ---

export type UpstreamContext = {
  html?: string;
  title?: string | null;
  paragraph?: string | null;
  loige?: string | null;
  punkt?: string | null;
  peatykk?: string | null;
  osa?: string | null;
  jagu?: string | null;
  jaotis?: string | null;
};

export type UpstreamResult = {
  id: number;
  title?: string;
  abbreviation?: string | null;
  reportIssuer?: string | null;
  reportType?: string | null;
  reportStatus?: string | null;
  reportDateStart?: string | null;
  reportDateEnd?: string | null;
  contexts?: UpstreamContext[];
};

export type UpstreamSearchResponse = {
  koik: number | null;
  kehtivad: number | null;
  kehtetud: number | null;
  joustuvad: number | null;
  results: UpstreamResult[];
};

// Thrown when upstream is unreachable, returns a non-200, or returns invalid data.
export class UpstreamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "UpstreamError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

// Thrown when an act id does not exist (the XML endpoint returns a JSON 404).
export class ActNotFoundError extends UpstreamError {
  readonly id: string;
  constructor(id: string, message: string) {
    super(message);
    this.name = "ActNotFoundError";
    this.id = id;
  }
}
