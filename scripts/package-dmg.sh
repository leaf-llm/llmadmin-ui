#!/bin/bash
set -e

# Package Neutralinojs macOS app into a .dmg
# Usage: ./scripts/package-dmg.sh <dist_dir> <binary_name> <output_dmg>
#   dist_dir:    Path to dist directory (e.g. desktop/dist/local-llm-gateway)
#   binary_name: Neutralinojs runtime binary name (e.g. local-llm-gateway-mac_x64)
#   output_dmg:  Output .dmg path (e.g. local-llm-gateway_1.0.0_arm64.dmg)

DIST_DIR="${1:?Usage: $0 <dist_dir> <binary_name> <output_dmg>}"
BINARY_NAME="${2:?Usage: $0 <dist_dir> <binary_name> <output_dmg>}"
OUTPUT_DMG="${3:?Usage: $0 <dist_dir> <binary_name> <output_dmg>}"

VOLUME_NAME="SelfHostedLLMGateway"
DMG_TMP=$(mktemp -d /tmp/dmg.XXXXXX)
APP_NAME="SelfHostedLLMGateway"

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

# Copy portkey-gateway server binary
if [ -f "$DIST_DIR/portkey-gateway" ]; then
  cp "$DIST_DIR/portkey-gateway" "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/portkey-gateway"
  chmod +x "$DMG_TMP/${APP_NAME}.app/Contents/MacOS/portkey-gateway"
  echo "Copied portkey-gateway"
else
  echo "Error: portkey-gateway not found: $DIST_DIR/portkey-gateway"
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

# Create minimal Info.plist
cat > "$DMG_TMP/${APP_NAME}.app/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${BINARY_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.local-llm-gateway.app</string>
    <key>CFBundleName</key>
    <string>SelfHostedLLMGateway</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13.0</string>
</dict>
</plist>
PLIST

# Create PkgInfo
echo "APPL????" > "$DMG_TMP/${APP_NAME}.app/Contents/PkgInfo"

# Create Applications symlink at DMG root
ln -s "/Applications" "$DMG_TMP/Applications"
echo "Created Applications symlink"

# Create DMG using hdiutil
# DMG_TMP now has: LocalLLMGateway.app/ and Applications@ at root level
hdiutil create -srcfolder "$DMG_TMP" -volname "${VOLUME_NAME}" -fs HFS+ \
  -format UDZO "$OUTPUT_DMG"

rm -rf "$DMG_TMP"
echo "Done: $OUTPUT_DMG"
