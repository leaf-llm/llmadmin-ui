#!/bin/bash
set -e

# Package Neutralinojs Linux build into a .deb
# Usage: ./scripts/package-deb.sh <dist_path> [version]
#   dist_path: Path to the neu build output (e.g. desktop/dist/llm-admin)
#   version:   Package version (default: 0.1.0)

DIST_PATH="${1:?Usage: $0 <dist_path> [version]}"
VERSION="${2:-0.1.0}"

DEB_PKG="llm-admin"
DEB_ARCH="amd64"
DEB_DIR="debian/${DEB_PKG}"

cd "$DIST_PATH"

rm -rf "$DEB_DIR"
mkdir -p "$DEB_DIR/DEBIAN"
mkdir -p "$DEB_DIR/usr/bin"
mkdir -p "$DEB_DIR/usr/share/${DEB_PKG}"
mkdir -p "$DEB_DIR/usr/share/applications"
mkdir -p "$DEB_DIR/usr/share/icons/hicolor/256x256/apps"

cat > "$DEB_DIR/DEBIAN/control" << CONTROL_EOF
Package: ${DEB_PKG}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${DEB_ARCH}
Maintainer: LLM Admin
Description: LLM Admin Desktop Application
CONTROL_EOF

# Neutralinojs binary and resources go together in /usr/share
cp llm-admin-linux_x64 "$DEB_DIR/usr/share/${DEB_PKG}/llm-admin"
chmod 755 "$DEB_DIR/usr/share/${DEB_PKG}/llm-admin"

cp llm-gateway "$DEB_DIR/usr/share/${DEB_PKG}/llm-gateway"
chmod 755 "$DEB_DIR/usr/share/${DEB_PKG}/llm-gateway"

cp resources.neu "$DEB_DIR/usr/share/${DEB_PKG}/"

# Copy icon for desktop entry
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../desktop/icons/icon.png" ]; then
  cp "$SCRIPT_DIR/../desktop/icons/icon.png" "$DEB_DIR/usr/share/icons/hicolor/256x256/apps/llm-admin.png"
  echo "Copied icon.png"
else
  echo "Warning: icon.png not found"
fi

# Wrapper script in /usr/bin to launch from correct directory
cat > "$DEB_DIR/usr/bin/${DEB_PKG}" << WRAPPER_EOF
#!/bin/bash
cd /usr/share/${DEB_PKG}
exec ./llm-admin "\$@"
WRAPPER_EOF
chmod 755 "$DEB_DIR/usr/bin/${DEB_PKG}"

cat > "$DEB_DIR/usr/share/applications/${DEB_PKG}.desktop" << DESKTOP_EOF
[Desktop Entry]
Name=LLM Admin
Comment=LLM Admin Desktop Application
Exec=/usr/bin/${DEB_PKG}
Icon=llm-admin
Terminal=false
Type=Application
Categories=Network;Utility;
DESKTOP_EOF

dpkg-deb --build "$DEB_DIR" "llm-admin_${VERSION}_${DEB_ARCH}.deb"
echo "Done: llm-admin_${VERSION}_${DEB_ARCH}.deb"
