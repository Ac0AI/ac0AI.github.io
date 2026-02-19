#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW_DIR="${RAW_DIR:-$ROOT_DIR/assets/models/raw}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/assets/models/game}"

if [ "$#" -lt 2 ]; then
    echo "Usage: tools/furniture-pipeline/convert-fbx-static.sh <input.fbx> <output_id>"
    echo "Example:"
    echo "  tools/furniture-pipeline/convert-fbx-static.sh \\"
    echo "    assets/models/unity_source/body/.../Body_010.fbx \\"
    echo "    u_body_body_010_static"
    exit 1
fi

INPUT_FBX="$1"
OUTPUT_ID="$2"

if [ ! -f "$INPUT_FBX" ]; then
    echo "Input FBX not found: $INPUT_FBX"
    exit 1
fi

mkdir -p "$RAW_DIR" "$OUT_DIR"

TMP_DIR="$(mktemp -d)"
OBJ_FILE="$TMP_DIR/$OUTPUT_ID.obj"
RAW_GLB="$RAW_DIR/$OUTPUT_ID.glb"
OUT_GLB="$OUT_DIR/$OUTPUT_ID.glb"
OUT_REPORT="$OUT_DIR/$OUTPUT_ID.inspect.txt"

echo "Converting rigged FBX to static mesh pipeline..."
echo "  FBX:  $INPUT_FBX"
echo "  ID:   $OUTPUT_ID"

# Step 1: FBX -> OBJ strips skin/bone data.
assimp export "$INPUT_FBX" "$OBJ_FILE"

# Step 2: OBJ -> GLB (static)
assimp export "$OBJ_FILE" "$RAW_GLB"

# Step 3: Optimize for browser runtime
npx -y @gltf-transform/cli optimize "$RAW_GLB" "$OUT_GLB" \
    --compress meshopt \
    --flatten false \
    --join false \
    --instance true \
    --prune true \
    --simplify false \
    --texture-compress webp \
    --texture-size 1024 \
    --weld true

npx -y @gltf-transform/cli inspect "$OUT_GLB" > "$OUT_REPORT"
node "$ROOT_DIR/tools/furniture-pipeline/build-manifest.mjs" "$OUT_DIR"

echo
echo "Done:"
echo "  $OUT_GLB"
echo "  $OUT_REPORT"
echo "  $OUT_DIR/manifest.json"
