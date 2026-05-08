#!/bin/bash
set -e

# Package Neutralinojs macOS app into a .dmg
# Usage: ./scripts/package-dmg.sh <app_path> <output_dmg>
#   app_path:   Path to the .app bundle (e.g. desktop/dist/mac_arm64/release/local-llm-gateway.app)
#   output_dmg: Output .dmg path (e.g. local-llm-gateway_1.0.0_arm64.dmg)

APP_PATH="${1:?Usage: $0 <app_path> <output_dmg>}"
OUTPUT_DMG="${2:?Usage: $0 <app_path> <output_dmg>}"

VOLUME_NAME="LocalLLMGateway"
DMG_TMP=$(mktemp -d /tmp/dmg.XXXXXX)

# Create directory structure for DMG
mkdir -p "$DMG_TMP/${VOLUME_NAME}"
cp -R "$APP_PATH" "$DMG_TMP/${VOLUME_NAME}/"

# Create DMG using hdiutil
hdiutil create -srcfolder "$DMG_TMP" -volname "${VOLUME_NAME}" -fs HFS+ \
  -format UDZO "$OUTPUT_DMG"

rm -rf "$DMG_TMP"
echo "Done: $OUTPUT_DMG"
