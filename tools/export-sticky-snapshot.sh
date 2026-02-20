#!/bin/bash
# Export a snapshot of the sticky example
# Usage: ./tools/export-sticky-snapshot.sh <filename>

FILENAME=${1:-test/replay/sticky-bug.json}
COLUMNS=180 LINES=40 node --loader ts-node/esm examples/sticky/index.ts --export "$FILENAME" --items 2 --scroll-down 40
sleep 1
npx tsx src/worker/dump-replay.ts "$FILENAME"
