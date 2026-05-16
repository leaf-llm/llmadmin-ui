#!/bin/bash
set -e

# Package Windows installer using Inno Setup
# Usage: ./scripts/package-windows.sh <dist_dir> <output_dir>
#
# Requires Inno Setup 6.x to be installed (https://jrsoftware.org/isinfo.php)
# On Windows: C:\Program Files (x86)\Inno Setup 6\ISCC.exe
# On macOS/Linux with Wine: wine ISCC.exe (set ISCC_PATH accordingly)

DIST_DIR="${1:?Usage: $0 <dist_dir>}"
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
  echo "Expected paths:"
  echo "  C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"
  echo "  C:\\Program Files\\Inno Setup 6\\ISCC.exe"
  exit 1
fi

echo "Using Inno Setup: $ISCC"

# Create a temporary copy of the ISS file with correct paths
TEMP_ISS="${DIST_DIR}/package-windows-temp.iss"
cat "$ISS_FILE" | sed "s|OutputDir=.|OutputDir=$OUTPUT_DIR|" > "$TEMP_ISS"

# Add version from package.json if available
APP_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.15.2")
TEMP_ISS_CONTENT=$(cat "$TEMP_ISS")
TEMP_ISS_CONTENT=$(echo "$TEMP_ISS_CONTENT" | sed "s|#define MyAppVersion.*|#define MyAppVersion \"$APP_VERSION\"|")
echo "$TEMP_ISS_CONTENT" > "$TEMP_ISS"

echo "Compiling Inno Setup script..."
cd "$DIST_DIR"
"$ISCC" "$TEMP_ISS"

# Cleanup
rm -f "$TEMP_ISS"

echo ""
echo "Packaging complete. Output in: $OUTPUT_DIR"