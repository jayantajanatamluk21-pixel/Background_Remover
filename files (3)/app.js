(() => {
  const $ = (s) => document.querySelector(s);
  const MAX_BYTES = 15 * 1024 * 1024;
  const TYPES = ["image/png", "image/jpeg", "image/webp"];

  const el = {
    drop: $("#drop"), file: $("#file"), error: $("#error"),
    workspace: $("#workspace"), compare: $("#compare"),
    orig: $("#origImg"), result: $("#resultImg"),
    split: $("#split"), busy: $("#busy"),
    model: $("#model"), download: $("#download"), reset: $("#reset"),
    swatches: document.querySelectorAll(".swatch[data-bg]"),
    colorPick: $("#colorPick"),
    bgImageBtn: $("#bgImageBtn"), bgImageFile: $("#bgImageFile"),
  };

  const state = {
    file: null,
    origUrl: null,
    resultUrl: null,
    resultBlob: null,
    bg: { type: "transparent" },   // transparent | color | image
    bgImage: null,                 // HTMLImageElement for image backgrounds
    bgImageUrl: null,
    job: 0,                        // guards against out-of-order responses
  };

  /* ---------- helpers ---------- */
  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = !msg;
  }

  function revoke(url) { if (url) URL.revokeObjectURL(url); }

  /* ---------- upload ---------- */
  el.drop.addEventListener("click", () => el.file.click());
  el.drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.file.click(); }
  });
  el.file.addEventListener("change", () => {
    if (el.file.files[0]) handleFile(el.file.files[0]);
    el.file.value = "";
  });

  ["dragenter", "dragover"].forEach((t) =>
    window.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) =>
    window.addEventListener(t, (e) => {
      e.preventDefault();
      if (t === "drop" || e.target === document.documentElement) el.drop.classList.remove("over");
    }));
  window.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  window.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) handleFile(item.getAsFile());
  });

  async function handleFile(file) {
    showError("");
    if (!TYPES.includes(file.type)) {
      return showError("Use a JPG, PNG or WebP image.");
    }
    if (file.size > MAX_BYTES) {
      return showError("That image is larger than 15 MB. Try a smaller one.");
    }

    state.file = file;
    revoke(state.origUrl);
    state.origUrl = URL.createObjectURL(file);
    el.orig.src = state.origUrl;
    // Show the original at full size while the cutout is being made.
    el.result.src = state.origUrl;

    el.drop.hidden = true;
    el.workspace.hidden = false;
    setSplit(50);
    process();
  }

  /* ---------- background removal ---------- */
  async function process() {
    const job = ++state.job;
    showError("");
    el.busy.hidden = false;
    el.download.disabled = true;

    const body = new FormData();
    body.append("image", state.file);
    body.append("model", el.model.value);

    try {
      const res = await fetch("/api/remove", { method: "POST", body });
      if (!res.ok) {
        let msg = "Something went wrong. Try again.";
        try { msg = (await res.json()).error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      if (job !== state.job) return; // a newer request replaced this one

      revoke(state.resultUrl);
      state.resultBlob = blob;
      state.resultUrl = URL.createObjectURL(blob);
      el.result.src = state.resultUrl;
      el.download.disabled = false;
    } catch (err) {
      if (job !== state.job) return;
      showError(err.message);
    } finally {
      if (job === state.job) el.busy.hidden = true;
    }
  }

  el.model.addEventListener("change", () => state.file && process());

  /* ---------- compare slider ---------- */
  function setSplit(v) {
    el.split.value = v;
    el.compare.style.setProperty("--pos", v + "%");
  }
  el.split.addEventListener("input", () => setSplit(el.split.value));

  /* ---------- background choices ---------- */
  function clearActive() { el.swatches.forEach((s) => s.classList.remove("active")); }

  function applyBackground() {
    const c = el.compare;
    c.classList.remove("checker");
    c.style.backgroundColor = "";
    c.style.backgroundImage = "";
    c.style.backgroundSize = "";
    c.style.backgroundPosition = "";

    if (state.bg.type === "transparent") {
      c.classList.add("checker");
    } else if (state.bg.type === "color") {
      c.style.backgroundColor = state.bg.value;
    } else if (state.bg.type === "image") {
      c.style.backgroundImage = `url(${state.bgImageUrl})`;
      c.style.backgroundSize = "cover";
      c.style.backgroundPosition = "center";
    }
  }

  el.swatches.forEach((btn) =>
    btn.addEventListener("click", () => {
      clearActive();
      btn.classList.add("active");
      const v = btn.dataset.bg;
      state.bg = v === "transparent" ? { type: "transparent" } : { type: "color", value: v };
      applyBackground();
    }));

  el.colorPick.addEventListener("input", () => {
    clearActive();
    state.bg = { type: "color", value: el.colorPick.value };
    applyBackground();
  });

  el.bgImageBtn.addEventListener("click", () => el.bgImageFile.click());
  el.bgImageFile.addEventListener("change", () => {
    const f = el.bgImageFile.files[0];
    el.bgImageFile.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      revoke(state.bgImageUrl);
      state.bgImageUrl = url;
      state.bgImage = img;
      state.bg = { type: "image" };
      clearActive();
      applyBackground();
    };
    img.onerror = () => { URL.revokeObjectURL(url); showError("That background image couldn’t be loaded."); };
    img.src = url;
  });

  /* ---------- download (composites the chosen background) ---------- */
  el.download.addEventListener("click", async () => {
    if (!state.resultBlob) return;

    const base = (state.file.name || "image").replace(/\.[^.]+$/, "");
    const filename = `${base}-cutout.png`;

    if (state.bg.type === "transparent") {
      return saveBlob(state.resultBlob, filename);
    }

    const fg = new Image();
    fg.src = state.resultUrl;
    await fg.decode();

    const canvas = document.createElement("canvas");
    canvas.width = fg.naturalWidth;
    canvas.height = fg.naturalHeight;
    const ctx = canvas.getContext("2d");

    if (state.bg.type === "color") {
      ctx.fillStyle = state.bg.value;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (state.bg.type === "image" && state.bgImage) {
      const b = state.bgImage;
      const scale = Math.max(canvas.width / b.naturalWidth, canvas.height / b.naturalHeight);
      const w = b.naturalWidth * scale, h = b.naturalHeight * scale;
      ctx.drawImage(b, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    ctx.drawImage(fg, 0, 0);

    canvas.toBlob((blob) => blob && saveBlob(blob, filename), "image/png");
  });

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- reset ---------- */
  el.reset.addEventListener("click", () => {
    state.job++;
    state.file = null;
    state.resultBlob = null;
    revoke(state.origUrl); revoke(state.resultUrl);
    state.origUrl = state.resultUrl = null;
    el.orig.removeAttribute("src");
    el.result.removeAttribute("src");
    el.busy.hidden = true;
    el.workspace.hidden = true;
    el.drop.hidden = false;
    showError("");
  });
})();
