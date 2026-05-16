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
if [ -f /usr/bin/cygpath ]; then
  DIST_DIR_WIN=$(/usr/bin/cygpath -w "$DIST_DIR")
else
  # Convert /d/path or /c/path to D:\path
  case "$DIST_DIR" in
    /[a-z]/*)
      DRIVE="${DIST_DIR:1:1}"
      REST="${DIST_DIR:3}"
      DIST_DIR_WIN="${DRIVE}:\\${REST//\//\\}"
      ;;
    *)
      DIST_DIR_WIN="$DIST_DIR"
      ;;
  esac
fi

echo "Distribution directory: $DIST_DIR"
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

# Create temp ISS file using node to avoid shell escaping issues
TEMP_ISS="${DIST_DIR}/package-windows-temp.iss"

node - << EOF
const fs = require('fs');
const content = fs.readFileSync('$ISS_FILE', 'utf8');
const modified = content
  .replace(/#define MyAppSourceDir "[^"]*"/, '#define MyAppSourceDir "."')
  .replace(/OutputDir=./, 'OutputDir=.')
  .replace(/#define MyAppVersion "[^"]*"/, '#define MyAppVersion "$APP_VERSION"');
fs.writeFileSync('$TEMP_ISS', modified);
EOF

echo "Compiling Inno Setup script..."
cd "$DIST_DIR"
"$ISCC" "$TEMP_ISS"

# Cleanup
rm -f "$TEMP_ISS"

echo ""
echo "Packaging complete."