#!/bin/zsh
# 迈思美 AI 真测一键启动（双击运行）
cd "$(dirname "$0")"
export $(cat .env.local | xargs)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)
echo "═══════════════════════════════════════"
echo "📱 iPhone 连同一个 WiFi，Safari 打开："
echo ""
echo "   http://$IP:8766/index.html?ai=http://$IP:8799"
echo ""
echo "═══════════════════════════════════════"
(python3 -m http.server 8766 --directory "$HOME/Desktop/迈思美小程序雏形" >/dev/null 2>&1 &)
node ai-proxy.mjs
