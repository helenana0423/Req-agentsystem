#!/usr/bin/env bash
# ReqBoard 一键启动脚本
# 用法：./start.sh
# 访问：http://localhost:8000

set -e
cd "$(dirname "$0")"

echo "🚀 启动 ReqBoard..."
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
  echo "❌ 未找到 python3，请先安装 Python 3.9+"
  exit 1
fi

# 首次启动装依赖
cd backend
if ! python3 -c "import fastapi" 2>/dev/null; then
  echo "📦 首次启动，安装后端依赖（约 30 秒）..."
  python3 -m pip install -q -r requirements.txt
  echo "✅ 依赖安装完成"
  echo ""
fi

echo "🌐 访问：http://localhost:8000"
echo "📚 API 文档：http://localhost:8000/docs"
echo "🛑 停止：Ctrl+C"
echo ""

# 启动（同时 serve API + 前端）
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
