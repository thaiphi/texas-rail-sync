# SWD Injection Analytics (thaiphi/well-injection-insights), built from a pinned commit. ZC-02, issue #38.
# Interim: Analytics' serve.mjs listens on 127.0.0.1 only. Until its own Dockerfile and HOST setting land in that repo,
# a socat relay on :4290 forwards to the unchanged server on 127.0.0.1:4291. That server is GET/HEAD only.
FROM node:24-alpine

RUN apk add --no-cache git socat wget
ARG ANALYTICS_REPO=https://github.com/thaiphi/well-injection-insights.git
ARG ANALYTICS_REF=97fae62c86ccd85035c545b2ce8041ffe7fd5627
WORKDIR /src
RUN git clone --filter=blob:none "$ANALYTICS_REPO" . && git checkout --detach "$ANALYTICS_REF" && rm -rf .git

WORKDIR /src/swd-injection-analytics
RUN npm ci --no-audit --no-fund && npx tsc -p tsconfig.json && chown -R node:node /src

COPY start.sh /usr/local/bin/start-analytics
EXPOSE 4290
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -qO- http://127.0.0.1:4291/ >/dev/null || exit 1
CMD ["/bin/sh", "/usr/local/bin/start-analytics"]
