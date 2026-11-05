# Texas RRC Explorer: the local Node server (scripts/serve.mjs) with its preserved evidence. ZC-02, issue #38.
# The Lovable/Vite app in this package is not part of this image; the server needs only Node built-ins and `pg`.
FROM node:24-alpine

WORKDIR /app
# Only the Postgres driver, pinned to package.json; installed before the source so code edits keep this layer cached.
RUN npm install --no-save --no-package-lock --no-audit --no-fund pg@8.16.3 \
 && apk add --no-cache wget

COPY package.json LICENSE ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY --chown=node:node lookups ./lookups
COPY --chown=node:node artifacts ./artifacts
COPY --chown=node:node collected-sources ./collected-sources
COPY --chown=node:node runs ./runs
COPY --chown=node:node watched-documents ./watched-documents

# Inside a container the server must listen on all interfaces; docker-compose.yml publishes it on the host's loopback only
# and names the one gateway address allowed to use the write routes.
ENV PORT=4391 TRRC_LISTEN_HOST=0.0.0.0
EXPOSE 4391
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -qO- http://127.0.0.1:4391/api/health >/dev/null || exit 1
CMD ["node", "scripts/serve.mjs"]
