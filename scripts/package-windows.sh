#!/bin/bash
set -e

# Package Windows installer using Inno Setup
# Usage: ./scripts/package-windows.sh <dist_dir> [output_dir]
#
# Requires Inno Setup 6.x to be installed (https://jrsoftware.org/isinfo.php)
# On Windows: C:\Program Files (x86)\Inno Setup 6\ISCC.exe

DIST_DIR="${1:?Usage: $0 <dist_dir> [output_dir]}"
OUTPUT_DIR="${2:-$DIST_DIR}"

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

# Create temp ISS in DIST_DIR (ISCC resolves SourceDir relative to ISS file location)
TEMP_ISS="${DIST_DIR}/package-windows-temp.iss"

awk -v version="$APP_VERSION" '
{
  if (/^#define MyAppSourceDir/) {
    print "#define MyAppSourceDir \".\""
  } else if (/^OutputDir=/) {
    print "OutputDir=."
  } else if (/^#define MyAppVersion/) {
    printf "#define MyAppVersion \"%s\"\n", version
  } else {
    print
  }
}
' "$ISS_FILE" > "$TEMP_ISS"

echo "Compiling Inno Setup script..."
cd "$DIST_DIR"
"$ISCC" "$TEMP_ISS"

# Cleanup
rm -f "$TEMP_ISS"

echo ""
echo "Packaging complete. Output in: $DIST_DIR"