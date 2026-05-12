#!/bin/bash
set -e

# Package Windows portable exe using 7-Zip SFX
# Usage: ./scripts/package-windows.sh <dist_dir> <output_exe>

DIST_DIR="${1:?Usage: $0 <dist_dir> <output_exe>}"
OUTPUT_EXE="${2:?Usage: $0 <dist_dir> <output_exe>}"

cd "$DIST_DIR"

# Find the main Neutralinojs executable
MAIN_EXE=$(find . -name "local-llm-gateway-win_x64.exe" -type f 2>/dev/null | head -1)
if [ -z "$MAIN_EXE" ]; then
  MAIN_EXE=$(find . -name "local-llm-gateway.exe" -type f 2>/dev/null | head -1)
fi
if [ -z "$MAIN_EXE" ]; then
  echo "ERROR: Could not find local-llm-gateway.exe in $DIST_DIR"
  exit 1
fi

echo "Found exe: $MAIN_EXE"
echo "Output: $OUTPUT_EXE"

# Find 7z.exe
SEVENZ_CMD="7z.exe"
if ! command -v "$SEVENZ_CMD" &> /dev/null && [ ! -f "$SEVENZ_CMD" ]; then
  SEVENZ_PATHS=(
    "C:/Program Files/7-Zip/7z.exe"
    "/c/Program Files/7-Zip/7z.exe"
    "C:/Program Files (x86)/7-Zip/7z.exe"
  )
  for sz_path in "${SEVENZ_PATHS[@]}"; do
    if [ -f "$sz_path" ]; then
      SEVENZ_CMD="$sz_path"
      break
    fi
  done
fi

echo "Using 7-Zip: $SEVENZ_CMD"

# Find 7zSD.sfx (optional SFX module for smaller size, fallback to 7z.sfx)
SFX_MODULE=""
SFX_PATHS=(
  "C:/Program Files/7-Zip/7z.sfx"
  "/c/Program Files/7-Zip/7z.sfx"
  "C:/Program Files (x86)/7-Zip/7z.sfx"
)
for sfx_path in "${SFX_PATHS[@]}"; do
  if [ -f "$sfx_path" ]; then
    SFX_MODULE="$sfx_path"
    break
  fi
done

if [ -z "$SFX_MODULE" ]; then
  echo "WARNING: 7z.sfx not found, using -sfx flag instead"
  "$SEVENZ_CMD" a -sfx -mx=9 "$OUTPUT_EXE" . -xr!*.tmp -xr!node_modules -xr!.git -xr!.tmp-evb
else
  echo "Using SFX module: $SFX_MODULE"

  # Create 7z archive (no SFX flag, we'll prepend the module)
  "$SEVENZ_CMD" a -mx=9 "${OUTPUT_EXE}.7z" . -xr!*.tmp -xr!node_modules -xr!.git -xr!.tmp-evb

  # Prepend SFX module to create the final exe
  cat "$SFX_MODULE" "${OUTPUT_EXE}.7z" > "$OUTPUT_EXE"
  rm "${OUTPUT_EXE}.7z"
fi

echo "Packaging complete: $OUTPUT_EXE"
