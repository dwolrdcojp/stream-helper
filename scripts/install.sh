#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🎥 Twitch Stream Service - Installation"
echo "========================================"
echo ""
echo "Project directory: $PROJECT_DIR"
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    SERVICE_DIR="$HOME/Library/LaunchAgents"
    SERVICE_FILE="com.stream.service.plist"
    SERVICE_PATH="$SERVICE_DIR/$SERVICE_FILE"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    SERVICE_DIR="$HOME/.config/systemd/user"
    SERVICE_FILE="stream.service"
    SERVICE_PATH="$SERVICE_DIR/$SERVICE_FILE"
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

echo "Operating system: $OS"
echo ""

# Check if built
if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "❌ Project not built. Run 'npm run build' first"
    exit 1
fi

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "❌ .env file not found. Run 'scripts/setup.sh' first"
    exit 1
fi

# Create service directory
mkdir -p "$SERVICE_DIR"

if [[ "$OS" == "macos" ]]; then
    echo "📝 Installing launchd service..."

    # Create plist from template
    cat > "$SERVICE_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.stream.service</string>

    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$PROJECT_DIR/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/service.log</string>

    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/service-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
EOF

    echo "✅ Service file created: $SERVICE_PATH"
    echo ""
    echo "Service commands:"
    echo "  Start:   launchctl load $SERVICE_PATH"
    echo "  Stop:    launchctl unload $SERVICE_PATH"
    echo "  Status:  launchctl list | grep stream"
    echo "  Logs:    tail -f $PROJECT_DIR/logs/service.log"
    echo ""

    read -p "Start service now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        launchctl load "$SERVICE_PATH"
        echo "✅ Service started"
        sleep 2
        echo ""
        echo "Checking status..."
        launchctl list | grep stream || echo "Service not found in list"
    fi

elif [[ "$OS" == "linux" ]]; then
    echo "📝 Installing systemd service..."

    # Create service from template
    cat > "$SERVICE_PATH" << EOF
[Unit]
Description=Twitch Stream Service
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which node) $PROJECT_DIR/dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:$PROJECT_DIR/logs/service.log
StandardError=append:$PROJECT_DIR/logs/service-error.log

Environment=NODE_ENV=production

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

    echo "✅ Service file created: $SERVICE_PATH"
    echo ""

    # Reload systemd
    systemctl --user daemon-reload

    echo "Service commands:"
    echo "  Start:   systemctl --user start stream"
    echo "  Stop:    systemctl --user stop stream"
    echo "  Restart: systemctl --user restart stream"
    echo "  Status:  systemctl --user status stream"
    echo "  Enable:  systemctl --user enable stream  (auto-start on boot)"
    echo "  Logs:    journalctl --user -u stream -f"
    echo ""

    read -p "Start service now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl --user start stream
        echo "✅ Service started"
        sleep 2
        echo ""
        systemctl --user status stream --no-pager || true
    fi

    echo ""
    read -p "Enable service to start on boot? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl --user enable stream
        echo "✅ Service enabled for auto-start"
    fi
fi

echo ""
echo "✅ Installation complete!"
echo ""
