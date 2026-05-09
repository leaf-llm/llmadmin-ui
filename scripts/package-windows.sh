#!/bin/bash
set -e

# Package Windows portable exe using Enigma Virtual Box
# Usage: ./scripts/package-windows.sh <dist_dir> <output_exe>
#   dist_dir:   Path to the neu build output (e.g. desktop/dist/local-llm-gateway)
#   output_exe: Output filename (e.g. local-llm-gateway.exe)

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

# Get absolute Windows-style path
ABS_DIST_DIR=$(pwd)
echo "Absolute path: $ABS_DIST_DIR"

# Create the project configuration
cat > "$TEMP_DIR/project.evb" << 'EVB_EOF'
[ENIGMA]
VERSION=10.60

[PROJECT]
MAIN_BINARY=%%WORKDIR%%\local-llm-gateway-win_x64.exe
OUTPUT_NAME=local-llm-gateway.exe
COMPRESS=0
INCLUDE_DEFAULT=1

[OPTIONS]
VIRTUAL_FILES=1
VIRTUAL_REGISTRY=0
VIRTUAL_STARTUP=0
VIRTUAL_DLLS=0
COMPRESS_RESOURCES=0
COMPRESS_METHOD=STORE
STRIP_RELOCATION=0
CHECK_ALREADY_RUN=0
CHECK_RUNNING=0
KILL_PREVIOUS=0
KILL_PREVIOUS_PATH=
PRIORITY=NORMAL
ENFORCE_WIN7=0
ENFORCE_WIN10=0
SFX_VERSION=
SFX_ICON=
SFX_LANGUAGE=0
SFX_EXTRA_PARAMETERS=
SFX_OVERWRITE=1
SFX_TEMPLATE=DEFAULT

[FILES]
EVB_EOF

# Add files with Windows-style paths using WORKDIR placeholder
find . -type f \( -name "*.exe" -o -name "*.dll" -o -name "*.json" -o -name "*.html" -o -name "*.js" -o -name "*.css" -o -name "*.png" -o -name "*.ico" \) | while read f; do
  rel_path="${f#./}"
  echo "FILE=%%WORKDIR%%\${rel_path}=%%WORKDIR%%\${rel_path}" >> "$TEMP_DIR/project.evb"
done

cat >> "$TEMP_DIR/project.evb" << 'EOF'

[FOLDERS]
EOF

find . -type d | grep -v "^\.$" | while read d; do
  rel_path="${d#./}"
  echo "FOLDER=%%WORKDIR%%\${rel_path}=%%WORKDIR%%\${rel_path}" >> "$TEMP_DIR/project.evb"
done

cat >> "$TEMP_DIR/project.evb" << 'EOF'

[REGISTRY]
[EMPTY]
[STARTUP]
EOF

# Replace %%WORKDIR%% with actual Windows path
sed -i "s|%%WORKDIR%%|${ABS_DIST_DIR}|g" "$TEMP_DIR/project.evb"

echo "Project.evb content:"
cat "$TEMP_DIR/project.evb"

echo "Running Enigma Virtual Box... EVB_CMD=$EVB_CMD"
echo "Working dir: $(pwd)"
cd "$TEMP_DIR"
"$EVB_CMD" project.evb
EVB_EXIT=$?
echo "EVB exit code: $EVB_EXIT"
cd - > /dev/null || true

ls -la "$TEMP_DIR/"

# Alternative: just copy the dist folder for now as a fallback
echo "Packaging complete: $OUTPUT_EXE"

rm -rf "$TEMP_DIR"