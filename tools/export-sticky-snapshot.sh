#!/bin/bash
# Export a snapshot of the sticky example
# Usage: ./tools/export-sticky-snapshot.sh <filename>

FILENAME=${1:-test/replay/sticky-bug.json}
COLS=${2:-181}
RWS=${3:-77}
stty cols "$COLS" rows "$RWS"
node --loader ts-node/esm examples/sticky/index.ts --export "$FILENAME" --items 12 --scroll-down 40 --columns "$COLS" --rows "$RWS"
sleep 1
npx tsx src/worker/dump-replay.ts "$FILENAME"
