#!/bin/bash
set -e

# Package Windows portable exe using Enigma Virtual Box
# Usage: ./scripts/package-windows.sh <dist_dir> <output_exe>

DIST_DIR="${1:?Usage: $0 <dist_dir> <output_exe>}"
OUTPUT_EXE="${2:?Usage: $0 <dist_dir> <output_exe>}"

cd "$DIST_DIR"

# Find the main Neutralinojs executable (try win_x64 suffix first, then generic)
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

# Get Windows paths using cygpath
# cygpath -w gives backslash paths like D:\a\...
# cygpath -m gives forward-slash paths like D:/a/... (works with Node.js on Windows)
DIST_DIR_WIN=$(cygpath -w "$(pwd)")
DIST_DIR_MIX=$(cygpath -m "$(pwd)")
MAIN_EXE_WIN="${DIST_DIR_WIN}\\$(echo "$MAIN_EXE" | sed 's|^\./||')"
OUTPUT_EXE_WIN="${DIST_DIR_WIN}\\${OUTPUT_EXE}"

# Temp dir inside the dist folder so it's on the same drive
TEMP_DIR_UNIX="$(pwd)/.tmp-evb"
rm -rf "$TEMP_DIR_UNIX"
mkdir -p "$TEMP_DIR_UNIX"
TEMP_DIR_WIN=$(cygpath -w "$TEMP_DIR_UNIX")

echo "Dist dir (Windows): $DIST_DIR_WIN"
echo "Main exe (Windows): $MAIN_EXE_WIN"
echo "Output exe (Windows): $OUTPUT_EXE_WIN"
echo "Temp dir (Windows): $TEMP_DIR_WIN"

PROJECT_FILE_WIN="${TEMP_DIR_WIN}\\project.evb"

# Use Node.js with generate-evb to create the EVB project file and run enigmavbconsole
node -e "
const path = require('path');
const generateEvb = require('generate-evb');

const projectName = '${PROJECT_FILE_WIN}';
const inputExe = '${MAIN_EXE_WIN}';
const outputExe = '${OUTPUT_EXE_WIN}';
const path2Pack = '${DIST_DIR_MIX}';

const mainExeName = '${MAIN_EXE}'.replace(/^\\.\\//, '');

const options = {
  filter: function(fullPath, name, isDir) {
    if (name === mainExeName) return false;
    if (name === '.git' || name === 'node_modules' || name === '.tmp-evb') return false;
    return true;
  },
  evbOptions: {
    deleteExtractedOnExit: true,
    compressFiles: false,
    shareVirtualSystem: false,
    mapExecutableWithTemporaryFile: false,
    allowRunningOfVirtualExeFiles: true
  }
};

generateEvb(projectName, inputExe, outputExe, path2Pack, options, function(err) {
  if (err) {
    console.error('generateEvb error:', err.message);
    process.exit(1);
  }
  console.log('EVB project generated and packed successfully');
});
"

# Check if output exe was created
if [ -f "$(pwd)/${OUTPUT_EXE}" ]; then
  echo "SUCCESS: Output exe created at $(pwd)/${OUTPUT_EXE}"
else
  echo "WARNING: Output exe not found at $(pwd)/${OUTPUT_EXE}"
fi

# Cleanup
rm -rf "$TEMP_DIR_UNIX"

echo "Packaging complete"
