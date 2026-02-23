# Proctoring Tool

Python + Flask based web proctoring demo.

## Features
- Detects `no_face`
- Detects `multiple_faces`
- Detects `looking_sideways`
- Live violation report in browser

## Setup
```bash
pip install -r requirements.txt
python proctor.py
```

Open: http://127.0.0.1:5000

## Notes
- Browser camera permission is required.
- Sideways detection is estimated using face landmarks (nose vs eye-center offset).
