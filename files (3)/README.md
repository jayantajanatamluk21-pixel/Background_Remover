# Cutout – a remove.bg-style background remover

Stack: HTML + CSS + JavaScript (frontend) and Python/Flask + rembg (backend).

## Run it

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

The first cutout downloads the AI model (about 170 MB for "General"), so it is
slow once and fast afterwards.

## Files

- `app.py` – Flask server and the `/api/remove` endpoint
- `templates/index.html` – page markup
- `static/style.css` – styling
- `static/app.js` – upload, before/after slider, background picker, download

## Notes

- Images over 2500 px on the longest side are scaled down before processing.
  Change `MAX_SIDE` in `app.py` to raise or lower this.
- Models: "General" = isnet-general-use, "People" = u2net_human_seg, "Fast" = u2netp.
- It listens on 127.0.0.1 only. Don't expose it publicly without adding
  rate limiting and authentication.
