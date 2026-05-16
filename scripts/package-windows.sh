#!/bin/bash
set -e

# Package Windows installer using Inno Setup
# Usage: ./scripts/package-windows.sh <dist_dir>
#
# Requires Inno Setup 6.x to be installed (https://jrsoftware.org/isinfo.php)
# On Windows: C:\Program Files (x86)\Inno Setup 6\ISCC.exe

DIST_DIR="${1:?Usage: $0 <dist_dir>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISS_FILE="$SCRIPT_DIR/package-windows.iss"

# Convert to Windows path for ISCC
to_windows_path() {
  local p="$1"
  case "$p" in
    /[a-z]/*)
      local drv="${p:1:1}"
      local rest="${p:3}"
      echo "${drv}:\\${rest//\//\\}"
      ;;
    *)
      echo "$p"
      ;;
  esac
}

DIST_DIR_WIN=$(to_windows_path "$DIST_DIR")
ISS_FILE_WIN=$(to_windows_path "$ISS_FILE")

echo "Distribution directory (Windows): $DIST_DIR_WIN"

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

# Copy ISS to temp location with modified values
TEMP_ISS="${DIST_DIR}/package-windows-temp.iss"

cp "$ISS_FILE" "$TEMP_ISS"
sed -i "s|^#define MyAppSourceDir.*|#define MyAppSourceDir \".\"|" "$TEMP_ISS"
sed -i "s|^OutputDir=.|OutputDir=.|" "$TEMP_ISS"
sed -i "s|^#define MyAppVersion.*|#define MyAppVersion \"$APP_VERSION\"|" "$TEMP_ISS"

echo "Compiling Inno Setup script..."
cd "$DIST_DIR"
"$ISCC" "$TEMP_ISS"

# Cleanup
rm -f "$TEMP_ISS"

echo ""
echo "Packaging complete."