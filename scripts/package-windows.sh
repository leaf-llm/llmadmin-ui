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

# Step 1: Use Node.js with generate-evb to create the EVB project file (XML format)
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

// generate-evb has a bug where it calls back without error even if enigmavbconsole fails,
// so we only generate the project file and call EVB ourselves.
// Override the enigmaVBConsolePath so it won't try to run EVB.
const fs = require('fs');
const evbModule = require('generate-evb');

// Use the internal generate function to only create the evb file
generateEvb(projectName, inputExe, outputExe, path2Pack, options, function(err) {
  if (err) {
    console.error('generateEvb error:', err.message);
    process.exit(1);
  }
  console.log('EVB project file generated successfully');
});
"

# Verify the evb file was created
EVB_FILE="$TEMP_DIR_UNIX/project.evb"
if [ ! -f "$EVB_FILE" ]; then
  echo "ERROR: project.evb was not generated"
  ls -la "$TEMP_DIR_UNIX/"
  exit 1
fi

echo "Project.evb content:"
head -50 "$EVB_FILE"

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
EVB_CMD_WIN=$(cygpath -w "$EVB_CMD")
PROJECT_FILE_FOR_EVB=$(cygpath -w "$EVB_FILE")

echo "Running: $EVB_CMD_WIN $PROJECT_FILE_FOR_EVB"
cd "$TEMP_DIR_UNIX" || exit 1
"$EVB_CMD" "$EVB_FILE" 2>&1
EVB_EXIT=$?
echo "EVB exit code: $EVB_EXIT"

cd "$(cygpath -u "$DIST_DIR_MIX")" || true

# Check if output exe was created
if [ -f "$(cygpath -u "$OUTPUT_EXE_WIN")" ]; then
  echo "SUCCESS: Output exe created at $OUTPUT_EXE_WIN"
else
  echo "WARNING: Output exe not found at $OUTPUT_EXE_WIN"
  echo "Files in temp dir:"
  ls -la "$TEMP_DIR_UNIX/"
  echo "Files in dist dir:"
  ls -la "$(cygpath -u "$DIST_DIR_MIX")/"
fi

# Cleanup
rm -rf "$TEMP_DIR_UNIX"

echo "Packaging complete"
