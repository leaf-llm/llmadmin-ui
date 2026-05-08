#!/bin/bash
set -e

# Package Neutralinojs Linux build into a .deb
# Usage: ./scripts/package-deb.sh <dist_path> [version]
#   dist_path: Path to the neu build output (e.g. desktop/dist/local-llm-gateway)
#   version:   Package version (default: 1.0.0)

DIST_PATH="${1:?Usage: $0 <dist_path> [version]}"
VERSION="${2:-1.0.0}"

DEB_PKG="local-llm-gateway"
DEB_ARCH="amd64"
DEB_DIR="debian/${DEB_PKG}"

cd "$DIST_PATH"

rm -rf "$DEB_DIR"
mkdir -p "$DEB_DIR/DEBIAN"
mkdir -p "$DEB_DIR/usr/bin"
mkdir -p "$DEB_DIR/usr/share/${DEB_PKG}/resources"
mkdir -p "$DEB_DIR/usr/share/applications"

cat > "$DEB_DIR/DEBIAN/control" << CONTROL_EOF
Package: ${DEB_PKG}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${DEB_ARCH}
Maintainer: Local LLM Gateway
Description: Local LLM Gateway Desktop Application
CONTROL_EOF

cp local-llm-gateway-linux_x64 "$DEB_DIR/usr/share/${DEB_PKG}/local-llm-gateway"
chmod 755 "$DEB_DIR/usr/share/${DEB_PKG}/local-llm-gateway"

ln -s "/usr/share/${DEB_PKG}/local-llm-gateway" "$DEB_DIR/usr/bin/${DEB_PKG}"

# Copy backend binary (built by bun:build into desktop/build/)
cp portkey-gateway "$DEB_DIR/usr/share/${DEB_PKG}/portkey-gateway"
chmod 755 "$DEB_DIR/usr/share/${DEB_PKG}/portkey-gateway"

# Neutralinojs expects resources at ./resources/ relative to the binary
cp resources.neu "$DEB_DIR/usr/share/${DEB_PKG}/resources/"
cp -r public "$DEB_DIR/usr/share/${DEB_PKG}/resources/"

cat > "$DEB_DIR/usr/share/applications/${DEB_PKG}.desktop" << DESKTOP_EOF
[Desktop Entry]
Name=Local LLM Gateway
Comment=Local LLM Gateway Desktop Application
Exec=/usr/bin/${DEB_PKG}
Terminal=false
Type=Application
Categories=Network;Utility;
DESKTOP_EOF

dpkg-deb --build "$DEB_DIR" "local-llm-gateway_${VERSION}_${DEB_ARCH}.deb"
echo "Done: local-llm-gateway_${VERSION}_${DEB_ARCH}.deb"
