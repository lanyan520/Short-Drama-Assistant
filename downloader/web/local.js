/* 本地资源管理：扫描目录 → 按文件夹分组瀑布流 → 放大/播放/批量删除 */
"use strict";

(function () {
  const LS_ROOT = "dyxhs_local_root";   // 记住上次选的目录

  const state = {
    root: localStorage.getItem(LS_ROOT) || "",
    kind: "image",                       // image | video
    groups: [],                          // [{folder, count, files:[{path,name,folder,size,kind,url}]}]
    flat: [],                            // 扁平文件列表，用于灯箱左右切换
    selected: new Set(),                 // 已选 path 集合
    lbIndex: -1,                         // 灯箱当前索引（flat 中）
    loading: false,
  };

  const KIND_LABEL = { image: "图片", video: "视频" };
  const KIND_ICO = { image: "🖼️", video: "🎬" };

  /* ------------------------------------------------ 导航交互 */

  function bindNav() {
    const parent = $("#nav-local-parent");
    const sub = $("#nav-local-sub");
    if (parent) {
      parent.onclick = () => sub && sub.classList.toggle("open");
    }
    $$(".nav-subitem").forEach(el => {
      el.onclick = () => {
        const kind = el.dataset.kind;
        // 高亮：清除顶层 active，点亮该子项
        $$(".nav > .nav-item").forEach(n => n.classList.remove("active"));
        $$(".nav-subitem").forEach(n => n.classList.toggle("active", n === el));
        $$(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-local"));
        switchKind(kind);
      };
    });
  }

  async function switchKind(kind) {
    if (state.kind === kind && state.groups.length) return; // 已加载同类型则不重扫
    state.kind = kind;
    $("#local-title").textContent = "本地资源 · " + KIND_LABEL[kind];
    await load();
  }

  /* ------------------------------------------------ 加载 & 渲染 */

  async function load() {
    if (state.loading) return;
    state.loading = true;
    const host = $("#local-groups");
    host.innerHTML = `<div class="empty"><div style="font-size:40px">⏳</div><h3>正在扫描目录…</h3></div>`;
    $("#local-dir").textContent = state.root || "默认 data 目录";

    let data;
    try {
      data = await api("/api/local/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: state.root, kind: state.kind }),
      });
    } catch (e) {
      state.loading = false;
      host.innerHTML = `<div class="empty"><div style="font-size:40px">⚠️</div><h3>扫描失败：${escapeHtml(e.message)}</h3></div>`;
      return;
    }
    state.loading = false;

    state.root = data.root;
    localStorage.setItem(LS_ROOT, data.root);
    $("#local-dir").textContent = data.root;
    state.groups = data.groups || [];
    state.flat = [];
    state.groups.forEach(g => g.files.forEach(f => state.flat.push(f)));
    state.selected.clear();
    state.lbIndex = -1;
    renderGroups();
  }

  function renderGroups() {
    const host = $("#local-groups");
    if (!state.flat.length) {
      host.innerHTML = `<div class="empty"><div style="font-size:40px">🕳️</div><h3>该目录下没有${KIND_LABEL[state.kind]}</h3></div>`;
      updateDock();
      return;
    }
    host.innerHTML = "";
    state.groups.forEach(g => {
      const sec = document.createElement("div");
      sec.className = "local-group";
      sec.dataset.folder = g.folder;
      sec.innerHTML = `
        <div class="lg-head">
          <span class="lg-folder">📁 ${escapeHtml(g.folder)}</span>
          <span class="lg-count">${g.count} 个</span>
        </div>
        <div class="local-masonry"></div>
      `;
      const m = $(".local-masonry", sec);
      g.files.forEach(f => m.appendChild(buildTile(f)));
      host.appendChild(sec);
    });
    updateDock();
    observeVideoTiles();
  }

  function buildTile(f) {
    const tile = document.createElement("div");
    tile.className = "local-tile";
    tile.dataset.path = f.path;
    if (state.selected.has(f.path)) tile.classList.add("selected");

    const isVideo = f.kind === "video";
    const mediaInner = isVideo
      ? `<div class="local-ph v" data-vid="${escapeHtml(f.url)}">▶</div>`
      : `<img loading="lazy" src="${escapeHtml(f.url)}" alt="" onerror="this.classList.add('failed')">`;

    tile.innerHTML = `
      <div class="local-check">✓</div>
      <div class="local-media" style="aspect-ratio:${isVideo ? "0.75" : "0.75"}">${mediaInner}</div>
      <div class="local-badge">${isVideo ? "🎬" : "🖼️"}</div>
      <div class="local-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
    `;

    $(".local-check", tile).onclick = e => { e.stopPropagation(); toggleSel(f); };
    tile.onclick = () => openLb(state.flat.indexOf(f));

    return tile;
  }

  // 视频首帧懒加载：进入视口才创建 <video preload=metadata>，避免上千个视频同时请求
  let vidObserver = null;
  function observeVideoTiles() {
    if (vidObserver) vidObserver.disconnect();
    vidObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const media = en.target;
        const ph = $(".local-ph[data-vid]", media);
        if (!ph || ph.dataset.done) return;
        ph.dataset.done = "1";
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.preload = "metadata";
        v.src = ph.dataset.vid;
        v.addEventListener("loadedmetadata", () => {
          try { v.currentTime = 0.1; } catch (e) {}
        });
        ph.replaceWith(v);
      });
    }, { rootMargin: "400px" });
    $$(".local-media").forEach(el => vidObserver.observe(el));
  }

  /* ------------------------------------------------ 选择逻辑 */

  function toggleSel(f) {
    if (state.selected.has(f.path)) state.selected.delete(f.path);
    else state.selected.add(f.path);
    const t = $(`.local-tile[data-path="${cssEsc(f.path)}"]`);
    if (t) t.classList.toggle("selected", state.selected.has(f.path));
    updateDock();
  }

  function setSelAll(on) {
    state.selected.clear();
    if (on) state.flat.forEach(f => state.selected.add(f.path));
    $$(".local-tile").forEach(t => t.classList.toggle("selected", on));
    updateDock();
  }

  function updateDock() {
    const n = state.selected.size;
    $("#local-n").textContent = n;
    $("#local-dock").hidden = n === 0;
    $("#local-del-sel").disabled = n === 0;
    $("#local-del-sel").textContent = n > 0 ? `🗑 删除选中 (${n})` : "🗑 删除选中";
  }

  /* ------------------------------------------------ 灯箱（放大/播放 + 左右切换 + 删除） */

  function openLb(idx) {
    if (idx < 0 || idx >= state.flat.length) return;
    state.lbIndex = idx;
    renderLb();
    $("#local-lightbox").classList.add("show");
  }
  function closeLb() {
    $("#local-lightbox").classList.remove("show");
    state.lbIndex = -1;
  }
  function renderLb() {
    const f = state.flat[state.lbIndex];
    if (!f) { closeLb(); return; }
    const box = $("#lolb-content");
    if (f.kind === "video") {
      box.innerHTML = `<video src="${escapeHtml(f.url)}" controls autoplay playsinline></video>`;
    } else {
      box.innerHTML = `<img src="${escapeHtml(f.url)}" alt="">`;
    }
    $("#lolb-meta").textContent =
      `${state.lbIndex + 1} / ${state.flat.length}　📁 ${f.folder}　${f.name}`;
    // 更新左右箭头可用态
    $("#lolb-prev").classList.toggle("disabled", state.lbIndex <= 0);
    $("#lolb-next").classList.toggle("disabled", state.lbIndex >= state.flat.length - 1);
  }
  function lbPrev() { if (state.lbIndex > 0) { state.lbIndex--; renderLb(); } }
  function lbNext() { if (state.lbIndex < state.flat.length - 1) { state.lbIndex++; renderLb(); } }

  async function lbDelete() {
    const f = state.flat[state.lbIndex];
    if (!f) return;
    if (!confirm(`确认删除「${f.name}」？\n\n将移到废纸篓（可在废纸篓中恢复）。`)) return;
    const r = await api("/api/local/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [f.path] }),
    }).catch(e => ({ error: e.message }));
    if (r.error || !r.deleted) { toast("删除失败：" + (r.error || "未知")); return; }
    toast("已删除：" + f.name);
    purgePaths([f.path]);
    if (!state.flat.length) { closeLb(); return; }
    if (state.lbIndex >= state.flat.length) state.lbIndex = state.flat.length - 1;
    renderLb();
  }

  /* ------------------------------------------------ 批量删除 */

  async function deleteSelected() {
    const paths = [...state.selected];
    if (!paths.length) return;
    if (!confirm(`确认删除选中的 ${paths.length} 个文件？\n\n将移到废纸篓（可在废纸篓中恢复）。`)) return;
    const r = await api("/api/local/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    }).catch(e => ({ error: e.message }));
    if (r.error) { toast("删除失败：" + r.error); return; }
    toast(`已删除 ${r.deleted} 个${r.failed.length ? "，失败 " + r.failed.length + " 个" : ""}`);
    // 删除成功的那批从本地状态与 DOM 中移除
    const deletedPaths = paths.filter((p, i) => !r.failed.some(fp => fp.includes(p)) && r.deleted > 0);
    // 简单可靠：重新扫描（数量多时重扫也能保证状态一致）
    await load();
  }

  // 从本地状态与 DOM 中移除已删除的文件（供灯箱单张删除用，保持灯箱不闪）
  function purgePaths(deletedPaths) {
    const del = new Set(deletedPaths);
    if (!del.size) return;
    state.flat = state.flat.filter(f => !del.has(f.path));
    del.forEach(p => state.selected.delete(p));
    state.groups = state.groups.map(g => {
      const files = g.files.filter(f => !del.has(f.path));
      return { folder: g.folder, count: files.length, files };
    }).filter(g => g.count > 0);
    del.forEach(p => {
      const t = $(`.local-tile[data-path="${cssEsc(p)}"]`);
      if (t) t.remove();
    });
    $$(".local-group").forEach(sec => {
      if (!$(".local-tile", sec)) sec.remove();
    });
    updateDock();
  }

  /* ------------------------------------------------ 切换目录 */

  async function pickRoot() {
    const picked = await api("/api/pick-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default: state.root }),
    }).catch(e => ({ error: e.message }));
    if (!picked || picked.cancelled) return;
    if (picked.error) { toast("打开目录选择框失败：" + picked.error); return; }
    state.root = picked.path;
    localStorage.setItem(LS_ROOT, picked.path);
    await load();
  }

  /* ------------------------------------------------ 事件绑定 */

  function bindEvents() {
    $("#local-pickdir").onclick = pickRoot;
    $("#local-del-sel").onclick = deleteSelected;
    $("#local-del").onclick = deleteSelected;
    $("#local-selall").onclick = () => setSelAll(true);
    $("#local-selnone").onclick = () => setSelAll(false);

    $("#lolb-close").onclick = closeLb;
    $("#lolb-prev").onclick = lbPrev;
    $("#lolb-next").onclick = lbNext;
    $("#lolb-del").onclick = lbDelete;
    $("#local-lightbox").onclick = e => { if (e.target.id === "local-lightbox") closeLb(); };

    document.addEventListener("keydown", e => {
      if (!$("#local-lightbox").classList.contains("show")) return;
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowLeft") lbPrev();
      else if (e.key === "ArrowRight") lbNext();
      else if (e.key === "Backspace" || e.key === "Delete") {
        if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
          e.preventDefault(); lbDelete();
        }
      }
    });
  }

  bindNav();
  bindEvents();
  // 初始不自动加载；用户点击「图片/视频」子项时才扫描
})();
