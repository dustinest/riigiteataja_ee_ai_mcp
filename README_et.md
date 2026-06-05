# Riigi Teataja MCP-server

Kaugjuurdepääsuga, ainult lugemiseks mõeldud MCP-server, mis pakub Eesti riigi
ametlikku väljaannet Riigi Teataja (riigiteataja.ee) MCP-klientidele nagu Claude
Desktop, Claude Code, Cursor ja ChatGPT. Server katab avaliku Riigi Teataja API:
õigusaktide täistekstiotsing ja üksiku akti pärimine struktureeritud, loetava
sisuna toore XML-i asemel. Versioonil 1 autentimist ei ole.

See töötab olekuvaba Cloudflare Workerina (tasuta tasandil, ilma Durable
Objectiteta) ning seda saab soovi korral ka ise Dockeri või Podmaniga majutada,
kui sa ei taha Cloudflare'i kasutada.

_**NB!** kogu see dokumentatsioon on masintõlge ingliskeelsest materjalist._


## Funktsioonid

Siin on täielik loend funktsioonidest, mis on teostatud ja kasutusele võetud.

**Tööriistad**
- `search_acts`: Eesti õigusaktide täistekstiotsing.
- `get_act`: üksiku akti täistekst ja metaandmed, XML teisendatud loetavaks lihttekstiks.
- `get_act_metadata`: üksiku akti ainult päis, odavaks kinnitamiseks.

**Otsing**
- Otsing pealkirjast, tekstist või mõlemast (`inTitle`, `inText`).
- Kaks otsisõna, ühendatud operaatoriga `AND` või `OR`.
- Eesti morfoloogilise otsingu lüliti (`morph`).
- Staatuse filter nelja väärtusega: `KEHTIVAD_KEHTETUTETA` (kehtivad, vaikimisi), `JOUSTUVAD`, `KEHTETUD`, `KOIK_OTSITAVAD`.
- Sortimine kehtivuse alguskuupäeva järgi, uuemad või vanemad enne (`oldestFirst`).
- Lehekülgedeks jaotamine, 30 tulemust lehel, koos `hasMore` lipuga.
- Staatuse jaotuse loendurid (kehtivad, kehtetud, jõustuvad).
- Sobitatud tekstilõigud koos loetava struktuurse asukohaga, näiteks "ptk 22, § 240 lg 2 p 5".

**Aktid**
- Akti täistekst tõmmatakse otse XML-ina ja teisendatakse loetavaks lihttekstiks.
- Ainult päise pärimine, mis jätab välja suure tekstikeha.
- Puuduvad aktid tagastavad `{ found: false }`, mitte vea.

**Väljund**
- Iga tööriist tagastab nii struktureeritud JSON-andmed kui ka lühikese tekstilise kokkuvõtte.

**Käituskeskkond ja protokoll**
- Olekuvaba Cloudflare Worker tasuta tasandil, ilma Durable Objectiteta.
- Ise majutatav Dockeri või Podmaniga.
- MCP striimitava HTTP kaudu, protokolli versioon 2025-06-18.
- JSON-RPC üksik- ja hulgipäringud, koos CORS-iga.
- Vastuste vahemällu salvestamine 10-minutilise TTL-iga (Workers Cache API).
- Ainult lugemiseks, ilma autentimiseta, ilma kasutajaandmeteta.
- Tööriistade kirjeldused on inglise ja eesti keeles, seega päringud mõlemas keeles töötavad.

**Piirangud**
- Ainult eestikeelne tekst; ingliskeelseid tõlkeid versioonis 1 ei ole.

## Sisukord

- [Funktsioonid](#funktsioonid)
- [Tööriistad](#tööriistad)
  - [search_acts](#search_acts)
  - [get_act](#get_act)
  - [get_act_metadata](#get_act_metadata)
- [Kuidas klient tööriista valib](#kuidas-klient-tööriista-valib)
- [Kohalik käivitamine](#kohalik-käivitamine)
  - [Node'iga](#nodeiga)
  - [Dockeriga (või Podmaniga)](#dockeriga-või-podmaniga)
  - [Kohaliku MCP-kliendi ühendamine](#kohaliku-mcp-kliendi-ühendamine)
- [Juuruta Cloudflare'i](#juuruta-cloudflarei)
  - [MCP-kliendi ühendamine](#mcp-kliendi-ühendamine)
- [Märkused](#märkused)
- [Litsents](#litsents)

## Tööriistad

### search_acts
Eesti õigusaktide täistekstiotsing.
Sisend: `{ query, query2?, operator?: "AND" | "OR", inText?, inTitle?, morph?, status?, oldestFirst?, page? }`
Vaikeväärtused: operator AND, inText true, inTitle true, morph false, status
KEHTIVAD_KEHTETUTETA, oldestFirst false, page 1.
`status` on üks järgmistest: `KEHTIVAD_KEHTETUTETA` (kehtivad, vaikimisi),
`JOUSTUVAD` (jõustuvad), `KEHTETUD` (kehtetud), `KOIK_OTSITAVAD` (kõik otsitavad).
Tagastab `{ acts, total, page, pageSize, hasMore, counts }`. Lehe suurus on 30 ja
aktid tulevad vaikimisi uuemad enne (`oldestFirst: true` pöörab järjekorra).

### get_act
Üksiku akti täistekst ja metaandmed, mis tõmmatakse otse XML-ina ja teisendatakse
loetavaks lihttekstiks.
Sisend: `{ id }` — akti `id`, mille tagastab `search_acts` (numbriline sõne).
Tagastab `{ act: { id, title, issuer, type, publishedAt, validFrom, url, text }, found }`.
Puuduva id korral tagastab `{ act: null, found: false }`, mitte vea.

### get_act_metadata
Sama akti päis ilma täistekstita. See teeb sama üheainsa võrgupäringu nagu
`get_act`; ainus erinevus on väiksem vastus, mis jätab välja võimaliku suure
teksti. Kasuta seda, kui sul on akti id väljaspool otsingut (õiguslik viide või
ristviide) ja tahad akti odavalt kinnitada.
Sisend: `{ id }`.
Tagastab `{ act: { id, title, issuer, type, publishedAt, validFrom, url }, found }`.

Iga tööriist tagastab nii struktureeritud JSON-andmed kui ka lühikese tekstilise
kokkuvõtte.

Märkus tõlgete kohta: Riigi Teataja API pakub eestikeelset teksti. Otsingutulemus
sisaldab välja `connectedTranslationId`, kuid akti XML-i lõpp-punkt tagastab selle
kohta 404, seega versioon 1 pakub ainult eestikeelset teksti. Ingliskeelse teksti
tööriista ega valikut ei ole.

## Kuidas klient tööriista valib

MCP-klient (Claude, Cursor, ChatGPT) ei kasuta kindlat märksõnade loendit. Ta
loeb iga tööriista nime, kirjelduse ja sisendskeemi `tools/list` kaudu ning
otsustab sinu päringu põhjal, millist neist kutsuda. Kirjeldused on koostatud nii,
et need käivituksid Eesti õiguse küsimustel nii inglise kui eesti keeles, seega
sõnastus mõlemas keeles töötab.

Päringud, mis tavaliselt käivitavad `search_acts`:

- "Otsi Eesti seadustikust andmekaitse kohta."
- "Mida ütleb seadus hädakaitse kohta?"
- "Leia lasteaedade kohta käiv õigusakt."
- "Search Estonian law for data protection."
- "What does Estonian law say about self-defence?"

Kui tulemus annab akti `id`, tõmbab `get_act` selle akti täisteksti ja
`get_act_metadata` ainult päise. Mudel teeb need sammud tavaliselt ise järjest:
esmalt otsing, seejärel ava sind huvitav akt. Tööriista nime ei pea ise nimetama, kirjelda
soovitut ja klient valib õige.

## Kohalik käivitamine

Käivita server oma masinas kas Node'i või Dockeriga. Mõlemad pakuvad sama MCP
lõpp-punkti striimitava HTTP kaudu serveri juurest, tavaliselt
`http://localhost:8788/`.

### Node'iga

#### Eeldused

- Node.js 20 või uuem.

#### Samm-sammuline juhend

1. Klooni repositoorium ja liigu sinna.

   ```bash
   git clone <repo-url> riigiteataja-ee-ai-mcp
   cd riigiteataja-ee-ai-mcp
   ```

2. Paigalda sõltuvused.

   ```bash
   npm install
   ```

3. Käivita ühiktestid, et veenduda kõige toimimises.

   ```bash
   npm test
   ```

4. Käivita server. See käivitab Workeri kohalikult workerd abil, Cloudflare'i
   kontot pole vaja.

   ```bash
   npm run dev
   ```

   Wrangler trükib kohaliku URL-i, tavaliselt `http://localhost:8788`.

5. Tee kiire kontroll curl'iga.

   ```bash
   curl -s -X POST http://localhost:8788/ \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
   ```

   Peaksid nägema `search_acts`, `get_act`, `get_act_metadata`.

### Dockeriga (või Podmaniga)

#### Eeldused

- Docker või Podman (kasuta `docker compose` asemel `podman compose`).
- Hostis pole Node'i ega npm-i vaja — need töötavad konteineri sees.

#### Samm-sammuline juhend

1. Ehita ja käivita konteiner.
   - **Docker**
      ```bash
      docker compose up --build -d
      ```
   - **Podman**
      ```bash
      podman compose up --build -d
      ```

2. MCP lõpp-punkt on nüüd aadressil `http://localhost:8788/`. Testi seda sama
   curl-käsuga nagu Node'i sammudes eespool.

3. Vaata logisid käsuga `docker compose logs -f` ja peata see käsuga
   `docker compose down`.

   Hosti pordi muutmiseks redigeeri `docker-compose.yml` failis `ports`
   vastendust, näiteks `"9000:8788"`, et teenindada pordil 9000.

Märkus: konteiner käivitab `wrangler dev`, mis on arendusserver. See sobib
isiklikuks ja väikese tiimi ise majutamiseks. Avalikuks ja turvalisemaks
juurutuseks eelista allpool kirjeldatud Cloudflare'i teed.

### Kohaliku MCP-kliendi ühendamine

Suuna oma klient kohalikule serveri URL-ile `http://localhost:8788/`. Kohalik
server vajab tavaliselt veidi käsitsi seadistamist, mis on iga kliendi kohta
allpool näidatud.

> **Märkus ChatGPT kohta:** ChatGPT ei saa ühenduda kohaliku serveriga. See
> aktsepteerib ainult avalikku HTTPS-URL-i, seega `http://localhost:8788/` ei
> tööta. Serveri kasutamiseks ChatGPT-ga juuruta see esmalt (vt
> [Juuruta Cloudflare'i](#juuruta-cloudflarei)) ja ühenda avaliku `workers.dev`
> URL-i kaudu.

#### Claude Code

```bash
claude mcp add --transport http riigi-teataja http://localhost:8788/
```

Seejärel kuva tööriistad käsuga `/mcp` Claude Code'i sees.

#### Cursor

Lisa see faili `.cursor/mcp.json` (projekt) või `~/.cursor/mcp.json` (globaalne):

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

Claude Desktop jõuab kohaliku HTTP-serverini `mcp-remote` silla kaudu. Ava
Settings → Developer → Edit Config, et avada `claude_desktop_config.json`.

Selles failis on tavaliselt juba muud seaded. Ära kirjuta kogu faili üle. Lisa
ainult `mcpServers` plokk. Kui sul on juba `mcpServers` plokk, lisa `riigi-teataja`
kirje selle sisse ja jäta ülejäänu puutumata.

Lisatav osa:

```json
"mcpServers": {
  "riigi-teataja": {
    "command": "npx",
    "args": ["mcp-remote", "http://localhost:8788/"]
  }
}
```

> **Hoiatus: ära kopeeri allolevat näidet.** See on ainult illustratsiooniks,
> näitamaks, kus `mcpServers` plokk teiste võtmete seas asub. `preferences`,
> `coworkUserFilesPath` ja muud väärtused on kohatäited. Selle kopeerimine
> kirjutab sinu päris seaded üle. Lisa oma olemasolevasse faili ainult eespool
> näidatud `mcpServers` plokk.

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

Salvesta fail ja taaskäivita Claude Desktop. Riigi Teataja tööriistad ilmuvad
tööriistade menüüsse.

#### MCP Inspector (testimiseks)

```bash
npx @modelcontextprotocol/inspector
```

Inspectoris vali transport "Streamable HTTP", sisesta serveri URL ja proovi
kolme tööriista.

## Juuruta Cloudflare'i

### Samm-sammuline juhend

1. Logi üks kord sisse.

   ```bash
   npx wrangler login
   ```

2. Juuruta.

   ```bash
   npm run deploy
   ```

   Wrangler näitab avaliku
   `https://riigi-teataja-mcp.<sinu-alamdomeen>.workers.dev` URL-i. Kohandatud
   domeen on valikuline ja selle saab hiljem Cloudflare'i töölaual lisada.

### MCP-kliendi ühendamine

Juurutatud serveril on avalik `https://...workers.dev/` URL, seega enamik
kliente saab selle lisada otse oma konnektorite / integratsioonide liidese
kaudu, ilma konfiguratsioonifaile redigeerimata:

- **Claude Desktop / Claude.ai**: Settings, Connectors, Add custom connector ja
  kleebi oma `workers.dev` URL.
- **ChatGPT**: lisa kohandatud konnektorina (plaanidel, mis toetavad kaug-MCP
  konnektoreid).

Jaotise [Kohaliku MCP-kliendi ühendamine](#kohaliku-mcp-kliendi-ühendamine)
CLI- ja konfiguratsioonimeetodid töötavad samuti — kasuta lihtsalt oma
`workers.dev` URL-i `http://localhost:8788/` asemel.

## Märkused

Versioon 1 on olekuvaba Worker Cloudflare'i tasuta tasandil. See ei kasuta
Durable Objecte, seega Workers Paid plaani kulu ei teki. Riigi Teataja API pakub
ainult eestikeelset teksti; ingliskeelseid tõlkeid versioonis 1 ei ole.

## Litsents

MIT — vaba kasutada, muuta ja levitada, **ilma igasuguse garantiita; kasuta
omal vastutusel**. Vaata [LICENSE](LICENSE).
