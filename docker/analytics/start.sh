#!/bin/sh
# Starts Analytics on loopback :4291 and relays the container's :4290 to it (see Dockerfile). Exits if either stops.
set -eu
PORT=4291 node scripts/serve.mjs &
server=$!
socat TCP-LISTEN:4290,fork,reuseaddr TCP:127.0.0.1:4291 &
relay=$!
trap 'kill "$server" "$relay" 2>/dev/null' INT TERM
while kill -0 "$server" 2>/dev/null && kill -0 "$relay" 2>/dev/null; do sleep 2; done
kill "$server" "$relay" 2>/dev/null || true
exit 1
