#!/usr/bin/env bash
# Deploy Push Relay & Systemd Service on the PocketBase Host
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo ./deploy-push-relay.sh)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PB_BASE_DIR="/opt/pocketbase" # Adjust if PocketBase is installed elsewhere

echo "==> 1. Setting up /opt/push_relay..."
mkdir -p /opt/push_relay
cp "$SCRIPT_DIR/push_relay.py" /opt/push_relay/
chmod 700 /opt/push_relay
chmod 600 /opt/push_relay/push_relay.py

echo "==> 2. Installing Systemd Unit..."
cp "$SCRIPT_DIR/pocketbase-push-relay.service" /etc/systemd/system/
chmod 644 /etc/systemd/system/pocketbase-push-relay.service

if [ ! -f /etc/pocketbase-push-relay.env ]; then
  echo "==> 3. Generating /etc/pocketbase-push-relay.env with random secret..."
  SECRET=$(openssl rand -hex 24)
  cat <<EOF > /etc/pocketbase-push-relay.env
FIREBASE_SERVICE_ACCOUNT_PATH=/opt/push_relay/firebase-service-account.json
PUSH_RELAY_SECRET=${SECRET}
PUSH_RELAY_PORT=8181
EOF
  chmod 600 /etc/pocketbase-push-relay.env
  echo "Created /etc/pocketbase-push-relay.env with PUSH_RELAY_SECRET=${SECRET}"
  echo "IMPORTANT: Also add PUSH_RELAY_SECRET=${SECRET} to your PocketBase environment / systemd service!"
else
  echo "==> /etc/pocketbase-push-relay.env already exists, keeping existing config."
fi

echo "==> 4. Checking Firebase Service Account file..."
if [ ! -f /opt/push_relay/firebase-service-account.json ]; then
  echo "[!] NOTICE: Place your Firebase Service Account JSON at /opt/push_relay/firebase-service-account.json and run:"
  echo "    chmod 600 /opt/push_relay/firebase-service-account.json"
fi

echo "==> 5. Reloading systemd..."
systemctl daemon-reload
echo "To start the relay service:"
echo "    systemctl enable --now pocketbase-push-relay"
echo "To check status:"
echo "    systemctl status pocketbase-push-relay"
echo "==> Done!"
