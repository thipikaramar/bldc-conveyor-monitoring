import os
import sys
import webbrowser
import uvicorn
from fastapi.staticfiles import StaticFiles

# Ensure directory is in Python path
base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, base_dir)

from api.index import app

# Mount static directory for local development execution
public_dir = os.path.join(base_dir, "public")
if os.path.exists(public_dir):
    app.mount("/", StaticFiles(directory=public_dir, html=True), name="public")

if __name__ == "__main__":
    port = 8000
    url = f"http://localhost:{port}"
    print("=" * 70)
    print(">>> BLDC Conveyor Belt Health Monitoring & AI Predictive Maintenance")
    print(f">>> Dashboard running at: {url}")
    print(">>> Features: 2.5D Conveyor Canvas, Master ON/OFF Toggle, 5-Sensor Engine")
    print(">>> Deploy to Vercel: run 'vercel' or import via GitHub on vercel.com")
    print("=" * 70)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    uvicorn.run(app, host="0.0.0.0", port=port)
