#!/bin/bash
set -e

# Build script for Portkey AI Gateway .deb package
# This script builds the project with Bun and packages it as a .deb

echo "=== Portkey AI Gateway Build Script ==="

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "Error: Must be run from project root"
    exit 1
fi

# Install bun if not present
if ! command -v bun &> /dev/null; then
    echo "Bun not found, installing..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

echo "Bun version: $(bun --version)"

# Install dependencies if needed
echo "Installing dependencies..."
bun install

# Build UI if ui directory exists and has package.json
if [ -d "ui" ] && [ -f "ui/package.json" ]; then
    echo "Building UI..."
    bun --cwd ui install
    bun --cwd ui run build
fi

# Build the project with rollup first (to get proper bundling)
echo "Building project with rollup..."
npm run build

# Now compile with bun to create standalone binary
echo "Compiling with Bun..."
bun build src/start-server.ts \
    --outdir=build \
    --format=bun \
    --target=bun \
    --compile \
    --output=build/portkey-gateway \
    --public-dir=src/public

# Make binary executable
chmod +x build/portkey-gateway

# Ensure public files are in place
mkdir -p build/public
cp -r src/public/* build/public/

echo "Build complete!"
echo "Binary: build/portkey-gateway"
echo "Public files: build/public/"

# Check if dpkg-deb is available for .deb creation
if ! command -v dpkg-deb &> /dev/null; then
    echo "dpkg-deb not found. Install with: sudo apt install dpkg-dev"
    exit 1
fi

# Create debian package directory structure
echo "Creating .deb package..."
DEB_DIR="debian/portkey-gateway"
rm -rf "$DEB_DIR"
mkdir -p "$DEB_DIR/usr/local/bin"
mkdir -p "$DEB_DIR/usr/local/share/portkey-gateway"

# Copy binary
cp build/portkey-gateway "$DEB_DIR/usr/local/bin/"

# Copy public files
cp -r build/public "$DEB_DIR/usr/local/share/portkey-gateway/"

# Copy service file
cp debian/portkey-gateway.service "$DEB_DIR/usr/local/share/portkey-gateway/"

# Copy postinst and prerm scripts
mkdir -p "$DEB_DIR/DEBIAN"
cp debian/postinst "$DEB_DIR/DEBIAN/"
cp debian/prerm "$DEB_DIR/DEBIAN/"
chmod 755 "$DEB_DIR/DEBIAN/postinst"
chmod 755 "$DEB_DIR/DEBIAN/prerm"

# Build .deb
dpkg-deb --build "$DEB_DIR" "portkey-gateway_1.15.2_amd64.deb"

echo ""
echo "=== Build Complete ==="
echo "Debian package: portkey-gateway_1.15.2_amd64.deb"
echo ""
echo "To install:"
echo "  sudo dpkg -i portkey-gateway_1.15.2_amd64.deb"
echo ""
echo "To start the service:"
echo "  sudo systemctl start portkey-gateway"
echo ""
echo "To access the UI:"
echo "  http://localhost:8787/public/"
