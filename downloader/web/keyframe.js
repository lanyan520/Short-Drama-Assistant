/* 视频关键帧导出交互（依赖 app.js 提供的全局 $ / $$ / api / toast） */
(function () {
  const kf = { session: null, path: null, dir: null, selected: new Set() };
  kf.dir = localStorage.getItem("kf_last_dir") || "";
  updateDirLabel();

  async function post(url, body) {
    return api(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  // ① 选择本地视频
  $("#kf-pick").onclick = async () => {
    try {
      const r = await post("/api/keyframe/pick", { default: kf.dir || "" });
      if (r.cancelled) return;
      kf.path = r.path;
      $("#kf-file").textContent = r.path.split("/").pop();
    } catch (e) { toast("选择视频失败：" + (e.message || e)); }
  };

  // ② 抽取关键帧
  $("#kf-extract").onclick = async () => {
    if (!kf.path) { toast("请先选择视频"); return; }
    const interval = Math.max(1, parseInt($("#kf-interval").value, 10) || 30);
    $("#kf-progress").hidden = false;
    $("#kf-bar").style.width = "35%";
    $("#kf-ptext").textContent = "正在抽取关键帧…";
    try {
      const r = await post("/api/keyframe/extract", { path: kf.path, interval });
      kf.session = r.session;
      kf.selected = new Set();
      renderFrames(r);
      $("#kf-progress").hidden = true;
    } catch (e) {
      $("#kf-progress").hidden = true;
      toast("抽取失败：" + (e.message || e));
    }
  };

  // ③ 全选 / 全不选
  $("#kf-selall").onclick = () => { $$("#kf-grid .kf-tile").forEach(t => setSel(t, true)); syncCount(); };
  $("#kf-selnone").onclick = () => { $$("#kf-grid .kf-tile").forEach(t => setSel(t, false)); syncCount(); };

  // ④ 选择下载目录
  $("#kf-dir").onclick = async () => {
    try {
      const r = await post("/api/pick-dir", { default: kf.dir || "" });
      if (r.cancelled) return;
      kf.dir = r.path;
      localStorage.setItem("kf_last_dir", r.path);
      updateDirLabel();
    } catch (e) { toast("选择目录失败：" + (e.message || e)); }
  };

  // ⑤ 下载选中帧到本地（未选目录则先弹本地保存框）
  $("#kf-download").onclick = async () => {
    if (!kf.session) { toast("请先抽取关键帧"); return; }
    const names = [...kf.selected];
    if (!names.length) { toast("请先勾选要下载的帧"); return; }
    if (!kf.dir) {
      try {
        const r = await post("/api/pick-dir", { default: kf.dir || "" });
        if (r.cancelled) return;
        kf.dir = r.path;
        localStorage.setItem("kf_last_dir", r.path);
        updateDirLabel();
      } catch (e) { toast("选择目录失败：" + (e.message || e)); return; }
    }
    try {
      const r = await post("/api/keyframe/download", { session: kf.session, names, root: kf.dir });
      toast(`已下载 ${r.copied} 帧到 ${r.dir}`);
    } catch (e) { toast("下载失败：" + (e.message || e)); }
  };

  function renderFrames(r) {
    const grid = $("#kf-grid");
    grid.innerHTML = "";
    r.frames.forEach(f => {
      const t = document.createElement("div");
      t.className = "kf-tile";
      t.dataset.name = f.name;
      const src = `/api/keyframe/frame?session=${encodeURIComponent(r.session)}&name=${encodeURIComponent(f.name)}`;
      t.innerHTML =
        `<img loading="lazy" src="${src}">` +
        `<div class="kf-check">✓</div>` +
        `<div class="kf-idx">#${f.frame_index}</div>`;
      t.onclick = () => setSel(t, !t.classList.contains("selected"));
      t.ondblclick = () => openBig(src);
      grid.appendChild(t);
    });
    $("#kf-result").hidden = false;
    $("#kf-stat").textContent =
      `共 ${r.count} 帧 · 视频 ${r.video} · FPS ${r.fps} · 总帧 ${r.total_frames} · 间隔 ${r.interval}` +
      (r.truncated ? "（已达上限）" : "");
    syncCount();
  }

  function setSel(t, sel) {
    t.classList.toggle("selected", sel);
    const n = t.dataset.name;
    if (sel) kf.selected.add(n); else kf.selected.delete(n);
    syncCount();
  }

  function syncCount() {
    const n = kf.selected.size;
    $("#kf-n").textContent = n;
    $("#kf-download").disabled = n === 0;
    $("#kf-dock").hidden = n === 0;
  }

  function updateDirLabel() {
    $("#kf-dir-label").textContent = kf.dir ? kf.dir.split("/").slice(-2).join("/") : "选择目录";
  }

  function openBig(src) {
    const c = $("#lb-content");
    c.innerHTML = `<img src="${src}">`;
    $("#lightbox").classList.add("show");
  }
})();
