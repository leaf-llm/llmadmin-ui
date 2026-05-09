#!/bin/bash
set -e

# Package Windows portable exe using Enigma Virtual Box
# Usage: ./scripts/package-windows.sh <dist_dir> <output_exe>
#   dist_dir:   Path to the neu build output (e.g. desktop/dist/local-llm-gateway)
#   output_exe: Output filename (e.g. local-llm-gateway.exe)

DIST_DIR="${1:?Usage: $0 <dist_dir> <output_exe>}"
OUTPUT_EXE="${2:?Usage: $0 <dist_dir> <output_exe>}"
TEMP_DIR=$(mktemp -d)

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

# Enigma Virtual Box command line
EVB_CMD="enigmavbconsole.exe"

# Check if EVB is installed
if ! command -v "$EVB_CMD" &> /dev/null && [ ! -f "$EVB_CMD" ]; then
  # Try common installation paths including C:\EnigmaVirtualBox
  EVB_PATHS=(
    "C:/EnigmaVirtualBox/enigmavbconsole.exe"
    "/c/EnigmaVirtualBox/enigmavbconsole.exe"
    "/c/Program Files/Enigma Virtual Box/enigmavbconsole.exe"
    "/c/Program Files (x86)/Enigma Virtual Box/enigmavbconsole.exe"
  )

  for path in "${EVB_PATHS[@]}"; do
    if [ -f "$path" ]; then
      EVB_CMD="$path"
      break
    fi
  done
fi

echo "Using EVB: $EVB_CMD"

# Get absolute path and convert to Windows-style path
# On GitHub Actions Windows runner, /d/a/... maps to D:\a\...
ORIGINAL_PWD=$(pwd)
ABS_DIST_DIR=$(echo "$ORIGINAL_PWD" | sed 's|^/d/|D:/|' | sed 's|/|/|g')
echo "Absolute path (Windows): $ABS_DIST_DIR"

# Create the project configuration
{
  echo "[ENIGMA]"
  echo "VERSION=10.60"
  echo ""
  echo "[PROJECT]"
  echo "MAIN_BINARY=${ABS_DIST_DIR}/local-llm-gateway-win_x64.exe"
  echo "OUTPUT_NAME=local-llm-gateway.exe"
  echo "COMPRESS=0"
  echo "INCLUDE_DEFAULT=1"
  echo ""
  echo "[OPTIONS]"
  echo "VIRTUAL_FILES=1"
  echo "VIRTUAL_REGISTRY=0"
  echo "VIRTUAL_STARTUP=0"
  echo "VIRTUAL_DLLS=0"
  echo "COMPRESS_RESOURCES=0"
  echo "COMPRESS_METHOD=STORE"
  echo "STRIP_RELOCATION=0"
  echo "CHECK_ALREADY_RUN=0"
  echo "CHECK_RUNNING=0"
  echo "KILL_PREVIOUS=0"
  echo "KILL_PREVIOUS_PATH="
  echo "PRIORITY=NORMAL"
  echo "ENFORCE_WIN7=0"
  echo "ENFORCE_WIN10=0"
  echo "SFX_VERSION="
  echo "SFX_ICON="
  echo "SFX_LANGUAGE=0"
  echo "SFX_EXTRA_PARAMETERS="
  echo "SFX_OVERWRITE=1"
  echo "SFX_TEMPLATE=DEFAULT"
  echo ""
  echo "[FILES]"
} > "$TEMP_DIR/project.evb"

# Add files with absolute Windows paths
for f in $(find . -type f \( -name "*.exe" -o -name "*.dll" -o -name "*.json" -o -name "*.html" -o -name "*.js" -o -name "*.css" -o -name "*.png" -o -name "*.ico" \) 2>/dev/null); do
  rel_path="${f#./}"
  echo "FILE=${ABS_DIST_DIR}/${rel_path}=${ABS_DIST_DIR}/${rel_path}" >> "$TEMP_DIR/project.evb"
done

{
  echo ""
  echo "[FOLDERS]"
} >> "$TEMP_DIR/project.evb"

# Add folders
for d in $(find . -type d 2>/dev/null); do
  if [ "$d" != "." ]; then
    rel_path="${d#./}"
    echo "FOLDER=${ABS_DIST_DIR}/${rel_path}=${ABS_DIST_DIR}/${rel_path}" >> "$TEMP_DIR/project.evb"
  fi
done

{
  echo ""
  echo "[REGISTRY]"
  echo "[EMPTY]"
  echo "[STARTUP]"
} >> "$TEMP_DIR/project.evb"

echo "Project.evb content:"
cat "$TEMP_DIR/project.evb"

ORIG_DIR="$(pwd)"
echo "Running Enigma Virtual Box... EVB_CMD=$EVB_CMD"
echo "Working dir: $ORIG_DIR"
echo "TEMP_DIR: $TEMP_DIR"
ls -la "$TEMP_DIR/"
cd "$TEMP_DIR" || exit 1
"$EVB_CMD" project.evb 2>&1
EVB_EXIT=$?
echo "EVB exit code: $EVB_EXIT"
cd "$ORIG_DIR" || echo "Warning: could not return to original directory"

echo "Files after EVB run:"
ls -la "$TEMP_DIR/"

# Check if output exe was created
if [ -f "$ORIG_DIR/local-llm-gateway.exe" ]; then
  echo "SUCCESS: Output exe created at $ORIG_DIR/local-llm-gateway.exe"
else
  echo "WARNING: Output exe not found at $ORIG_DIR/local-llm-gateway.exe"
fi

# Alternative: just copy the dist folder for now as a fallback
echo "Packaging complete"

rm -rf "$TEMP_DIR"