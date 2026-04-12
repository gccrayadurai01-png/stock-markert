#!/bin/bash

echo "🚀 Starting AI Trading Command Center..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Install it first."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Install it first."
    exit 1
fi

# Backend
echo "📦 Installing backend dependencies..."
cd backend
python3 -m pip install -r requirements.txt -q
echo ""

if [ ! -f .env ] || grep -q "your_anthropic_api_key_here" .env; then
    echo "⚠️  Set your ANTHROPIC_API_KEY in backend/.env"
    echo "   The app will use fallback signals until you add a valid key."
    echo ""
fi

echo "🔧 Starting backend on http://localhost:8000 ..."
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend
echo "📦 Installing frontend dependencies..."
cd frontend
npm install -q 2>/dev/null
echo ""

echo "🎨 Starting frontend on http://localhost:3000 ..."
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ AI Trading Command Center is running!"
echo "   Dashboard: http://localhost:3000"
echo "   API:       http://localhost:8000"
echo "   API Docs:  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
