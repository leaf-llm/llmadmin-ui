#!/bin/bash
set -e

# Package Neutralinojs macOS app into a .dmg
# Usage: ./scripts/package-dmg.sh <app_path> <output_dmg>
#   app_path:   Path to the .app bundle OR binary (e.g. desktop/dist/local-llm-gateway/local-llm-gateway-mac_x64)
#   output_dmg: Output .dmg path (e.g. local-llm-gateway_1.0.0_arm64.dmg)

APP_PATH="${1:?Usage: $0 <app_path> <output_dmg>}"
OUTPUT_DMG="${2:?Usage: $0 <app_path> <output_dmg>}"

VOLUME_NAME="LocalLLMGateway"
DMG_TMP=$(mktemp -d /tmp/dmg.XXXXXX)

mkdir -p "$DMG_TMP/${VOLUME_NAME}"

if [ -d "$APP_PATH" ]; then
  # If app_path is a directory (.app bundle), copy it directly
  cp -R "$APP_PATH" "$DMG_TMP/${VOLUME_NAME}/"
else
  # If app_path is a binary, create .app bundle structure
  APP_NAME="LocalLLMGateway"
  mkdir -p "$DMG_TMP/${VOLUME_NAME}/${APP_NAME}.app/Contents/MacOS"
  cp "$APP_PATH" "$DMG_TMP/${VOLUME_NAME}/${APP_NAME}.app/Contents/MacOS/"
  chmod +x "$DMG_TMP/${VOLUME_NAME}/${APP_NAME}.app/Contents/MacOS/"*
fi

# Create DMG using hdiutil
hdiutil create -srcfolder "$DMG_TMP" -volname "${VOLUME_NAME}" -fs HFS+ \
  -format UDZO "$OUTPUT_DMG"

rm -rf "$DMG_TMP"
echo "Done: $OUTPUT_DMG"
