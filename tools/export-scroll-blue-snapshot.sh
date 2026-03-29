#!/bin/bash
# Export a snapshot of the scroll blue background example
# Usage: ./tools/export-scroll-blue-snapshot.sh <filename> <cols> <rows>

FILENAME=${1:-test/replay/scroll-blue-background.json}
COLS=${2:-181}
RWS=${3:-77}
stty cols "$COLS" rows "$RWS"
node --loader ts-node/esm examples/scroll-blue-background/index.ts --export "$FILENAME"
sleep 1
npx tsx tools/dump-replay.ts "$FILENAME"
