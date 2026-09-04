/* ============================================================
 * 去水印下载 / 视频关键帧导出 / 本地资源
 * 复用 douyin-xhs-downloader 后端（代理 /api/dl/* → 8899）
 * 依赖宿主页面的 escapeHtml / showToast（app.js 已定义）
 * ============================================================ */
(function () {
  "use strict";

  // 宿主提供的工具（app.js 中已有定义）
  const escapeHtml = window.escapeHtml || (s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])));
  const toast = window.showToast || (msg => console.log("[dl]", msg));

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const api = async (p, o) => {
    const r = await fetch(p, o);
    let data;
    try { data = await r.json(); } catch (e) { throw new Error("HTTP " + r.status); }
    if (!r.ok) throw new Error(data.detail || data.message || "HTTP " + r.status);
    return data;
  };

  const proxied = (url, platform) => {
    if (!url) return "";
    if (platform === "demo") return url;
    return "/api/dl/proxy?platform=" + platform + "&url=" + encodeURIComponent(url);
  };

  const fmtBytes = b => {
    if (!b) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i ? 1 : 0) + " " + u[i];
  };

  const fmtDur = s => {
    s = Math.round(s || 0);
    if (!s) return "视频";
    const m = Math.floor(s / 60), r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  };

  const cssEsc = s => String(s).replace(/["\\]/g, "\\$&");

  const shortPath = p => {
    if (!p) return "";
    const parts = p.replace(/\/+$/, "").split("/");
    return parts.slice(-2).join("/") || p;
  };

  let booted = false;

  /* ==========================================================
   * 去水印下载
   * ========================================================== */
  const DL = {
    loading: false,
    authors: new Map(),
    selected: new Map(),
    itemIndex: new Map(),
    categories: [],
    settings: {},
    lastDir: localStorage.getItem("dyxhs_last_dir") || "",
  };

  const LS_CAT = "dyxhs_last_category";

  function dlEl(id) { return document.getElementById(id); }

  function dlBoot() {
    if (booted) return;
    booted = true;
    // 同步抖音 Cookie（自动抓取本机 Chrome 登录态）
    const bDy = dlEl("dlSyncDyCookie");
    if (bDy) bDy.addEventListener("click", () => dlSyncCookie("douyin"));
    dlEl("dlBtnPaste").addEventListener("click", dlPaste);
    dlEl("dlBtnParse").addEventListener("click", dlParse);
    dlEl("dlBtnClear").addEventListener("click", dlClear);
    dlEl("dlBtnDownload").addEventListener("click", dlStartDownload);
    dlEl("dlDockDir").addEventListener("click", async () => {
      const root = await dlPickDir();
      if (root) toast("已切换保存目录：" + shortPath(root));
    });
    dlEl("dlDockCat").addEventListener("change", () => localStorage.setItem(LS_CAT, dlEl("dlDockCat").value));
    dlEl("dlProgClose").addEventListener("click", dlCloseProgress);
    dlEl("dlBtnCancel").addEventListener("click", dlCancelDownload);
    dlEl("dlBtnDone").addEventListener("click", dlCloseProgress);
    dlEl("dlBtnReveal").addEventListener("click", async () => {
      if (!DL._lastSnap) return;
      const firstOk = (DL._lastSnap.files || []).find(f => f.state === "done");
      api("/api/dl/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: (firstOk && firstOk.saved_path) || DL._lastRoot }),
      }).catch(() => {});
    });
    dlEl("dlLbClose").addEventListener("click", () => dlEl("dlLightbox").hidden = true);
    dlEl("dlLightbox").addEventListener("click", e => { if (e.target.id === "dlLightbox") dlEl("dlLightbox").hidden = true; });
    document.addEventListener("keydown", e => {
      if (!dlEl("dlLightbox").hidden && e.key === "Escape") dlEl("dlLightbox").hidden = true;
    });

    // 初始化分类 + 目录
    api("/api/dl/bootstrap").then(d => {
      DL.categories = d.categories || [];
      DL.settings = d.settings || {};
      const saved = localStorage.getItem(LS_CAT);
      dlEl("dlDockCat").innerHTML = DL.categories.map(c => "<option value=\"" + c + "\">" + c + "</option>").join("");
      if (saved && DL.categories.includes(saved)) dlEl("dlDockCat").value = saved;
      if (DL.lastDir) DL.settings.last_dir = DL.lastDir;
      dlRenderDirLabel();
      dlUpdateDock(); // 初始无选中时隐藏底部工具条
    }).catch(e => toast("下载服务连接失败：" + (e.message || e)));
  }

  function dlRenderDirLabel() {
    const d = DL.lastDir || DL.settings.last_dir;
    dlEl("dlDockDirLabel").textContent = d ? shortPath(d) : "选择目录";
    dlEl("dlDockDir").title = d ? "保存到：" + d + "（点击更换）" : "点击选择保存目录";
  }

  async function dlPickDir() {
    try {
      const picked = await api("/api/dl/pick-dir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: DL.lastDir || DL.settings.last_dir || "" }),
      });
      if (!picked || picked.cancelled) return null;
      if (picked.error) { toast("打开目录选择框失败：" + picked.error); return null; }
      DL.lastDir = picked.path;
      localStorage.setItem("dyxhs_last_dir", picked.path);
      dlRenderDirLabel();
      return picked.path;
    } catch (e) { toast("打开目录选择框失败：" + (e.message || e)); return null; }
  }

  async function dlParse() {
    const text = dlEl("dlLinks").value.trim();
    if (!text) { toast("请先粘贴分享链接"); return; }
    if (DL.loading) return;
    DL.loading = true;
    DL.authors.clear();
    DL.itemIndex.clear();
    DL.selected.clear();
    dlEl("dlList").innerHTML = "";
    dlBanner(null);
    dlRenderSkeleton();
    dlProgressShow("正在解析…");

    const dyC = (document.getElementById("settingsDyCookie")?.value || "").trim();
    const xhsC = (document.getElementById("settingsXhsCookie")?.value || "").trim();

    let resp;
    try {
      resp = await fetch("/api/dl/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "auto", media_type: "auto", text, douyin_cookie: dyC, xhs_cookie: xhsC }),
      });
    } catch (e) {
      DL.loading = false; dlClearSkeleton(); dlProgressHide();
      dlBanner({ type: "err", text: "网络请求失败：" + e.message });
      return;
    }
    if (!resp.ok) {
      DL.loading = false; dlClearSkeleton(); dlProgressHide();
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); if (j.message) msg = j.message; } catch (e) {}
      dlBanner({ type: "err", text: msg });
      return;
    }

    // 读取 SSE 流
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let data = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop();
        for (const block of blocks) {
          if (!block.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(block.slice(6));
            if (evt.type === "progress") { dlProgress(evt.text); }
            else if (evt.type === "result") data = evt;
            else if (evt.type === "error") data = evt;
          } catch (e) {}
        }
      }
    } catch (e) {
      DL.loading = false; dlClearSkeleton(); dlProgressHide();
      dlBanner({ type: "err", text: "解析连接中断：" + e.message });
      return;
    }
    DL.loading = false; dlClearSkeleton(); dlProgressHide();
    if (!data) { dlRenderEmpty("解析未返回结果，请重试。"); return; }
    if (data.type === "error") {
      dlRenderEmpty(data.error);
      dlBanner({ type: "err", text: data.error, needCookie: data.need_cookie });
      return;
    }
    const authors = data.authors || [];
    if (authors.length === 0) { dlRenderEmpty("没有解析到可下载内容，检查链接格式是否正确。"); return; }
    authors.forEach(a => dlAppendAuthor(a));
    if (data.notice) {
      dlBanner({ type: "warn", text: data.notice, needCookie: /Cookie|登录/.test(data.notice) });
    } else {
      const its = [...DL.itemIndex.values()].map(v => v.item);
      const v = its.filter(i => i.type === "video").length;
      const im = its.filter(i => i.type === "image").length;
      dlBanner({ type: "info", text: "已从 " + authors.length + " 个链接解析出 " + its.length + " 个无水印内容（视频 " + v + " · 图片 " + im + "）。" });
    }
  }

  // ---- 同步 Cookie（自动抓取本机 Chrome 登录态） ----
  async function dlSyncCookie(platform) {
    const label = platform === "douyin" ? "抖音" : "小红书";
    const btn = dlEl(platform === "douyin" ? "dlSyncDyCookie" : "dlSyncXhsCookie");
    const orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "抓取" + label + " Cookie…"; }
    try {
      const r = await fetch("/api/dl/sync-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      let d;
      try { d = await r.json(); } catch (e) { throw new Error("HTTP " + r.status); }
      if (!d.ok) throw new Error(d.error || "抓取失败");
      // 填入设置输入框并保存（用户可见）
      if (window.openSettings) {
        try { await window.openSettings(); } catch (e) {}
        const input = document.getElementById(platform === "douyin" ? "settingsDyCookie" : "settingsXhsCookie");
        if (input) input.value = d.cookie;
        const saveBtn = document.getElementById("settingsSave");
        if (saveBtn) saveBtn.click();
      }
      dlBanner({ type: "info", text: "已同步 " + label + " Cookie（" + (d.count || 0) + " 项），已填入设置并保存。现在可以解析" + label + "链接。" });
    } catch (e) {
      dlBanner({ type: "err", text: "同步" + label + " Cookie 失败：" + (e.message || e) });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  }

  // ---- 页面内解析进度条 ----
  function dlProgressShow(text) {
    const p = dlEl("dlProgress");
    if (!p) return;
    p.hidden = false;
    const fill = dlEl("dlProgressFill");
    if (fill) fill.style.width = "0%";
    dlProgress(text);
  }
  function dlProgress(text) {
    const p = dlEl("dlProgress");
    if (!p || p.hidden) return;
    const t = dlEl("dlProgressText");
    if (t && text) t.textContent = text;
    const fill = dlEl("dlProgressFill");
    if (fill) {
      const cur = parseFloat(fill.style.width || "0");
      fill.style.width = Math.min(95, cur + (100 - cur) * 0.3) + "%";
    }
  }
  function dlProgressHide() {
    const p = dlEl("dlProgress");
    if (p) p.hidden = true;
  }

  async function dlPaste() {
    if (DL.loading) { toast("正在解析中，请稍候"); return; }
    let text;
    try { text = await navigator.clipboard.readText(); }
    catch (e) { toast("无法读取剪贴板，请点击输入框后手动 Cmd+V"); return; }
    text = (text || "").trim();
    if (!text) { toast("剪贴板为空"); return; }
    dlClear();
    dlEl("dlLinks").value = text;
    dlParse();
  }

  function dlClear() {
    dlEl("dlLinks").value = "";
    DL.authors.clear();
    DL.itemIndex.clear();
    DL.selected.clear();
    dlEl("dlList").innerHTML = "";
    dlBanner(null);
    dlUpdateDock();
  }

  /* ---- 渲染 ---- */
  function dlBanner(cfg) {
    const slot = dlEl("dlBannerSlot");
    if (!cfg) { slot.innerHTML = ""; return; }
    const ico = cfg.type === "err" ? "✕" : cfg.type === "info" ? "ℹ" : "⚠";
    const act = cfg.needCookie
      ? '<button class="btn-ghost sm b-act" id="dlBannerAct">去设置</button>'
      : "";
    slot.innerHTML = '<div class="banner ' + cfg.type + '"><span class="b-ico">' + ico + "</span><div>" + escapeHtml(cfg.text) + "</div>" + act + "</div>";
    const bAct = dlEl("dlBannerAct");
    if (bAct) bAct.addEventListener("click", () => { if (window.openSettings) window.openSettings(); });
  }

  function dlRenderSkeleton() {
    dlEl("dlList").innerHTML = '<div class="skeleton-card"><div class="sk-row"><div class="sk sk-av"></div><div style="flex:1"><div class="sk" style="height:13px;width:38%;margin-bottom:7px"></div><div class="sk" style="height:11px;width:60%"></div></div></div><div class="sk-tiles"><div class="sk sk-tile" style="height:150px"></div><div class="sk sk-tile" style="height:110px"></div><div class="sk sk-tile" style="height:170px"></div></div></div>';
  }
  function dlClearSkeleton() { $$(".skeleton-card", dlEl("dlList")).forEach(e => e.remove()); }
  function dlRenderEmpty(msg) {
    dlEl("dlList").innerHTML = '<div class="empty"><div style="font-size:40px">🔍</div><h3>' + escapeHtml(msg) + "</h3></div>";
  }

  function dlAppendAuthor(a) {
    if (DL.authors.has(a.id)) return;
    DL.authors.set(a.id, a);
    a.items.forEach(it => DL.itemIndex.set(it.id, { item: it, author: a }));

    const card = document.createElement("div");
    card.className = "author-card";
    card.dataset.author = a.id;
    const tag = a.platform === "xhs"
      ? '<span class="tag xhs">小红书</span>'
      : '<span class="tag douyin">抖音</span>';
    const handle = a.handle ? "@" + escapeHtml(a.handle) : "";
    const sig = a.signature ? '<div class="author-sig">' + escapeHtml(a.signature) + "</div>" : "";
    const avatar = a.avatar ? proxied(a.avatar, a.platform) : "";
    const capped = !!a.capped;
    card.innerHTML =
      '<div class="author-head">' +
        (avatar
          ? '<img class="avatar" src="' + avatar + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
          : '<div class="avatar placeholder"></div>') +
        '<div class="author-meta">' +
          '<div class="author-line1"><span class="author-name">' + escapeHtml(a.nickname) + "</span>" + tag + "</div>" +
          '<div class="author-line2">' +
            (handle ? "<span>" + handle + '</span><span class="sep">·</span>' : "") +
            "<span><b>" + dlFmtFollowers(a.followers) + "</b> 粉丝</span>" +
            '<span class="sep">·</span><span>已解析 <b>' + a.items.length + "</b> 个作品</span>" +
          "</div>" +
          sig +
          (capped ? '<div class="author-cap">⚠ 匿名仅能拉取最近 ' + a.items.length + " 个作品；该用户主页显示的作品更多。右上角「设置」填抖音登录 Cookie 可解锁全部作品。</div>" : "") +
        "</div>" +
        '<div class="author-actions"><span class="sel-badge" data-badge hidden></span><button class="btn-ghost sm" data-selauthor>全选全部</button></div>' +
      "</div>";
    const body = document.createElement("div");
    body.className = "author-body";
    card.appendChild(body);
    dlRenderSection(body, "video", "🎬 视频", a.items.filter(i => i.type === "video"), a);
    dlRenderSection(body, "image", "🖼 图片", a.items.filter(i => i.type === "image"), a);
    $("[data-selauthor]", card).addEventListener("click", e => { e.stopPropagation(); dlToggleAuthorSelect(a); });
    dlEl("dlList").appendChild(card);
  }

  function dlRenderSection(host, kind, title, items, author) {
    if (!items.length) return;
    const sec = document.createElement("div");
    sec.className = "author-section";
    sec.dataset.section = kind;
    sec.innerHTML =
      '<div class="sec-head"><span class="sec-title">' + title + '</span><span class="sec-count"><b>' + items.length + '</b> 个</span><span class="sec-badge" data-secbadge hidden></span><button class="btn-ghost sm sec-sel" data-selsection="' + kind + '">全选本类</button></div>' +
      '<div class="masonry"></div>';
    const masonry = $(".masonry", sec);
    items.forEach(it => masonry.appendChild(dlBuildTile(it, author)));
    $("[data-selsection]", sec).addEventListener("click", e => { e.stopPropagation(); dlToggleSectionSelect(author, kind); });
    host.appendChild(sec);
  }

  function dlBuildTile(item, author) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.item = item.id;
    if (DL.selected.has(item.id)) tile.classList.add("selected");
    const ratio = item.width && item.height ? item.height / item.width : 1.4;
    const isVideo = item.type === "video";
    const preview = isVideo
      ? (item.thumb ? proxied(item.thumb, author.platform) : "")
      : proxied(item.thumb || item.url, author.platform);
    const badge = isVideo
      ? '<div class="tile-badge">▶ ' + fmtDur(item.duration) + "</div>"
      : (item.width ? '<div class="tile-badge">' + item.width + "×" + item.height + "</div>" : "");
    const mediaInner = preview
      ? '<img class="thumb" alt="" loading="lazy" data-preview="' + escapeHtml(preview) + '" data-kind="' + item.type + '">'
      : '<div class="tile-ph ' + (isVideo ? "v" : "i") + '">' + (isVideo ? "▶" : "图") + "</div>";
    tile.innerHTML =
      '<div class="tile-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M5 12l5 5L20 6"/></svg></div>' +
      '<div class="media" style="aspect-ratio:' + (1 / ratio).toFixed(3) + '">' + mediaInner + "</div>" +
      badge +
      (item.title ? '<div class="tile-hover">' + escapeHtml(item.title) + "</div>" : "") +
      '<div class="tile-url"><span class="u" title="' + escapeHtml(item.url) + '">' + escapeHtml(item.url) + '</span><button class="copy" data-copy title="复制无水印链接">复制</button></div>';
    const img = $(".media .thumb", tile);
    if (img) {
      img.addEventListener("load", () => img.classList.add("loaded"));
      img.addEventListener("error", () => dlTileImgError(img));
      img.src = preview;
    }
    $(".tile-check", tile).addEventListener("click", e => { e.stopPropagation(); dlToggleItem(item, author); });
    tile.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey) { dlOpenLb(item, author); return; }
      dlToggleItem(item, author);
    });
    tile.addEventListener("dblclick", e => { e.preventDefault(); dlOpenLb(item, author); });
    $("[data-copy]", tile).addEventListener("click", e => {
      e.stopPropagation();
      navigator.clipboard.writeText(item.url).then(() => toast("已复制无水印链接")).catch(() => toast("复制失败，请手动选择"));
    });
    return tile;
  }

  function dlTileImgError(img) {
    const tries = parseInt(img.dataset.retry || "0", 10);
    if (tries < 2) {
      img.dataset.retry = String(tries + 1);
      const base = img.dataset.preview || "";
      const sep = base.includes("?") ? "&" : "?";
      img.src = base + sep + "_r=" + (tries + 1) + "&_t=" + Date.now();
      return;
    }
    const ph = document.createElement("div");
    ph.className = "tile-ph " + (img.dataset.kind === "video" ? "v" : "i") + " fail";
    ph.textContent = img.dataset.kind === "video" ? "▶" : "图";
    img.replaceWith(ph);
  }

  function dlFmtFollowers(n) {
    if (!n) return "—";
    if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
    return String(n);
  }

  /* ---- 选择逻辑 ---- */
  function dlToggleItem(item, author) {
    if (DL.selected.has(item.id)) DL.selected.delete(item.id);
    else DL.selected.set(item.id, { item, author });
    dlSyncTile(item.id);
    dlUpdateAuthorBadge(author.id);
    dlUpdateDock();
  }
  function dlToggleAuthorSelect(author) {
    const ids = author.items.map(i => i.id);
    const allSelected = ids.every(id => DL.selected.has(id));
    author.items.forEach(it => {
      if (allSelected) DL.selected.delete(it.id);
      else DL.selected.set(it.id, { item: it, author });
      dlSyncTile(it.id);
    });
    dlUpdateAuthorBadge(author.id);
    dlUpdateDock();
  }
  function dlToggleSectionSelect(author, kind) {
    const ids = author.items.filter(i => i.type === kind).map(i => i.id);
    if (!ids.length) return;
    const allSelected = ids.every(id => DL.selected.has(id));
    ids.forEach(id => {
      const rec = DL.itemIndex.get(id);
      if (allSelected) DL.selected.delete(id);
      else if (rec) DL.selected.set(id, rec);
      dlSyncTile(id);
    });
    dlUpdateAuthorBadge(author.id);
    dlUpdateDock();
  }
  function dlSyncTile(itemId) {
    const t = $('[data-item="' + cssEsc(itemId) + '"]', dlEl("dlList"));
    if (t) t.classList.toggle("selected", DL.selected.has(itemId));
  }
  function dlUpdateAuthorBadge(authorId) {
    const author = DL.authors.get(authorId);
    if (!author) return;
    const card = $('[data-author="' + cssEsc(authorId) + '"]', dlEl("dlList"));
    if (!card) return;
    const selAll = author.items.filter(i => DL.selected.has(i.id)).length;
    const badge = $("[data-badge]", card);
    const btn = $("[data-selauthor]", card);
    if (selAll > 0) { badge.hidden = false; badge.textContent = "已选 " + selAll; }
    else badge.hidden = true;
    btn.textContent = (selAll === author.items.length && author.items.length > 0) ? "取消全选" : "全选全部";
    for (const kind of ["video", "image"]) {
      const secBadge = $('[data-secbadge="' + kind + '"]', card);
      const secBtn = $('[data-selsection="' + kind + '"]', card);
      if (!secBadge) continue;
      const ids = author.items.filter(i => i.type === kind).map(i => i.id);
      const sel = ids.filter(id => DL.selected.has(id)).length;
      if (sel > 0) { secBadge.hidden = false; secBadge.textContent = "已选 " + sel; }
      else secBadge.hidden = true;
      secBtn.textContent = (sel === ids.length && ids.length > 0) ? "取消本类" : "全选本类";
    }
  }
  function dlUpdateDock() {
    const n = DL.selected.size;
    dlEl("dlDockN").textContent = n;
    const authorSet = new Set([...DL.selected.values()].map(v => v.author.id));
    dlEl("dlDockSub").textContent = "来自 " + authorSet.size + " 位作者";
    dlEl("dlDock").classList.toggle("visible", n > 0);
    dlEl("dlBtnDownload").disabled = n === 0;
  }

  /* ---- 下载 ---- */
  async function dlStartDownload() {
    if (DL.selected.size === 0) return;
    let root = DL.lastDir || DL.settings.last_dir;
    if (!root) {
      root = await dlPickDir();
      if (!root) return;
    }
    const category = dlEl("dlDockCat").value;
    const items = [...DL.selected.values()].map(({ item, author }) => ({
      url: item.url,
      platform: author.platform,
      media_type: item.type,
      author_nickname: author.nickname,
      author_handle: author.handle,
      title: item.title,
      item_id: item.id,
      ext: item.ext,
    }));
    let res;
    try {
      res = await api("/api/dl/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root, category, layout: "platform_author", items }),
      });
    } catch (e) { toast("下载启动失败：" + (e.message || e)); return; }
    if (!res || res.error) { toast("下载启动失败：" + ((res && res.error) || "未知")); return; }
    if (!res.task_id) { toast("下载启动失败：未返回任务 ID"); return; }
    dlOpenProgress(res.task_id, root);
  }

  let progTaskId = null, progPollTimer = null, progAutoCloseTimer = null;

  function dlCloseProgress() {
    dlEl("dlMaskProgress").hidden = true;
    if (progPollTimer) { clearInterval(progPollTimer); progPollTimer = null; }
    if (progAutoCloseTimer) { clearTimeout(progAutoCloseTimer); progAutoCloseTimer = null; }
    progTaskId = null;
    dlEl("dlBtnCancel").disabled = false;
    dlEl("dlBtnCancel").textContent = "中止";
    dlEl("dlBtnCancel").hidden = false;
  }

  function dlOpenProgress(taskId, root) {
    if (progAutoCloseTimer) { clearTimeout(progAutoCloseTimer); progAutoCloseTimer = null; }
    progTaskId = taskId;
    DL._lastRoot = root;
    dlEl("dlMaskProgress").hidden = false;
    dlEl("dlProgTitle").textContent = "正在下载";
    dlEl("dlProgPath").textContent = "保存到：" + root;
    dlEl("dlBtnDone").hidden = true;
    dlEl("dlBtnReveal").hidden = true;
    dlEl("dlBtnCancel").hidden = false;
    dlEl("dlBtnCancel").disabled = false;
    dlEl("dlBtnCancel").textContent = "中止";
    dlEl("dlProgFiles").innerHTML = "";
    if (progPollTimer) { clearInterval(progPollTimer); progPollTimer = null; }
    progPollTimer = setInterval(async () => {
      if (!progTaskId) { clearInterval(progPollTimer); progPollTimer = null; return; }
      try {
        const snap = await fetch("/api/dl/download/" + progTaskId).then(r => r.json());
        dlRenderProgress(snap, root);
        if (snap.finished) {
          clearInterval(progPollTimer);
          progPollTimer = null;
          dlOnFinished(snap, root);
        }
      } catch (e) {
        const det = dlEl("dlProgDetail");
        if (det) det.textContent = "进度连接中断，可点击中止或强制关闭";
      }
    }, 800);
  }

  function dlRenderProgress(snap, root) {
    const completed = snap.done_files + snap.failed_files + (snap.cancelled_files || 0);
    const started = snap.started_files || completed;
    let pct;
    if (snap.total_files) {
      pct = Math.round(((completed + Math.max(0, started - completed) * 0.3) / snap.total_files) * 100);
    } else pct = 0;
    if (snap.finished) pct = 100;
    pct = Math.max(0, Math.min(100, pct));
    dlEl("dlProgPct").textContent = pct + "%";
    dlEl("dlProgBar").style.width = pct + "%";
    const running = (snap.started_files || 0) - completed;
    dlEl("dlProgDetail").textContent =
      snap.done_files + "/" + snap.total_files + " 完成" +
      (running > 0 ? "，" + running + " 下载中" : "") +
      (snap.failed_files ? "，" + snap.failed_files + " 失败" : "") +
      (snap.cancelled_files ? "，" + snap.cancelled_files + " 已取消" : "") +
      "　" + fmtBytes(snap.received_bytes);
    dlEl("dlProgFiles").innerHTML = (snap.files || []).map(f => {
      const stLabel = { done: "✓ 完成", error: "✕ 失败", running: "下载中", pending: "等待", cancelled: "已取消" }[f.state] || f.state;
      const detail = f.state === "error" ? "　" + escapeHtml(f.error || "") : "";
      return '<div class="file-row"><span class="nm">' + escapeHtml(f.author) + " · " + escapeHtml(f.title || f.item_id) + detail + '</span><span class="st ' + f.state + '">' + stLabel + "</span></div>";
    }).join("");
  }

  function dlOnFinished(snap, root) {
    DL._lastSnap = snap;
    dlEl("dlProgTitle").textContent = snap.cancelled ? "已中止" : "下载完成";
    dlEl("dlBtnCancel").hidden = true;
    dlEl("dlBtnDone").hidden = false;
    dlEl("dlBtnReveal").hidden = false;
    const msg = snap.cancelled
      ? "已中止：成功 " + snap.done_files + " 个"
      : "下载完成：成功 " + snap.done_files + " 个" + (snap.failed_files ? "，失败 " + snap.failed_files + " 个" : "");
    toast(msg);
    progAutoCloseTimer = setTimeout(dlCloseProgress, 2500);
  }

  function dlCancelDownload() {
    if (!progTaskId) return;
    const tid = progTaskId;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);
    fetch("/api/dl/download/" + tid + "/cancel", { method: "POST", signal: controller.signal }).catch(() => {});
    toast("已中止下载");
    dlCloseProgress();
  }

  function dlOpenLb(item, author) {
    const url = proxied(item.url, author.platform);
    if (item.type === "video") {
      if (!item.url) { toast("该视频缺少直链，无法预览"); return; }
      dlEl("dlLbContent").innerHTML = '<video src="' + url + '" controls autoplay playsinline></video>';
    } else {
      dlEl("dlLbContent").innerHTML = '<img src="' + url + '" alt="">';
    }
    dlEl("dlLightbox").hidden = false;
  }

  /* ==========================================================
   * 视频关键帧导出
   * ========================================================== */
  const KF = { session: null, path: null, dir: localStorage.getItem("kf_last_dir") || "", selected: new Set() };
  let kfBooted = false;

  function kfBoot() {
    if (kfBooted) return;
    kfBooted = true;
    kfRenderDirLabel();
    function kfSetFileLabel(path) {
      const name = path ? path.split("/").pop() : "";
      const thumb = dlEl("kfThumb");
      dlEl("kfFile").textContent = name;
      dlEl("kfFile").hidden = !path;
      dlEl("kfPickTile").classList.toggle("has-file", !!path);
      // 切换视频时先清除旧缩略图
      if (thumb) { thumb.hidden = true; thumb.style.backgroundImage = ""; }
    }
    // 加载视频首帧缩略图到 9:16 磁贴（接口按路径缓存，重复选择不重复解码）
    function kfLoadThumb(path) {
      const thumb = dlEl("kfThumb");
      if (!thumb || !path) return;
      const url = "/api/dl/keyframe/thumb?path=" + encodeURIComponent(path);
      const img = new Image();
      img.onload = () => { thumb.style.backgroundImage = "url('" + url + "')"; thumb.hidden = false; };
      img.onerror = () => { thumb.hidden = true; thumb.style.backgroundImage = ""; };
      img.src = url;
    }
    dlEl("kfPickTile").addEventListener("click", async () => {
      try {
        const r = await api("/api/dl/keyframe/pick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default: KF.dir || "" }),
        });
        if (r.cancelled) return;
        KF.path = r.path;
        kfSetFileLabel(KF.path);
        kfLoadThumb(KF.path);
      } catch (e) { toast("选择视频失败：" + (e.message || e)); }
    });
    // 间隔帧数：限制为 1-100 的整数
    const kfIntervalEl = dlEl("kfInterval");
    kfIntervalEl.addEventListener("input", () => {
      let v = parseInt(kfIntervalEl.value, 10);
      if (isNaN(v)) return;
      if (v < 1) v = 1;
      if (v > 100) v = 100;
      kfIntervalEl.value = v;
    });
    kfIntervalEl.addEventListener("blur", () => {
      let v = parseInt(kfIntervalEl.value, 10);
      if (isNaN(v) || v < 1) v = 10;
      if (v > 100) v = 100;
      kfIntervalEl.value = v;
    });
    dlEl("kfExtract").addEventListener("click", async () => {
      if (!KF.path) { toast("请先选择视频"); return; }
      const interval = Math.max(1, Math.min(100, parseInt(dlEl("kfInterval").value, 10) || 10));
      dlEl("kfProgress").hidden = false;
      dlEl("kfBar").style.width = "35%";
      dlEl("kfPtext").textContent = "正在抽取关键帧…";
      try {
        const r = await api("/api/dl/keyframe/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: KF.path, interval }),
        });
        KF.session = r.session;
        KF.selected = new Set();
        kfRenderFrames(r);
        dlEl("kfProgress").hidden = true;
      } catch (e) {
        dlEl("kfProgress").hidden = true;
        toast("抽取失败：" + (e.message || e));
      }
    });
    dlEl("kfSelall").addEventListener("click", () => { $$("#kfGrid .kf-tile").forEach(t => kfSetSel(t, true)); kfSyncCount(); });
    dlEl("kfSelnone").addEventListener("click", () => { $$("#kfGrid .kf-tile").forEach(t => kfSetSel(t, false)); kfSyncCount(); });
    dlEl("kfDir").addEventListener("click", async () => {
      try {
        const r = await api("/api/dl/pick-dir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default: KF.dir || "" }),
        });
        if (r.cancelled) return;
        KF.dir = r.path;
        localStorage.setItem("kf_last_dir", r.path);
        kfRenderDirLabel();
      } catch (e) { toast("选择目录失败：" + (e.message || e)); }
    });
    dlEl("kfDownload").addEventListener("click", async () => {
      if (!KF.session) { toast("请先抽取关键帧"); return; }
      const names = [...KF.selected];
      if (!names.length) { toast("请先勾选要下载的帧"); return; }
      if (!KF.dir) {
        try {
          const r = await api("/api/dl/pick-dir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ default: KF.dir || "" }),
          });
          if (r.cancelled) return;
          KF.dir = r.path;
          localStorage.setItem("kf_last_dir", r.path);
          kfRenderDirLabel();
        } catch (e) { toast("选择目录失败：" + (e.message || e)); return; }
      }
      try {
        const r = await api("/api/dl/keyframe/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: KF.session, names, root: KF.dir }),
        });
        toast("已下载 " + r.copied + " 帧到 " + r.dir);
      } catch (e) { toast("下载失败：" + (e.message || e)); }
    });
  }

  function kfRenderDirLabel() {
    dlEl("kfDirLabel").textContent = KF.dir ? shortPath(KF.dir) : "选择目录";
  }

  function kfRenderFrames(r) {
    const grid = dlEl("kfGrid");
    grid.innerHTML = "";
    r.frames.forEach(f => {
      const t = document.createElement("div");
      t.className = "kf-tile";
      t.dataset.name = f.name;
      const src = "/api/dl/keyframe/frame?session=" + encodeURIComponent(r.session) + "&name=" + encodeURIComponent(f.name);
      t.innerHTML = '<img loading="lazy" src="' + src + '"><div class="kf-check">✓</div><div class="kf-idx">#' + f.frame_index + "</div>";
      t.addEventListener("click", () => kfSetSel(t, !t.classList.contains("selected")));
      t.addEventListener("dblclick", () => kfOpenBig(src));
      grid.appendChild(t);
    });
    dlEl("kfResult").hidden = false;
    dlEl("kfStat").textContent =
      "共 " + r.count + " 帧 · 视频 " + r.video + " · FPS " + r.fps + " · 总帧 " + r.total_frames + " · 间隔 " + r.interval +
      (r.truncated ? "（已达上限）" : "");
    kfSyncCount();
  }

  function kfSetSel(t, sel) {
    t.classList.toggle("selected", sel);
    const n = t.dataset.name;
    if (sel) KF.selected.add(n); else KF.selected.delete(n);
    kfSyncCount();
  }

  function kfSyncCount() {
    const n = KF.selected.size;
    dlEl("kfN").textContent = n;
    dlEl("kfDownload").disabled = n === 0;
    dlEl("kfDock").classList.toggle("visible", n > 0);
  }

  function kfOpenBig(src) {
    dlEl("dlLbContent").innerHTML = '<img src="' + src + '">';
    dlEl("dlLightbox").hidden = false;
  }

  /* ==========================================================
   * 本地资源
   * ========================================================== */
  const LOCAL = {
    root: localStorage.getItem("dyxhs_local_root") || "",
    kind: "image",
    groups: [],
    flat: [],
    selected: new Set(),
    lbIndex: -1,
    loading: false,
    pending: false,
  };
  let localBooted = false;

  function localBoot() {
    if (localBooted) return;
    localBooted = true;
    dlEl("dlLocalPickDir").addEventListener("click", localPickRoot);
    dlEl("dlLocalDel").addEventListener("click", localDeleteSelected);
    dlEl("dlLocalSelall").addEventListener("click", () => localSetSelAll(true));
    dlEl("dlLocalSelnone").addEventListener("click", () => localSetSelAll(false));
    dlEl("dlLoClose").addEventListener("click", localCloseLb);
    dlEl("dlLoPrev").addEventListener("click", localLbPrev);
    dlEl("dlLoNext").addEventListener("click", localLbNext);
    dlEl("dlLoDel").addEventListener("click", localLbDelete);
    dlEl("dlLocalLightbox").addEventListener("click", e => { if (e.target.id === "dlLocalLightbox") localCloseLb(); });
    document.addEventListener("keydown", e => {
      if (dlEl("dlLocalLightbox").hidden) return;
      if (e.key === "Escape") localCloseLb();
      else if (e.key === "ArrowLeft") localLbPrev();
      else if (e.key === "ArrowRight") localLbNext();
      else if (e.key === "Backspace" || e.key === "Delete") {
        if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); localLbDelete(); }
      }
    });
  }

  async function localSwitchKind(kind, opts) {
    opts = opts || {};
    // 已加载且为同一类型、且有根目录时无需重复处理
    if (LOCAL.kind === kind && LOCAL.groups.length && LOCAL.root) return;
    LOCAL.kind = kind;
    dlEl("dlLocalTitle").textContent = "本地资源 · " + (kind === "image" ? "图片" : "视频");
    // 还没有选择过目录：自动唤起目录选择框（让二级分类成为真实可点选的目录入口）
    if (!LOCAL.root && opts.autoPick !== false) {
      await localPickRoot();
      return; // localPickRoot 内部已调用 localLoad
    }
    await localLoad();
  }

  async function localLoad() {
    if (LOCAL.loading) { LOCAL.pending = true; return; }
    LOCAL.loading = true;
    LOCAL.pending = false;
    const capturedKind = LOCAL.kind;
    const host = dlEl("dlLocalGroups");
    host.innerHTML = '<div class="empty"><div style="font-size:40px">⏳</div><h3>正在扫描目录…</h3></div>';
    dlEl("dlLocalDir").textContent = LOCAL.root || "默认 data 目录";
    let data;
    try {
      data = await api("/api/dl/local/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: LOCAL.root, kind: LOCAL.kind }),
      });
    } catch (e) {
      LOCAL.loading = false;
      host.innerHTML = '<div class="empty"><div style="font-size:40px">⚠️</div><h3>扫描失败：' + escapeHtml(e.message) + "</h3></div>";
      return;
    }
    LOCAL.loading = false;
    // 切换 kind 过程中如果又来了新的切换请求，本轮结果作废，重新加载当前 kind
    if (LOCAL.kind !== capturedKind || LOCAL.pending) {
      LOCAL.pending = false;
      await localLoad();
      return;
    }
    LOCAL.root = data.root;
    localStorage.setItem("dyxhs_local_root", data.root);
    dlEl("dlLocalDir").textContent = data.root;
    // 后端返回的静态文件 URL 是 /api/local-file，需经过 website 的 /api/dl 代理前缀
    LOCAL.groups = (data.groups || []).map(g => ({
      ...g,
      files: (g.files || []).map(f => ({
        ...f,
        url: String(f.url || "").replace(/^\/api\/local-file/, "/api/dl/local-file").replace(/^\/api\/local-image/, "/api/dl/local-image")
      }))
    }));
    LOCAL.flat = [];
    LOCAL.groups.forEach(g => g.files.forEach(f => LOCAL.flat.push(f)));
    LOCAL.selected.clear();
    LOCAL.lbIndex = -1;
    localRenderGroups();
  }

  function localRenderGroups() {
    const host = dlEl("dlLocalGroups");
    if (!LOCAL.flat.length) {
      host.innerHTML = '<div class="empty"><div style="font-size:40px">🕳️</div><h3>该目录下没有' + (LOCAL.kind === "image" ? "图片" : "视频") + "</h3></div>";
      localUpdateDock();
      return;
    }
    host.innerHTML = "";
    LOCAL.groups.forEach(g => {
      const sec = document.createElement("div");
      sec.className = "local-group";
      sec.dataset.folder = g.folder;
      sec.innerHTML = '<div class="lg-head"><span class="lg-folder">📁 ' + escapeHtml(g.folder) + '</span><span class="lg-count">' + g.count + " 个</span></div><div class=\"local-masonry\"></div>";
      const m = $(".local-masonry", sec);
      g.files.forEach(f => m.appendChild(localBuildTile(f)));
      host.appendChild(sec);
    });
    localUpdateDock();
    localObserveVideos();
  }

  function localBuildTile(f) {
    const tile = document.createElement("div");
    tile.className = "local-tile";
    tile.dataset.path = f.path;
    if (LOCAL.selected.has(f.path)) tile.classList.add("selected");
    const isVideo = f.kind === "video";
    const mediaInner = isVideo
      ? '<div class="local-ph v" data-vid="' + escapeHtml(f.url) + '">▶</div>'
      : '<img loading="lazy" src="' + escapeHtml(f.url) + '" alt="" onerror="this.classList.add(\'failed\')">';
    tile.innerHTML =
      '<div class="local-check">✓</div>' +
      '<div class="local-media" style="aspect-ratio:0.75">' + mediaInner + "</div>" +
      '<div class="local-badge">' + (isVideo ? "🎬" : "🖼️") + "</div>" +
      '<div class="local-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + "</div>";
    $(".local-check", tile).addEventListener("click", e => { e.stopPropagation(); localToggleSel(f); });
    tile.addEventListener("click", () => localOpenLb(LOCAL.flat.indexOf(f)));
    return tile;
  }

  let vidObserver = null;
  function localObserveVideos() {
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
        v.addEventListener("loadedmetadata", () => { try { v.currentTime = 0.1; } catch (e) {} });
        ph.replaceWith(v);
      });
    }, { rootMargin: "400px" });
    $$(".local-media").forEach(el => vidObserver.observe(el));
  }

  function localToggleSel(f) {
    if (LOCAL.selected.has(f.path)) LOCAL.selected.delete(f.path);
    else LOCAL.selected.add(f.path);
    const t = $('.local-tile[data-path="' + cssEsc(f.path) + '"]');
    if (t) t.classList.toggle("selected", LOCAL.selected.has(f.path));
    localUpdateDock();
  }

  function localSetSelAll(on) {
    LOCAL.selected.clear();
    if (on) LOCAL.flat.forEach(f => LOCAL.selected.add(f.path));
    $$(".local-tile").forEach(t => t.classList.toggle("selected", on));
    localUpdateDock();
  }

  function localUpdateDock() {
    const n = LOCAL.selected.size;
    dlEl("dlLocalN").textContent = n;
    dlEl("dlLocalDock").classList.toggle("visible", n > 0);
    dlEl("dlLocalDel").disabled = n === 0;
  }

  function localOpenLb(idx) {
    if (idx < 0 || idx >= LOCAL.flat.length) return;
    LOCAL.lbIndex = idx;
    localRenderLb();
    dlEl("dlLocalLightbox").hidden = false;
  }
  function localCloseLb() {
    dlEl("dlLocalLightbox").hidden = true;
    LOCAL.lbIndex = -1;
  }
  function localRenderLb() {
    const f = LOCAL.flat[LOCAL.lbIndex];
    if (!f) { localCloseLb(); return; }
    const box = dlEl("dlLoContent");
    if (f.kind === "video") box.innerHTML = '<video src="' + escapeHtml(f.url) + '" controls autoplay playsinline></video>';
    else box.innerHTML = '<img src="' + escapeHtml(f.url) + '" alt="">';
    dlEl("dlLoMeta").textContent = (LOCAL.lbIndex + 1) + " / " + LOCAL.flat.length + "　📁 " + f.folder + "　" + f.name;
    dlEl("dlLoPrev").classList.toggle("disabled", LOCAL.lbIndex <= 0);
    dlEl("dlLoNext").classList.toggle("disabled", LOCAL.lbIndex >= LOCAL.flat.length - 1);
  }
  function localLbPrev() { if (LOCAL.lbIndex > 0) { LOCAL.lbIndex--; localRenderLb(); } }
  function localLbNext() { if (LOCAL.lbIndex < LOCAL.flat.length - 1) { LOCAL.lbIndex++; localRenderLb(); } }

  async function localLbDelete() {
    const f = LOCAL.flat[LOCAL.lbIndex];
    if (!f) return;
    if (!confirm("确认删除「" + f.name + "」？\n\n将移到废纸篓（可在废纸篓中恢复）。")) return;
    const r = await api("/api/dl/local/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [f.path] }),
    }).catch(e => ({ error: e.message }));
    if (r.error || !r.deleted) { toast("删除失败：" + (r.error || "未知")); return; }
    toast("已删除：" + f.name);
    localPurge([f.path]);
    if (!LOCAL.flat.length) { localCloseLb(); return; }
    if (LOCAL.lbIndex >= LOCAL.flat.length) LOCAL.lbIndex = LOCAL.flat.length - 1;
    localRenderLb();
  }

  async function localDeleteSelected() {
    const paths = [...LOCAL.selected];
    if (!paths.length) return;
    if (!confirm("确认删除选中的 " + paths.length + " 个文件？\n\n将移到废纸篓（可在废纸篓中恢复）。")) return;
    const r = await api("/api/dl/local/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    }).catch(e => ({ error: e.message }));
    if (r.error) { toast("删除失败：" + r.error); return; }
    toast("已删除 " + r.deleted + " 个" + (r.failed.length ? "，失败 " + r.failed.length + " 个" : ""));
    await localLoad();
  }

  function localPurge(deletedPaths) {
    const del = new Set(deletedPaths);
    if (!del.size) return;
    LOCAL.flat = LOCAL.flat.filter(f => !del.has(f.path));
    del.forEach(p => LOCAL.selected.delete(p));
    LOCAL.groups = LOCAL.groups.map(g => {
      const files = g.files.filter(f => !del.has(f.path));
      return { folder: g.folder, count: files.length, files };
    }).filter(g => g.count > 0);
    del.forEach(p => {
      const t = $('.local-tile[data-path="' + cssEsc(p) + '"]');
      if (t) t.remove();
    });
    $$(".local-group").forEach(sec => {
      if (!$(".local-tile", sec)) sec.remove();
    });
    localUpdateDock();
  }

  async function localPickRoot() {
    try {
      const picked = await api("/api/dl/pick-dir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: LOCAL.root }),
      });
      if (!picked || picked.cancelled) return;
      if (picked.error) { toast("打开目录选择框失败：" + picked.error); return; }
      LOCAL.root = picked.path;
      // 本地资源目录独立记忆，不与去水印下载等其他"选择目录"共用值
      localStorage.setItem("dyxhs_local_root", picked.path);
      await localLoad();
    } catch (e) { toast("打开目录选择框失败：" + (e.message || e)); }
  }

  /* ==========================================================
   * 对外入口（showPage 调用）
   * ========================================================== */
  window.dlBootOnce = function () {
    dlBoot();
    if (!DL._initialLoaded) {
      DL._initialLoaded = true;
      // 首次进入自动解析一次剪贴板内容？不自动，保持空态等待用户操作
    }
  };
  window.kfBootOnce = function () { kfBoot(); };
  window.localBootOnce = function () {
    localBoot();
    // 首次进入本地资源：仅使用本地资源专属目录（不与去水印下载等其他选择目录共用）
    const saved = localStorage.getItem("dyxhs_local_root");
    if (saved && !LOCAL.groups.length) {
      LOCAL.root = saved;
      localLoad();
    }
  };
  window.localSwitchKind = localSwitchKind;
})();
