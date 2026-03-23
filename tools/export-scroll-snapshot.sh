#!/bin/bash
# Export a snapshot of the scroll example
# Usage: ./tools/export-scroll-snapshot.sh <filename> <cols> <rows>

FILENAME=${1:-test/replay/sticky-scroll-demo.json}
COLS=${2:-181}
RWS=${3:-77}
stty cols "$COLS" rows "$RWS"
node --loader ts-node/esm examples/scroll/index.ts --export "$FILENAME" --items 30 --scroll-down 10 --columns "$COLS" --rows "$RWS"
sleep 1
npx tsx tools/dump-replay.ts "$FILENAME"
