# Run the MCP server locally with workerd (via wrangler dev). No Cloudflare
# account needed. This is the self-host path.
FROM node:22-slim

WORKDIR /app

# workerd verifies upstream TLS against the system CA bundle, which the slim image
# does not ship. Without this, HTTPS fetches to the upstream API fail.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer caches when only source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json wrangler.jsonc ./
COPY src ./src

ENV WRANGLER_SEND_METRICS=false
EXPOSE 8788

# Bind to 0.0.0.0 so the endpoint is reachable from outside the container.
CMD ["npx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8788"]
