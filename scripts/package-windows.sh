#!/bin/bash
set -e

# Package Windows portable exe using Enigma Virtual Box
# Usage: ./scripts/package-windows.sh <dist_dir> <output_exe>

DIST_DIR="${1:?Usage: $0 <dist_dir> <output_exe>}"
OUTPUT_EXE="${2:?Usage: $0 <dist_dir> <output_exe>}"

cd "$DIST_DIR"
DIST_DIR_ABS="$(pwd)"

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

# Use cygpath -m (forward slashes like D:/a/...) for ALL paths passed to Node.js
# to avoid backslash-escaping issues when bash interpolates into JS strings
DIST_DIR_MIX=$(cygpath -m "$(pwd)")
MAIN_EXE_REL=$(echo "$MAIN_EXE" | sed 's|^\./||')
MAIN_EXE_MIX="${DIST_DIR_MIX}/${MAIN_EXE_REL}"
OUTPUT_EXE_MIX="${DIST_DIR_MIX}/${OUTPUT_EXE}"

# Temp dir inside the dist folder so it's on the same drive
TEMP_DIR_UNIX="$(pwd)/.tmp-evb"
rm -rf "$TEMP_DIR_UNIX"
mkdir -p "$TEMP_DIR_UNIX"
TEMP_DIR_MIX=$(cygpath -m "$TEMP_DIR_UNIX")

echo "Dist dir: $DIST_DIR_MIX"
echo "Main exe: $MAIN_EXE_MIX"
echo "Output exe: $OUTPUT_EXE_MIX"
echo "Temp dir: $TEMP_DIR_MIX"

PROJECT_FILE_MIX="${TEMP_DIR_MIX}/project.evb"

# Step 1: Use Node.js with generate-evb to create the EVB project file (XML format)
# All paths use forward slashes - Node.js handles this fine on Windows
node -e "
const path = require('path');
const generateEvb = require('generate-evb');

const projectName = '${PROJECT_FILE_MIX}';
const inputExe = '${MAIN_EXE_MIX}';
const outputExe = '${OUTPUT_EXE_MIX}';
const path2Pack = '${DIST_DIR_MIX}';
const mainExeName = '${MAIN_EXE_REL}';

const options = {
  filter: function(fullPath, name, isDir) {
    if (name === mainExeName) return false;
    if (name === '.git' || name === 'node_modules' || name === '.tmp-evb') return false;
    // Exclude non-Windows binaries
    if (name.startsWith('local-llm-gateway-linux') || name.startsWith('local-llm-gateway-mac')) return false;
    return true;
  },
  evbOptions: {
    deleteExtractedOnExit: false,
    compressFiles: true,
    shareVirtualSystem: true,
    mapExecutableWithTemporaryFile: false,
    allowRunningOfVirtualExeFiles: true
  }
};

generateEvb(projectName, inputExe, outputExe, path2Pack, options, function(err) {
  if (err) {
    console.error('generateEvb error:', err.message);
    process.exit(1);
  }
  console.log('EVB project file generated');
});
"

# Verify the evb file was created
EVB_FILE="$TEMP_DIR_UNIX/project.evb"
if [ ! -f "$EVB_FILE" ]; then
  echo "ERROR: project.evb was not generated"
  echo "Temp dir contents:"
  ls -la "$TEMP_DIR_UNIX/" 2>/dev/null || echo "(dir not found)"
  exit 1
fi

echo "Project.evb content (first 30 lines):"
head -30 "$EVB_FILE"

# Step 2: Find and run enigmavbconsole.exe
EVB_CMD="enigmavbconsole.exe"
if ! command -v "$EVB_CMD" &> /dev/null && [ ! -f "$EVB_CMD" ]; then
  EVB_PATHS=(
    "C:/EnigmaVirtualBox/enigmavbconsole.exe"
    "/c/EnigmaVirtualBox/enigmavbconsole.exe"
    "/c/Program Files/Enigma Virtual Box/enigmavbconsole.exe"
    "/c/Program Files (x86)/Enigma Virtual Box/enigmavbconsole.exe"
  )
  for evb_path in "${EVB_PATHS[@]}"; do
    if [ -f "$evb_path" ]; then
      EVB_CMD="$evb_path"
      break
    fi
  done
fi

echo "Using EVB: $EVB_CMD"
echo "Running enigmavbconsole..."
cd "$TEMP_DIR_UNIX" || exit 1
"$EVB_CMD" project.evb 2>&1
EVB_EXIT=$?
echo "EVB exit code: $EVB_EXIT"

cd "$DIST_DIR_ABS" || true

# Check if output exe was created
if [ -f "$OUTPUT_EXE" ]; then
  echo "SUCCESS: Output exe created at $(pwd)/$OUTPUT_EXE"
else
  echo "WARNING: Output exe not found at $(pwd)/$OUTPUT_EXE"
fi

# Cleanup
rm -rf "$TEMP_DIR_UNIX"

echo "Packaging complete"
