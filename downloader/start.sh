#!/bin/bash
# 一键启动：抖音 / 小红书 素材下载器
set -e

cd "$(dirname "$0")"

VENV="/Users/idea/.workbuddy/binaries/python/envs/dlsite"
PY="$VENV/bin/python"
PORT=8899

if [ ! -x "$PY" ]; then
  echo "首次运行，正在创建虚拟环境并安装依赖…"
  /Users/idea/.workbuddy/binaries/python/versions/3.13.12/bin/python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --no-cache-dir fastapi "uvicorn[standard]" httpx gmssl Pillow
fi

# 端口占用则先杀掉旧进程
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "端口 $PORT 被占用，正在结束旧进程…"
  lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "启动中… http://127.0.0.1:$PORT"
(sleep 1.5 && open "http://127.0.0.1:$PORT") &

exec "$PY" -m uvicorn server:app --host 127.0.0.1 --port $PORT
