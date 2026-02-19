#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW_DIR="${1:-$ROOT_DIR/assets/models/raw}"
OUT_DIR="${2:-$ROOT_DIR/assets/models/game}"

TEXTURE_SIZE="${TEXTURE_SIZE:-1024}"
SIMPLIFY_RATIO="${SIMPLIFY_RATIO:-0.92}"
SIMPLIFY_ERROR="${SIMPLIFY_ERROR:-0.0009}"

mkdir -p "$RAW_DIR" "$OUT_DIR"
shopt -s nullglob

inputs=("$RAW_DIR"/*.glb "$RAW_DIR"/*.gltf)
if [ ${#inputs[@]} -eq 0 ]; then
    echo "No input files found in: $RAW_DIR"
    echo "Put .glb/.gltf files in assets/models/raw and run again."
    exit 1
fi

echo "Optimizing ${#inputs[@]} model(s)..."
for input in "${inputs[@]}"; do
    file="$(basename "$input")"
    name="${file%.*}"
    output="$OUT_DIR/$name.glb"
    report="$OUT_DIR/$name.inspect.txt"

    echo " - $file -> $(basename "$output")"
    npx -y @gltf-transform/cli optimize "$input" "$output" \
        --compress meshopt \
        --flatten false \
        --join false \
        --instance true \
        --prune true \
        --simplify true \
        --simplify-ratio "$SIMPLIFY_RATIO" \
        --simplify-error "$SIMPLIFY_ERROR" \
        --texture-compress webp \
        --texture-size "$TEXTURE_SIZE" \
        --weld true

    npx -y @gltf-transform/cli inspect "$output" > "$report"
done

node "$ROOT_DIR/tools/furniture-pipeline/build-manifest.mjs" "$OUT_DIR"

echo
echo "Done."
echo "Output: $OUT_DIR"
echo "Manifest: $OUT_DIR/manifest.json"
