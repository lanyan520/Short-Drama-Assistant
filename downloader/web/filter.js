/* 图片过滤独立页面逻辑：选目录 → 宽高/大小过滤 → 瀑布流结果 */
"use strict";

const $ = (s) => document.querySelector(s);

const api = async (p, o) => {
  const r = await fetch(p, o);
  let data;
  try { data = await r.json(); }
  catch (e) { throw new Error(`HTTP ${r.status}`); }
  if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
  return data;
};

let filterDir = null;

function shortPath(p) {
  if (!p) return "";
  const parts = p.replace(/\/+$/, "").split("/");
  return parts.slice(-2).join("/") || p;
}

function fmtKb(b) {
  if (b == null) return "—";
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

async function pickDir() {
  const picked = await api("/api/pick-dir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(e => ({ error: e.message }));
  if (!picked || picked.cancelled) return;
  if (picked.error || !picked.path) { toast("打开目录选择框失败：" + (picked.error || "未知")); return; }
  filterDir = picked.path;
  $("#filter-dir-label").textContent = shortPath(picked.path);
}

async function doSearch() {
  if (!filterDir) { toast("请先选择要扫描的目录"); return; }
  const minW = parseInt($("#f-min-w").value) || 0;
  const minH = parseInt($("#f-min-h").value) || 0;
  const minSize = parseInt($("#f-min-size").value) || 0;

  $("#filter-results").innerHTML = "";
  $("#result-count").hidden = true;
  $("#filter-progress").hidden = false;
  $("#filter-prog-text").textContent = "正在扫描目录…";
  $("#btn-filter-search").disabled = true;

  let data = null;
  try {
    const resp = await fetch("/api/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: filterDir, min_width: minW, min_height: minH, min_size_kb: minSize }),
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
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
          $("#filter-prog-text").textContent = evt.text;
        } else if (evt.type === "result") {
          data = evt;
        } else if (evt.type === "error") {
          data = evt;
        }
      }
    }
  } catch (e) {
    data = { type: "error", error: "连接中断：" + e.message };
  }

  $("#filter-progress").hidden = true;
  $("#btn-filter-search").disabled = false;

  if (!data) { toast("没有返回结果"); return; }
  if (data.type === "error") { toast(data.error); return; }
  renderResults(data.results || []);
}

function renderResults(results) {
  const box = $("#filter-results");
  if (!results.length) {
    box.innerHTML = `<div class="empty"><h3>没有满足条件的图片</h3></div>`;
    $("#result-count").hidden = true;
    return;
  }
  $("#result-count").hidden = false;
  $("#result-n").textContent = results.length;
  // 去掉懒加载：所有图片立即异步加载，decoding=async 不阻塞渲染
  box.innerHTML = results.map(r => `
    <div class="fresult">
      <img src="/api/local-image?path=${encodeURIComponent(r.path)}" alt="" decoding="async"
           onerror="this.parentElement.classList.add('failed')">
      <div class="fmeta">
        <span class="fdim">${r.width}×${r.height}</span>
        <span class="fdim">${fmtKb(r.size)}</span>
      </div>
    </div>
  `).join("");
}

$("#btn-filter-dir").onclick = pickDir;
$("#btn-filter-search").onclick = doSearch;
