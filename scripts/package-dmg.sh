#!/bin/bash
set -e

# Package Neutralinojs macOS app into a .dmg
# Usage: ./scripts/package-dmg.sh <dist_dir> <binary_name> <output_dmg>
#   dist_dir:    Path to dist directory (e.g. desktop/dist/llm-admin)
#   binary_name: Neutralinojs runtime binary name (e.g. llm-admin-mac_universal)
#   output_dmg:  Output .dmg path (e.g. llm-admin_0.1.0_universal.dmg)
# Note: CFBundleShortVersionString is read from ./package.json (with a
# hard-coded fallback + warning if node/package.json is unavailable).

DIST_DIR="${1:?Usage: $0 <dist_dir> <binary_name> <output_dmg>}"
BINARY_NAME="${2:?Usage: $0 <dist_dir> <binary_name> <output_dmg>}"
OUTPUT_DMG="${3:?Usage: $0 <dist_dir> <binary_name> <output_dmg>}"
ENTITLEMENTS="${4:-}"  # Optional: path to entitlements file for code signing

# --- Resolve version from package.json (single source of truth) ---
# Prefer ./package.json; fall back to ../package.json when CWD is desktop/.
# If neither works, emit a GH Actions warning and use a literal default so
# the script still produces a valid .app — but the operator will see the
# warning, unlike today's silent drift.
VERSION=""
if [ -f "./package.json" ]; then
  VERSION=$(node -p "require('./package.json').version" 2>/dev/null) || true
elif [ -f "../package.json" ]; then
  VERSION=$(cd .. && node -p "require('./package.json').version" 2>/dev/null) || true
fi
if [ -z "$VERSION" ]; then
  echo "::warning::package-dmg.sh: could not read version from package.json; falling back to 0.0.0" >&2
  VERSION="0.0.0"
fi

VOLUME_NAME="LLMAdmin"
DMG_TMP=$(mktemp -d /tmp/dmg.XXXXXX)
APP_NAME="LLMAdmin"

# Create .app bundle directly under DMG_TMP (no wrapper folder)
mkdir -p "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/resources"
mkdir -p "$DMG_TMP/${APP_NAME}.app/Contents/Resources"

# Copy Neutralinojs runtime binary
if [ -f "$DIST_DIR/$BINARY_NAME" ]; then
  cp "$DIST_DIR/$BINARY_NAME" "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/$BINARY_NAME"
  chmod +x "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/$BINARY_NAME"
  echo "Copied runtime: $BINARY_NAME"
else
  echo "Error: Runtime binary not found: $DIST_DIR/$BINARY_NAME"
  exit 1
fi

# Copy llm-gateway server binary
if [ -f "$DIST_DIR/llm-gateway" ]; then
  cp "$DIST_DIR/llm-gateway" "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/llm-gateway"
  chmod +x "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/llm-gateway"
  echo "Copied llm-gateway"
else
  echo "Error: llm-gateway not found: $DIST_DIR/llm-gateway"
  exit 1
fi

# Copy public assets
if [ -d "$DIST_DIR/public" ]; then
  cp -R "$DIST_DIR/public" "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/"
  echo "Copied public/"
else
  echo "Warning: public/ not found: $DIST_DIR/public"
fi

# Copy resources.neu
if [ -f "$DIST_DIR/resources.neu" ]; then
  cp "$DIST_DIR/resources.neu" "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/"
  echo "Copied resources.neu"
else
  echo "Warning: resources.neu not found: $DIST_DIR/resources.neu"
fi

# Copy app icon
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../desktop/icons/icon.icns" ]; then
  cp "$SCRIPT_DIR/../desktop/icons/icon.icns" "$DMG_TMP/${APP_NAME}.app/Contents/Resources/icon.icns"
  echo "Copied icon.icns"
else
  echo "Warning: icon.icns not found"
fi

# Create minimal Info.plist
cat > "$DMG_TMP/${APP_NAME}.app/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${BINARY_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.llm-admin.app</string>
    <key>CFBundleName</key>
    <string>LLMAdmin</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
</dict>
</plist>
PLIST

# Copy entitlements if provided
if [ -n "$ENTITLEMENTS" ] && [ -f "$ENTITLEMENTS" ]; then
  cp "$ENTITLEMENTS" "$DMG_TMP/${APP_NAME}.app/Contents/Entitlements.plist"
  echo "Copied entitlements: $ENTITLEMENTS"
fi

# Create PkgInfo
echo "APPL????" > "$DMG_TMP/${APP_NAME}.app/Contents/PkgInfo"

# Create Applications symlink at DMG root
ln -s "/Applications" "$DMG_TMP/Applications"
echo "Created Applications symlink"

# Create DMG using hdiutil
# DMG_TMP now has: LLMAdmin.app/ and Applications@ at root level
hdiutil create -srcfolder "$DMG_TMP" -volname "${VOLUME_NAME}" -fs HFS+ \
  -format UDZO "$OUTPUT_DMG"

rm -rf "$DMG_TMP"
echo "Done: $OUTPUT_DMG"
