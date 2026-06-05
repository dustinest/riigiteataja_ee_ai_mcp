# Riigi Teataja MCP server

A remote, read-only MCP server that exposes the Estonian state gazette, Riigi
Teataja (riigiteataja.ee), to MCP clients such as Claude Desktop, Claude Code,
Cursor and ChatGPT. It wraps the public Riigi Teataja API: full-text search over
legal acts, and fetching a single act as structured, readable content instead of
raw XML. Version 1 has no authentication.

It runs as a stateless Cloudflare Worker (free tier, no Durable Objects), and it
can also be self-hosted with Docker or Podman if you do not want to use
Cloudflare.

## Contents

- [Tools](#tools)
  - [search_acts](#search_acts)
  - [get_act](#get_act)
  - [get_act_metadata](#get_act_metadata)
- [How clients pick a tool](#how-clients-pick-a-tool)
- [Running locally](#running-locally)
  - [With Node](#with-node)
  - [With Docker (or Podman)](#with-docker-or-podman)
  - [Connecting a local MCP client](#connecting-a-local-mcp-client)
- [Deploy to Cloudflare](#deploy-to-cloudflare)
  - [Connecting an MCP client](#connecting-an-mcp-client)
- [Notes](#notes)
- [License](#license)

## Tools

### search_acts
Full-text search of Estonian legal acts.
Input: `{ query, query2?, operator?: "AND" | "OR", inText?, inTitle?, morph?, status?, oldestFirst?, page? }`
Defaults: operator AND, inText true, inTitle true, morph false, status
KEHTIVAD_KEHTETUTETA, oldestFirst false, page 1.
`status` is one of `KEHTIVAD_KEHTETUTETA` (in force, the default), `JOUSTUVAD`
(entering into force), `KEHTETUD` (repealed), `KOIK_OTSITAVAD` (all searchable).
Returns `{ acts, total, page, pageSize, hasMore, counts }`. Page size is 30, and
acts come back newest first by default (`oldestFirst: true` flips it).

### get_act
Full text and metadata of a single act, fetched live as XML and rendered to
readable plain text.
Input: `{ id }` — the act `id` returned by `search_acts` (a numeric string).
Returns `{ act: { id, title, issuer, type, publishedAt, validFrom, url, text }, found }`.
A missing id returns `{ act: null, found: false }` rather than an error.

### get_act_metadata
The same act header without the full text body. It makes the same single network
call as `get_act`; the only difference is a smaller response that omits the
potentially large text. Use it when you have an act id from outside a search (a
legal citation or cross-reference) and want to confirm the act cheaply.
Input: `{ id }`.
Returns `{ act: { id, title, issuer, type, publishedAt, validFrom, url }, found }`.

Each tool returns both a structured JSON payload and a short text summary.

Note on translations: the upstream Riigi Teataja API serves Estonian text. The
search result carries a `connectedTranslationId`, but the act XML endpoint returns
404 for it, so version 1 serves Estonian text only. There is no English-text tool
or option.

## How clients pick a tool

An MCP client (Claude, Cursor, ChatGPT) does not match a fixed keyword list. It
reads each tool's name, description, and input schema from `tools/list` and
decides which to call from your request. The descriptions are written to fire on
Estonian law questions in both English and Estonian, so phrasing in either
language works.

Prompts that typically trigger `search_acts`:

- "Search Estonian law for data protection."
- "What does Estonian law say about self-defence?"
- "Find the act about kindergartens."
- "Otsi Eesti seadustikust andmekaitse kohta."
- "Mida ütleb seadus hädakaitse kohta?"

Once a result gives you an act `id`, `get_act` fetches that act's full text and
`get_act_metadata` fetches just its header. The model usually chains these on its
own: search first, then open the act you care about. You rarely need to name a
tool yourself; describe what you want and the client selects it.

## Running locally

Run the server on your own machine with either Node or Docker. Both serve the
same MCP endpoint over streamable HTTP at the server root, normally
`http://localhost:8788/`.

### With Node

#### Requirements

- Node.js 20 or newer.

#### Step-by-step guide

1. Clone the repository and enter it.

   ```bash
   git clone <repo-url> riigiteataja-ee-ai-mcp
   cd riigiteataja-ee-ai-mcp
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Run the unit tests to confirm everything works.

   ```bash
   npm test
   ```

4. Start the server. This runs the Worker locally with workerd, no Cloudflare
   account needed.

   ```bash
   npm run dev
   ```

   Wrangler prints the local URL, normally `http://localhost:8788`.

5. Smoke-test it with curl.

   ```bash
   curl -s -X POST http://localhost:8788/ \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
   ```

   You should see `search_acts`, `get_act`, `get_act_metadata`.

### With Docker (or Podman)

#### Requirements

- Docker, or Podman (use `podman compose` in place of `docker compose`).
- You do not need Node or npm on the host — they run inside the container.

#### Step-by-step guide

1. Build and start the container.
   - **Docker**
      ```bash
      docker compose up --build -d
      ```
   - **Podman**
      ```bash
      podman compose up --build -d
      ```

2. The MCP endpoint is now at `http://localhost:8788/`. Test it with the same
   curl command as in the Node steps above.

3. View the logs with `docker compose logs -f`, and stop it with
   `docker compose down`.

   To change the host port, edit the `ports` mapping in `docker-compose.yml`, for
   example `"9000:8788"` to serve on port 9000.

Note: the container runs `wrangler dev`, which is a development server. It is
fine for personal and small-team self-hosting. For a hardened public deployment,
prefer the Cloudflare path below.

### Connecting a local MCP client

Point your client at the local server URL, `http://localhost:8788/`. A local
server generally needs a bit of manual configuration, shown per client below.

> **Note on ChatGPT:** ChatGPT cannot connect to a local server. It only accepts
> a public HTTPS URL, so `http://localhost:8788/` will not work. To use the
> server with ChatGPT, deploy it first (see [Deploy to Cloudflare](#deploy-to-cloudflare))
> and connect to the public `workers.dev` URL.

#### Claude Code

```bash
claude mcp add --transport http riigi-teataja http://localhost:8788/
```

Then list tools with `/mcp` inside Claude Code.

#### Cursor

Add this to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "riigi-teataja": {
      "url": "http://localhost:8788/"
    }
  }
}
```

#### Claude Desktop

Claude Desktop reaches a local HTTP server through the `mcp-remote` bridge.
Open Settings → Developer → Edit Config to open `claude_desktop_config.json`.

This file usually already has other settings in it. Do not paste over the whole
file. Add only the `mcpServers` block. If you already have an `mcpServers` block,
add the `riigi-teataja` entry inside it and leave the rest alone.

The part to add:

```json
"mcpServers": {
  "riigi-teataja": {
    "command": "npx",
    "args": ["mcp-remote", "http://localhost:8788/"]
  }
}
```

> **Warning: do not copy the example below.** It is for illustration only, to
> show where the `mcpServers` block sits among other keys. The `preferences`,
> `coworkUserFilesPath`, and other values are placeholders. Copying it will
> overwrite your real settings. Only add the `mcpServers` block shown above to
> your own existing file.

```json
{
  "preferences": {
    "remoteToolsDeviceName": "your-device-name",
    "coworkWebSearchEnabled": true,
    "coworkScheduledTasksEnabled": true,
    "ccdScheduledTasksEnabled": true
  },
  "coworkUserFilesPath": "/Users/you/Documents/Claude",
  "mcpServers": {
    "riigi-teataja": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8788/"]
    }
  }
}
```

Save the file and restart Claude Desktop. The Riigi Teataja tools appear in the
tools menu.

#### MCP Inspector (for testing)

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector, choose transport "Streamable HTTP", enter the server URL, and
exercise the three tools.

## Deploy to Cloudflare

### Step-by-step guide

1. Log in once.

   ```bash
   npx wrangler login
   ```

2. Deploy.

   ```bash
   npm run deploy
   ```

   Wrangler prints the public `https://riigi-teataja-mcp.<your-subdomain>.workers.dev`
   URL. A custom domain is optional and can be added later in the Cloudflare
   dashboard.

### Connecting an MCP client

A deployed server has a public `https://...workers.dev/` URL, so most clients can
add it straight through their connector / integrations interface, without editing
config files:

- **Claude Desktop / Claude.ai**: Settings, Connectors, Add custom connector, and
  paste your `workers.dev` URL.
- **ChatGPT**: add it as a custom connector (on plans that support remote MCP
  connectors).

The CLI and config-file methods from
[Connecting a local MCP client](#connecting-a-local-mcp-client) also work — just
use your `workers.dev` URL instead of `http://localhost:8788/`.

## Notes

Version 1 is a stateless Worker on the Cloudflare free tier. It does not use
Durable Objects, so there is no Workers Paid plan cost. The Riigi Teataja API
serves Estonian text only; English translations are not available in version 1.

## License

MIT — free to use, modify and distribute, with **no warranty; use it at your
own risk**. See [LICENSE](LICENSE).
