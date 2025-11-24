#!/bin/bash
# Export a snapshot of the scroll example
# Usage: ./tools/export-scroll-snapshot.sh <filename>

FILENAME=${1:-test/replay/sticky-scroll-demo.json}
COLUMNS=180 LINES=40 node --loader ts-node/esm examples/scroll/index.ts --export "$FILENAME" --items 30 --scroll-down 10
sleep 1
npx tsx src/worker/dump-replay.ts "$FILENAME"
