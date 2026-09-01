/* 无水印下载器前端逻辑：粘贴链接 → 解析 → 选目录+分类下载 */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (p, o) => {
  const r = await fetch(p, o);
  let data;
  try { data = await r.json(); }
  catch (e) { throw new Error(`HTTP ${r.status}`); }
  if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
  return data;
};

const state = {
  loading: false,
  authors: new Map(),          // authorId -> author 数据
  selected: new Map(),         // itemId -> {item, author}
  itemIndex: new Map(),        // itemId -> {item, author}
  categories: [],
  settings: {},
};

const PLAT_LABEL = { douyin: "抖音", xhs: "小红书" };
const LS_CAT = "dyxhs_last_category";   // 记住上次选的分类
const LS_DIR = "dyxhs_last_dir";        // 记住上次选的保存目录

/* ---------------------------------------------------- 启动 */

async function boot() {
  const data = await api("/api/bootstrap");
  state.categories = data.categories;
  state.settings = data.settings;
  renderCategoryOptions();
  // 恢复上次选的分类
  const savedCat = localStorage.getItem(LS_CAT);
  if (savedCat && state.categories.includes(savedCat)) {
    $("#dock-cat").value = savedCat;
  }
  // 恢复上次选的目录（优先 localStorage，其次服务端 last_dir）
  const savedDir = localStorage.getItem(LS_DIR);
  if (savedDir) state.settings.last_dir = savedDir;
  renderDirLabel();
  bindGlobal();
}

/* ---------------------------------------------------- 目录 & 分类记忆 */

function shortPath(p) {
  if (!p) return "";
  const parts = p.replace(/\/+$/, "").split("/");
  return parts.slice(-2).join("/") || p;
}

function renderDirLabel() {
  const d = state.settings.last_dir;
  $("#dock-dir-label").textContent = d ? shortPath(d) : "选择目录";
  $("#btn-dir").title = d ? "保存到：" + d + "（点击更换）" : "点击选择保存目录";
}

// 弹出目录选择框；成功返回路径并记住，取消返回 null
async function pickDir() {
  const picked = await api("/api/pick-dir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ default: state.settings.last_dir }),
  }).catch(e => ({ error: e.message }));

  if (!picked || picked.cancelled) return null;
  if (picked.error) { toast("打开目录选择框失败：" + picked.error); return null; }
  if (!picked.path) { toast("未获取到保存目录，请重试"); return null; }
  state.settings.last_dir = picked.path;
  localStorage.setItem(LS_DIR, picked.path);
  renderDirLabel();
  return picked.path;
}

/* ---------------------------------------------------- 链接解析 */

async function doParse() {
  const text = $("#links").value.trim();
  if (!text) { toast("请先粘贴分享链接"); return; }
  if (state.loading) return;
  state.loading = true;
  state.authors.clear();
  state.itemIndex.clear();
  state.selected.clear();
  $("#list").innerHTML = "";
  showBanner(null);
  renderSkeleton();
  showParseProgress(true, "正在解析…");

  let resp;
  try {
    resp = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "auto", media_type: "auto", text }),
    });
  } catch (e) {
    state.loading = false; clearSkeleton(); showParseProgress(false);
    showBanner({ type: "err", text: "网络请求失败：" + e.message });
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
        const evt = JSON.parse(block.slice(6));
        if (evt.type === "progress") {
          showParseProgress(true, evt.text);
        } else if (evt.type === "result") {
          data = evt;
        } else if (evt.type === "error") {
          data = evt;
        }
      }
    }
  } catch (e) {
    state.loading = false; clearSkeleton(); showParseProgress(false);
    showBanner({ type: "err", text: "解析连接中断：" + e.message });
    return;
  }

  state.loading = false; clearSkeleton(); showParseProgress(false);

  if (!data) {
    renderEmpty("解析未返回结果，请重试。");
    return;
  }
  if (data.type === "error") {
    renderEmpty(data.error);
    showBanner({ type: "err", text: data.error, needCookie: data.need_cookie });
    return;
  }
  const authors = data.authors || [];
  if (authors.length === 0) {
    renderEmpty("没有解析到可下载内容，检查链接格式或所选分类是否正确。");
    return;
  }
  authors.forEach(a => appendAuthor(a));
  if (data.notice) {
    showBanner({ type: "warn", text: data.notice, needCookie: /Cookie|登录/.test(data.notice) });
  } else {
    const its = [...state.itemIndex.values()].map(v => v.item);
    const v = its.filter(i => i.type === "video").length;
    const im = its.filter(i => i.type === "image").length;
    showBanner({
      type: "info",
      text: `已从 ${authors.length} 个链接解析出 ${its.length} 个无水印内容（视频 ${v} · 图片 ${im}）。`,
    });
  }
}

/* ---------------------------------------------------- 渲染作者卡片 */

function fmtFollowers(n) {
  if (!n) return "—";
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return String(n);
}

function appendAuthor(a) {
  if (state.authors.has(a.id)) return;
  state.authors.set(a.id, a);
  a.items.forEach(it => state.itemIndex.set(it.id, { item: it, author: a }));

  const card = document.createElement("div");
  card.className = "author-card";
  card.dataset.author = a.id;

  const tag = a.platform === "xhs"
    ? `<span class="tag xhs">小红书</span>`
    : `<span class="tag douyin">抖音</span>`;
  const handle = a.handle ? `@${escapeHtml(a.handle)}` : "";
  const sig = a.signature ? `<div class="author-sig">${escapeHtml(a.signature)}</div>` : "";
  const avatar = a.avatar ? proxied(a.avatar, a.platform) : "";
  const capped = !!a.capped;
  const shownCount = a.items.length;

  card.innerHTML = `
    <div class="author-head">
      ${avatar
        ? `<img class="avatar" src="${avatar}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<div class="avatar placeholder"></div>`}
      <div class="author-meta">
        <div class="author-line1">
          <span class="author-name">${escapeHtml(a.nickname)}</span>
          ${tag}
        </div>
        <div class="author-line2">
          ${handle ? `<span>${handle}</span><span class="sep">·</span>` : ""}
          <span><b>${fmtFollowers(a.followers)}</b> 粉丝</span>
          <span class="sep">·</span>
          <span>已解析 <b>${shownCount}</b> 个作品</span>
        </div>
        ${sig}
        ${capped ? `<div class="author-cap">⚠ 匿名仅能拉取最近 ${shownCount} 个作品；该用户主页显示的作品更多。右上角「设置」填抖音登录 Cookie 可解锁全部作品。</div>` : ""}
      </div>
      <div class="author-actions">
        <span class="sel-badge" data-badge hidden></span>
        <button class="btn sm ghost" data-selauthor>全选全部</button>
      </div>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "author-body";
  card.appendChild(body);

  renderSection(body, "video", "🎬 视频", a.items.filter(i => i.type === "video"), a);
  renderSection(body, "image", "🖼 图片", a.items.filter(i => i.type === "image"), a);

  $("[data-selauthor]", card).onclick = e => { e.stopPropagation(); toggleAuthorSelect(a); };
  $("#list").appendChild(card);
}

// 渲染「视频 / 图片」分组区域；无内容则整块不显示
function renderSection(host, kind, title, items, author) {
  if (!items.length) return;
  const sec = document.createElement("div");
  sec.className = "author-section";
  sec.dataset.section = kind;
  sec.innerHTML = `
    <div class="sec-head">
      <span class="sec-title">${title}</span>
      <span class="sec-count"><b>${items.length}</b> 个</span>
      <span class="sec-badge" data-secbadge="${kind}" hidden></span>
      <button class="btn sm ghost sec-sel" data-selsection="${kind}">全选本类</button>
    </div>
    <div class="masonry"></div>
  `;
  const masonry = $(".masonry", sec);
  items.forEach(it => masonry.appendChild(buildTile(it, author)));
  $("[data-selsection]", sec).onclick = e => { e.stopPropagation(); toggleSectionSelect(author, kind); };
  host.appendChild(sec);
}

function buildTile(item, author) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.item = item.id;
  if (state.selected.has(item.id)) tile.classList.add("selected");

  const ratio = item.width && item.height ? item.height / item.width : 1.4;
  const isVideo = item.type === "video";
  // 视频预览只用封面；图片可用 thumb 或下载直链兜底
  const preview = isVideo
    ? (item.thumb ? proxied(item.thumb, author.platform) : "")
    : proxied(item.thumb || item.url, author.platform);
  const badge = isVideo
    ? `<div class="tile-badge">▶ ${fmtDur(item.duration)}</div>`
    : (item.width ? `<div class="tile-badge">${item.width}×${item.height}</div>` : "");

  // 有可预览地址才渲染 <img>，否则用占位符（如无封面的视频）
  const mediaInner = preview
    ? `<img class="thumb" alt="" loading="lazy" data-preview="${escapeHtml(preview)}" data-kind="${item.type}">`
    : `<div class="tile-ph ${isVideo ? "v" : "i"}">${isVideo ? "▶" : "图"}</div>`;

  tile.innerHTML = `
    <div class="tile-check">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="3.4"><path d="M5 12l5 5L20 6"/></svg>
    </div>
    <div class="media" style="aspect-ratio:${(1 / ratio).toFixed(3)}">
      ${mediaInner}
    </div>
    ${badge}
    ${item.title ? `<div class="tile-hover">${escapeHtml(item.title)}</div>` : ""}
    <div class="tile-url">
      <span class="u" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</span>
      <button class="copy" data-copy title="复制无水印链接">复制</button>
    </div>
  `;

  const img = $(".media .thumb", tile);
  if (img) {
    img.addEventListener("load", () => img.classList.add("loaded"));
    img.addEventListener("error", () => onTileImgError(img));
    img.src = preview;  // 绑定完事件再赋值，确保 onload/onerror 都能捕获
  }

  $(".tile-check", tile).onclick = e => { e.stopPropagation(); toggleItem(item, author); };
  tile.onclick = e => {
    if (e.metaKey || e.ctrlKey) { openLightbox(item, author); return; }
    toggleItem(item, author);
  };
  tile.ondblclick = e => { e.preventDefault(); openLightbox(item, author); };
  $("[data-copy]", tile).onclick = e => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.url)
      .then(() => toast("已复制无水印链接"))
      .catch(() => toast("复制失败，请手动选择"));
  };
  return tile;
}

// 预览图加载失败：先自动重试两次（带缓存绕过参数），仍失败则换成占位符，避免裂图/高度塌陷
function onTileImgError(img) {
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

function fmtDur(s) {
  s = Math.round(s || 0);
  if (!s) return "视频";
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/* ---------------------------------------------------- 选择逻辑 */

function toggleItem(item, author) {
  if (state.selected.has(item.id)) state.selected.delete(item.id);
  else state.selected.set(item.id, { item, author });
  syncTile(item.id);
  updateAuthorBadge(author.id);
  updateDock();
}

function toggleAuthorSelect(author) {
  const ids = author.items.map(i => i.id);
  const allSelected = ids.every(id => state.selected.has(id));
  author.items.forEach(it => {
    if (allSelected) state.selected.delete(it.id);
    else state.selected.set(it.id, { item: it, author });
    syncTile(it.id);
  });
  updateAuthorBadge(author.id);
  updateDock();
}

function toggleSectionSelect(author, kind) {
  const ids = author.items.filter(i => i.type === kind).map(i => i.id);
  if (!ids.length) return;
  const allSelected = ids.every(id => state.selected.has(id));
  ids.forEach(id => {
    const rec = state.itemIndex.get(id);
    if (allSelected) state.selected.delete(id);
    else if (rec) state.selected.set(id, rec);
    syncTile(id);
  });
  updateAuthorBadge(author.id);
  updateDock();
}

function syncTile(itemId) {
  const t = $(`[data-item="${cssEsc(itemId)}"]`);
  if (t) t.classList.toggle("selected", state.selected.has(itemId));
}

function updateAuthorBadge(authorId) {
  const author = state.authors.get(authorId);
  if (!author) return;
  const card = $(`[data-author="${cssEsc(authorId)}"]`);
  if (!card) return;
  const selAll = author.items.filter(i => state.selected.has(i.id)).length;
  const badge = $("[data-badge]", card);
  const btn = $("[data-selauthor]", card);
  if (selAll > 0) { badge.hidden = false; badge.textContent = `已选 ${selAll}`; }
  else badge.hidden = true;
  btn.textContent = (selAll === author.items.length && author.items.length > 0) ? "取消全选" : "全选全部";

  for (const kind of ["video", "image"]) {
    const secBadge = $(`[data-secbadge="${kind}"]`, card);
    const secBtn = $(`[data-selsection="${kind}"]`, card);
    if (!secBadge) continue;
    const ids = author.items.filter(i => i.type === kind).map(i => i.id);
    const sel = ids.filter(id => state.selected.has(id)).length;
    if (sel > 0) { secBadge.hidden = false; secBadge.textContent = `已选 ${sel}`; }
    else secBadge.hidden = true;
    secBtn.textContent = (sel === ids.length && ids.length > 0) ? "取消本类" : "全选本类";
  }
}

function updateDock() {
  const n = state.selected.size;
  $("#dock-n").textContent = n;
  const authorSet = new Set([...state.selected.values()].map(v => v.author.id));
  $("#dock-sub").textContent = `来自 ${authorSet.size} 位作者`;
  $("#dock").classList.toggle("show", n > 0);
  $("#btn-download").disabled = n === 0;
}

/* ---------------------------------------------------- 下载 */

async function startDownload() {
  if (state.selected.size === 0) return;

  // 已有记住的目录就直接用，不弹框；没有才弹一次
  let root = state.settings.last_dir;
  if (!root) {
    root = await pickDir();
    if (!root) return;
  }

  const category = $("#dock-cat").value;

  const items = [...state.selected.values()].map(({ item, author }) => ({
    url: item.url,
    platform: author.platform,
    media_type: item.type,
    author_nickname: author.nickname,
    author_handle: author.handle,
    title: item.title,
    item_id: item.id,
    ext: item.ext,
  }));

  const res = await api("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root, category, layout: "platform_author", items }),
  }).catch(e => ({ error: e.message }));

  if (!res || res.error) { toast("下载启动失败：" + (res?.error || "未知")); return; }
  if (!res.task_id) { toast("下载启动失败：未返回任务 ID"); return; }
  openProgress(res.task_id, root);
}

let progTaskId = null;
let progES = null;
let progPollTimer = null;
let progAutoCloseTimer = null;

function closeProgress() {
  $("#mask-progress").classList.remove("show");
  if (progES) { progES.close(); progES = null; }
  if (progPollTimer) { clearInterval(progPollTimer); progPollTimer = null; }
  if (progAutoCloseTimer) { clearTimeout(progAutoCloseTimer); progAutoCloseTimer = null; }
  progTaskId = null;
  // 重置中止按钮
  const btn = $("#btn-cancel-dl");
  btn.disabled = false;
  btn.textContent = "中止";
  btn.hidden = false;
  btn.onclick = cancelDownload;
}

function openProgress(taskId, root) {
  if (progAutoCloseTimer) { clearTimeout(progAutoCloseTimer); progAutoCloseTimer = null; }
  progTaskId = taskId;
  $("#mask-progress").classList.add("show");
  $("#prog-title").textContent = "正在下载";
  $("#prog-path") && ($("#prog-path").textContent = "保存到：" + root);
  $("#btn-prog-done").hidden = true;
  $("#btn-reveal").hidden = true;
  $("#btn-cancel-dl").hidden = false;
  $("#btn-cancel-dl").disabled = false;
  $("#btn-cancel-dl").textContent = "中止";
  $("#prog-files").innerHTML = "";

  if (progES) progES.close();
  if (progPollTimer) { clearInterval(progPollTimer); progPollTimer = null; }

  // 优先用 SSE，失败则降级为轮询
  progES = new EventSource(`/api/download/${taskId}/events`);
  let sseFailed = false;
  progES.onmessage = ev => {
    const snap = JSON.parse(ev.data);
    renderProgress(snap, root);
    if (snap.finished) {
      progES.close();
      progES = null;
      onDownloadFinished(snap, root);
    }
  };
  progES.onerror = () => {
    if (!progTaskId) return;
    // SSE 断了，降级为轮询
    if (progES) { progES.close(); progES = null; }
    if (!progPollTimer) {
      progPollTimer = setInterval(async () => {
        if (!progTaskId) { clearInterval(progPollTimer); progPollTimer = null; return; }
        try {
          const snap = await fetch(`/api/download/${progTaskId}`).then(r => r.json());
          renderProgress(snap, root);
          if (snap.finished) {
            clearInterval(progPollTimer);
            progPollTimer = null;
            onDownloadFinished(snap, root);
          }
        } catch (e) {
          // 轮询也失败，提示用户
          const det = $("#prog-detail");
          if (det) det.textContent = "进度连接中断，可点击中止或强制关闭";
        }
      }, 800);
    }
  };
}

function renderProgress(snap, root) {
  // 以文件完成数为主要进度（更直观、不会因单文件卡顿而停在 0%）
  const completed = snap.done_files + snap.failed_files + (snap.cancelled_files || 0);
  const started = snap.started_files || completed;
  let pct;
  if (snap.total_files) {
    // 完成的算 1 份，已启动未完成的算 0.3 份（避免卡 0% 看不出动静）
    pct = Math.round(((completed + Math.max(0, started - completed) * 0.3) / snap.total_files) * 100);
  } else {
    pct = 0;
  }
  if (snap.finished) pct = 100;
  pct = Math.max(0, Math.min(100, pct));
  $("#prog-pct").textContent = pct + "%";
  $("#prog-bar").style.width = pct + "%";
  const running = (snap.started_files || 0) - completed;
  $("#prog-detail").textContent =
    `${snap.done_files}/${snap.total_files} 完成` +
    (running > 0 ? `，${running} 下载中` : "") +
    (snap.failed_files ? `，${snap.failed_files} 失败` : "") +
    (snap.cancelled_files ? `，${snap.cancelled_files} 已取消` : "") +
    `　${fmtBytes(snap.received_bytes)}`;

  const box = $("#prog-files");
  box.innerHTML = snap.files.map(f => {
    const stLabel = {
      done: "✓ 完成", error: "✕ 失败", running: "下载中",
      pending: "等待", cancelled: "已取消",
    }[f.state] || f.state;
    const detail = f.state === "error" ? `　${escapeHtml(f.error || "")}` : "";
    return `<div class="file-row">
      <span class="nm">${escapeHtml(f.author)} · ${escapeHtml(f.title || f.item_id)}${detail}</span>
      <span class="st ${f.state}">${stLabel}</span>
    </div>`;
  }).join("");
}

function onDownloadFinished(snap, root) {
  if (snap.cancelled) {
    $("#prog-title").textContent = "已中止";
  } else {
    $("#prog-title").textContent = "下载完成";
  }
  $("#btn-cancel-dl").hidden = true;
  $("#btn-prog-done").hidden = false;
  $("#btn-reveal").hidden = false;
  $("#btn-prog-done").onclick = closeProgress;
  $("#btn-reveal").onclick = () => {
    const firstOk = snap.files.find(f => f.state === "done");
    api("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: firstOk?.saved_path || root }),
    }).catch(() => {});
  };
  const msg = snap.cancelled
    ? `已中止：成功 ${snap.done_files} 个`
    : `下载完成：成功 ${snap.done_files} 个${snap.failed_files ? "，失败 " + snap.failed_files + " 个" : ""}`;
  toast(msg);
  // 完成后自动关闭弹窗（保留 2.5s 以便查看结果 / 在访达中显示）
  progAutoCloseTimer = setTimeout(closeProgress, 2500);
}
function cancelDownload() {
  if (!progTaskId) return;
  const tid = progTaskId;
  // 后台异步发取消请求（带超时，不阻塞 UI），立即关闭弹窗
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000);
  fetch(`/api/download/${tid}/cancel`, { method: "POST", signal: controller.signal })
    .catch(() => {});
  toast("已中止下载");
  closeProgress();
}

/* ---------------------------------------------------- 设置 */

function openSettings() {
  const s = state.settings;
  $("#ck-dy").value = "";
  $("#ck-xhs").value = "";
  $("#ck-dy").placeholder = s.douyin_cookie_set ? "（已配置，留空则保持不变）" : "一般留空";
  $("#ck-xhs").placeholder = s.xhs_cookie_set ? "（已配置，留空则保持不变）" : "a1=...; web_session=...";
  $("#cfg-conc").value = s.concurrency || 4;
  $("#mask-settings").classList.add("show");
}

async function saveSettings() {
  const patch = {
    concurrency: Math.max(1, Math.min(12, parseInt($("#cfg-conc").value) || 4)),
  };
  const dy = $("#ck-dy").value.trim();
  const xhs = $("#ck-xhs").value.trim();
  if (dy) patch.douyin_cookie = dy;
  if (xhs) patch.xhs_cookie = xhs;

  state.settings = await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  $("#mask-settings").classList.remove("show");
  toast("设置已保存");
}

/* ---------------------------------------------------- 图片过滤 */

function openFilter() {
  window.open("/static/filter.html", "_blank");
}

/* ---------------------------------------------------- 骨架 / 空态 / banner */

function showParseProgress(show, text) {
  const el = $("#parse-progress");
  if (!show) { el.hidden = true; return; }
  el.hidden = false;
  if (text) {
    $("#pp-text").textContent = text;
    // 进度条做无限滚动动画效果（实际进度未知）
    const bar = $("#pp-bar");
    bar.classList.add("indeterminate");
  }
}

function renderSkeleton() {
  $("#list").innerHTML = `
    <div class="skeleton-card">
      <div class="sk-row"><div class="sk sk-av"></div><div style="flex:1">
        <div class="sk" style="height:13px;width:38%;margin-bottom:7px"></div>
        <div class="sk" style="height:11px;width:60%"></div></div></div>
      <div class="sk-tiles">
        <div class="sk sk-tile" style="height:150px"></div>
        <div class="sk sk-tile" style="height:110px"></div>
        <div class="sk sk-tile" style="height:170px"></div>
      </div>
    </div>`;
}

function clearSkeleton() {
  $$(".skeleton-card").forEach(e => e.remove());
}

function renderEmpty(msg) {
  $("#list").innerHTML = `
    <div class="empty">
      <div style="font-size:40px">🔍</div>
      <h3>${escapeHtml(msg)}</h3>
    </div>`;
}

function showBanner(cfg) {
  const slot = $("#banner-slot");
  if (!cfg) { slot.innerHTML = ""; return; }
  const ico = cfg.type === "err" ? "✕" : cfg.type === "info" ? "ℹ" : "⚠";
  const act = cfg.needCookie
    ? `<button class="btn sm ghost b-act" onclick="openSettings()">去设置</button>`
    : "";
  slot.innerHTML = `<div class="banner ${cfg.type}">
      <span class="b-ico">${ico}</span>
      <div>${escapeHtml(cfg.text)}</div>
      ${act}
    </div>`;
}

/* ---------------------------------------------------- 灯箱预览 */

function openLightbox(item, author) {
  const box = $("#lightbox");
  const content = $("#lb-content");
  const url = proxied(item.url, author.platform);
  if (item.type === "video") {
    if (!item.url) { toast("该视频缺少直链，无法预览"); return; }
    content.innerHTML = `<video src="${url}" controls autoplay playsinline></video>`;
  } else {
    content.innerHTML = `<img src="${url}" alt="">`;
  }
  box.classList.add("show");
}

/* ---------------------------------------------------- 工具 */

function proxied(url, platform) {
  if (!url) return "";
  if (platform === "demo") return url;
  return `/api/proxy?platform=${platform}&url=${encodeURIComponent(url)}`;
}

function renderCategoryOptions() {
  $("#dock-cat").innerHTML =
    state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
}

function fmtBytes(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i ? 1 : 0) + " " + u[i];
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function cssEsc(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------------------------------------------------- 清空 / 粘贴 */

function clearAll() {
  $("#links").value = "";
  state.authors.clear();
  state.itemIndex.clear();
  state.selected.clear();
  $("#list").innerHTML = "";
  showBanner(null);
  updateDock();
}

async function doPaste() {
  if (state.loading) { toast("正在解析中，请稍候"); return; }
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (e) {
    toast("无法读取剪贴板，请点击输入框后手动 Cmd+V");
    return;
  }
  text = (text || "").trim();
  if (!text) { toast("剪贴板为空"); return; }
  clearAll();                      // 1. 清空
  $("#links").value = text;        // 2. 粘贴
  doParse();                       // 3. 自动解析
}

/* ---------------------------------------------------- 全局事件 */

function bindGlobal() {
  $("#btn-parse").onclick = doParse;
  $("#btn-paste").onclick = doPaste;
  $("#btn-clear").onclick = clearAll;

  $("#btn-download").onclick = startDownload;

  // 更换保存目录
  $("#btn-dir").onclick = () => {
    pickDir().then(root => { if (root) toast("已切换保存目录：" + shortPath(root)); });
  };
  // 记住分类选择
  $("#dock-cat").onchange = () => {
    localStorage.setItem(LS_CAT, $("#dock-cat").value);
  };

  $("#btn-settings").onclick = openSettings;
  $("#btn-save-settings").onclick = saveSettings;
  $("#btn-cancel-dl").onclick = cancelDownload;

  // 图片过滤（新窗口打开）
  $("#btn-filter").onclick = openFilter;

  $$("[data-close]").forEach(b => b.onclick = () => $("#mask-settings").classList.remove("show"));
  $$("[data-close-prog]").forEach(b => b.onclick = () => closeProgress());

  initNav();

  $("#lb-close").onclick = () => $("#lightbox").classList.remove("show");
  $("#lightbox").onclick = e => { if (e.target.id === "lightbox") $("#lightbox").classList.remove("show"); };

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      $("#lightbox").classList.remove("show");
      $("#mask-settings").classList.remove("show");
    }
  });
}

window.openSettings = openSettings;

/* ---------------------------------------------------- 左侧导航切换 */
function initNav() {
  // 只处理顶层导航项（.nav 的直接子项），二级子项（本地资源·图片/视频）由 local.js 绑定
  const items = $$(".nav > .nav-item");
  const panels = $$(".panel");
  items.forEach(el => {
    el.onclick = () => {
      const view = el.dataset.view;
      items.forEach(n => n.classList.toggle("active", n === el));
      $$(".nav-subitem").forEach(n => n.classList.remove("active")); // 切走时清除子项高亮
      panels.forEach(p => p.classList.toggle("active", p.id === "panel-" + view));
    };
  });
}

boot();
