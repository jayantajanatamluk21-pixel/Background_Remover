"""Cutout: a small remove.bg-style background remover.

Run:  python app.py   then open http://127.0.0.1:5000
"""
import io
import os
import sys
import threading
import traceback

from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, ImageOps, UnidentifiedImageError
from rembg import new_session, remove

MAX_UPLOAD_MB = 15
MAX_SIDE = 2500  # larger images are scaled down before processing

# Friendly name -> rembg model. Models download once (~5-170 MB) on first use.
MODELS = {
    "general": "isnet-general-use",   # best all-round quality
    "portrait": "u2net_human_seg",    # people
    "fast": "u2netp",                 # small and quick
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

_sessions = {}
_lock = threading.Lock()


def get_session(key):
    with _lock:
        if key not in _sessions:
            _sessions[key] = new_session(MODELS[key])
        return _sessions[key]


@app.get("/")
def index():
    return render_template("index.html", max_mb=MAX_UPLOAD_MB)


@app.post("/api/remove")
def remove_background():
    file = request.files.get("image")
    if file is None or file.filename == "":
        return jsonify(error="No image was uploaded."), 400

    model = request.form.get("model", "general")
    if model not in MODELS:
        return jsonify(error="Unknown model."), 400

    try:
        img = Image.open(file.stream)
        img = ImageOps.exif_transpose(img)  # respect phone-camera rotation
        img = img.convert("RGBA")
    except (UnidentifiedImageError, OSError):
        return jsonify(error="That file isn’t a readable image. Use JPG, PNG or WebP."), 400

    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    try:
        result = remove(img, session=get_session(model), post_process_mask=True)
    except Exception as exc:  # model download or inference failure
        app.logger.exception("Background removal failed")
        return jsonify(error=f"Background removal failed: {exc}"), 500

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png", max_age=0)


@app.errorhandler(Exception)
def unexpected_error(exc):
    """Show the real error in the terminal and in the browser."""
    if hasattr(exc, "code") and isinstance(exc.code, int) and exc.code < 500:
        return exc  # normal 404 / 405 etc.
    traceback.print_exc()
    message = f"{type(exc).__name__}: {exc}"
    if request.path.startswith("/api/"):
        return jsonify(error=message), 500
    return f"<h2>Cutout error</h2><pre>{message}</pre><p>See the terminal window for details.</p>", 500


@app.errorhandler(413)
def too_large(_):
    return jsonify(error=f"That image is too large. The limit is {MAX_UPLOAD_MB} MB."), 413


def check_files():
    required = [
        os.path.join(BASE_DIR, "templates", "index.html"),
        os.path.join(BASE_DIR, "static", "style.css"),
        os.path.join(BASE_DIR, "static", "app.js"),
    ]
    missing = [p for p in required if not os.path.isfile(p)]
    if missing:
        print("\n[ERROR] These files are missing or in the wrong folder:")
        for p in missing:
            print("  -", p)
        print("\nKeep this layout:  templates/index.html  and  static/style.css, static/app.js")
        sys.exit(1)


if __name__ == "__main__":
    check_files()
    app.run(host="127.0.0.1", port=5000, debug=False)
