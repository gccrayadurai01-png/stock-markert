"""Wrapper to start uvicorn with h11 (avoids httptools PermissionError on macOS)."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        http="h11",
    )
