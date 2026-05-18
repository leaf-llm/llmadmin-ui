#!/bin/bash
set -e

# Package Windows installer using Inno Setup
# Usage: ./scripts/package-windows.sh <dist_dir> <output_exe> [version]

DIST_DIR="${1:?Usage: $0 <dist_dir> <output_exe> [version]}"
OUTPUT_EXE="${2:?Usage: $0 <dist_dir> <output_exe> [version]}"
VERSION="${3:-}"

# Read version from package.json if not provided
if [ -z "$VERSION" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  VERSION=$(node -p "require('$REPO_ROOT/package.json').version" 2>/dev/null || echo "1.0.0")
fi

echo "Packaging Local LLM Gateway v$VERSION"
echo "Dist dir: $DIST_DIR"
echo "Output: $OUTPUT_EXE"

cd "$DIST_DIR"

# Verify required files exist
for f in "local-llm-gateway-win_x64.exe" "portkey-gateway.exe" "resources.neu"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: Required file not found: $f"
    exit 1
  fi
done

# Copy icon and ISS script into dist dir (so relative Source paths in .iss resolve)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/../desktop/resources/icon.ico" "./icon.ico"
cp "$SCRIPT_DIR/local-llm-gateway.iss" "./local-llm-gateway.iss"

# Find ISCC.exe (Inno Setup Command Line Compiler)
ISCC=""
CANDIDATES=(
  "C:/Program Files (x86)/Inno Setup 6/ISCC.exe"
  "C:/Program Files/Inno Setup 6/ISCC.exe"
)
for c in "${CANDIDATES[@]}"; do
  if [ -f "$c" ]; then
    ISCC="$c"
    break
  fi
done

if [ -z "$ISCC" ]; then
  # Also check PATH
  if command -v ISCC.exe &>/dev/null; then
    ISCC="ISCC.exe"
  elif command -v iscc &>/dev/null; then
    ISCC="iscc"
  else
    echo "ERROR: ISCC.exe not found. Install Inno Setup 6."
    exit 1
  fi
fi

echo "Using ISCC: $ISCC"

# Determine output directory and filename
OUTPUT_DIR="$(dirname "$OUTPUT_EXE")"
OUTPUT_FILENAME="$(basename "$OUTPUT_EXE" .exe)"

# Compile the installer
# MSYS_NO_PATHCONV=1 prevents Git Bash (MSYS2) from converting /D, /O, /F
# flags into Windows paths, which ISCC would misinterpret as script filenames.
MSYS_NO_PATHCONV=1 "$ISCC" /DAppVersion="$VERSION" /O"$OUTPUT_DIR" /F"$OUTPUT_FILENAME" "./local-llm-gateway.iss"

# Verify output
if [ ! -f "$OUTPUT_EXE" ]; then
  echo "ERROR: Installer was not created at $OUTPUT_EXE"
  exit 1
fi

# Cleanup temp files
rm -f "./icon.ico" "./local-llm-gateway.iss"

echo ""
echo "Packaging complete: $OUTPUT_EXE"
ls -la "$OUTPUT_EXE"
