# Proctoring Tool

Project now uses:
- `backend/`: Flask + Python proctoring logic
- `frontend/`: React + TypeScript + Tailwind CSS app (Vite)

## Backend setup
```bash
cd backend
pip install -r requirements.txt
python app.py
```

Backend runs on `http://127.0.0.1:5000`.

## Frontend setup
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://127.0.0.1:5173` and proxies selected API endpoints to the backend.

## Notes
- Browser camera permission is required for proctoring flows.
- Violation captures are saved under `backend/static/violation_captures/`.
