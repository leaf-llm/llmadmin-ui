#!/bin/bash
set -e

# Package Windows installer using Inno Setup
# Usage: ./scripts/package-windows.sh <dist_dir> [output_dir]
#
# Requires Inno Setup 6.x to be installed (https://jrsoftware.org/isinfo.php)
# On Windows: C:\Program Files (x86)\Inno Setup 6\ISCC.exe
# On macOS/Linux with Wine: wine ISCC.exe

DIST_DIR="${1:?Usage: $0 <dist_dir> [output_dir]}"
OUTPUT_DIR="${2:-.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISS_FILE="$SCRIPT_DIR/package-windows.iss"

echo "Distribution directory: $DIST_DIR"
echo "Output directory: $OUTPUT_DIR"

# Find Inno Setup compiler
ISCC=""
if [ -f "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" ]; then
  ISCC="/c/Program Files (x86)/Inno Setup 6/ISCC.exe"
elif [ -f "/c/Program Files/Inno Setup 6/ISCC.exe" ]; then
  ISCC="/c/Program Files/Inno Setup 6/ISCC.exe"
elif command -v ISCC &> /dev/null; then
  ISCC="ISCC"
fi

if [ -z "$ISCC" ]; then
  echo "ERROR: Inno Setup 6 not found."
  echo "Please install from https://jrsoftware.org/isinfo.php"
  exit 1
fi

echo "Using Inno Setup: $ISCC"

# Get version from package.json
APP_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.15.2")

# Create a temporary copy of the ISS file in a temp location
TEMP_DIR=$(mktemp -d)
TEMP_ISS="${TEMP_DIR}/package-windows-temp.iss"
cat "$ISS_FILE" | sed \
  -e "s|#define MyAppSourceDir.*|#define MyAppSourceDir \"$DIST_DIR\"|" \
  -e "s|OutputDir=.|OutputDir=$OUTPUT_DIR|" \
  -e "s|#define MyAppVersion.*|#define MyAppVersion \"$APP_VERSION\"|" \
  > "$TEMP_ISS"

echo "Compiling Inno Setup script..."
"$ISCC" "$TEMP_ISS"

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "Packaging complete. Output in: $OUTPUT_DIR"