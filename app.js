// 短剧助手 · 视频生成 - 交互脚本

const PLUS_SVG = '<svg class="plus" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#c0c4cc" stroke-width="2" stroke-linecap="round"/></svg>';
const WAVE_SVG = '<svg class="wave" viewBox="0 0 24 24" fill="none"><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 12h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const PLAY_SVG = '<svg class="play" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="#fff" stroke="#0052D9" stroke-width="1.5"/><path d="M10 8.5l5 3.5-5 3.5V8.5z" fill="#0052D9"/></svg>';

// ---- 参考图 9 宫格 ----
const refGrid = document.getElementById('refGrid');
for (let i = 1; i <= 9; i++) {
  const slot = document.createElement('div');
  slot.className = 'ref-slot';
  slot.innerHTML = PLUS_SVG + '<button class="remove" title="移除">×</button>';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
  slot.appendChild(input);
  slot.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove')) {
      e.stopPropagation();
      slot.classList.remove('filled');
      const old = slot.querySelector('img'); if (old) old.remove();
      input.value = '';
      updateSummary();
      return;
    }
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    let img = slot.querySelector('img');
    if (!img) { img = document.createElement('img'); slot.appendChild(img); }
    img.src = url;
    slot.classList.add('filled');
    updateSummary();
  });
  refGrid.appendChild(slot);
}

// ---- 参考音频 9 chips ----
const audioGrid = document.getElementById('audioGrid');
for (let i = 1; i <= 9; i++) {
  const chip = document.createElement('div');
  chip.className = 'audio-chip';
  chip.innerHTML = WAVE_SVG + `<span class="name">音频 ${i}</span><button class="remove" title="移除">×</button>`;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'audio/*'; input.hidden = true;
  chip.appendChild(input);
  chip.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove')) {
      e.stopPropagation();
      chip.classList.remove('filled');
      chip.querySelector('.name').textContent = '音频 ' + i;
      input.value = '';
      updateSummary();
      return;
    }
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    chip.querySelector('.name').textContent = file.name.length > 10 ? file.name.slice(0, 9) + '…' : file.name;
    chip.classList.add('filled');
    updateSummary();
  });
  audioGrid.appendChild(chip);
}

// ---- 参考视频 9 宫格 ----
const videoGrid = document.getElementById('videoGrid');
for (let i = 1; i <= 9; i++) {
  const slot = document.createElement('div');
  slot.className = 'video-slot';
  slot.innerHTML = PLAY_SVG + '<button class="remove" title="移除">×</button>';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'video/*'; input.hidden = true;
  slot.appendChild(input);
  slot.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove')) {
      e.stopPropagation();
      slot.classList.remove('filled');
      const old = slot.querySelector('video'); if (old) old.remove();
      input.value = '';
      updateSummary();
      return;
    }
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    let v = slot.querySelector('video');
    if (!v) { v = document.createElement('video'); v.muted = true; v.loop = true; slot.appendChild(v); }
    v.src = url; slot.classList.add('filled');
    updateSummary();
  });
  videoGrid.appendChild(slot);
}

// ---- 预览汇总更新 ----
function updateSummary() {
  const refCount = refGrid.querySelectorAll('.ref-slot.filled').length;
  const videoCount = videoGrid.querySelectorAll('.video-slot.filled').length;
  const audioCount = audioGrid.querySelectorAll('.audio-chip.filled').length;
  document.getElementById('sRef').textContent = refCount + ' 张';
  document.getElementById('sVideo').textContent = videoCount + ' 个';
  document.getElementById('sAudio').textContent = audioCount + ' 个';
  const dur = document.querySelector('.input-suffix input').value;
  document.getElementById('sDuration').textContent = (dur || '0') + ' 秒';
}

// ---- 开始生成（模拟）----
const genBtn = document.getElementById('genBtn');
const preview = document.getElementById('videoPreview');
const previewHint = document.getElementById('previewHint');
genBtn.addEventListener('click', () => {
  if (genBtn.disabled) return;
  genBtn.disabled = true;
  genBtn.querySelector('svg').nextSibling.textContent = '生成中…';
  previewHint.textContent = '正在生成，请稍候…';
  setTimeout(() => {
    previewHint.textContent = '示例成片（演示占位）';
    genBtn.disabled = false;
    genBtn.querySelector('svg').nextSibling.textContent = '开始生成';
  }, 2200);
});

// ---- 模块信息（非完整模块的占位页）----
const MODULES = {
  '音色克隆': null,  // 已独立实现 pageVoiceClone（声音生成 · 二级分类）
  '首帧生视频': {
    desc: '以首帧画面为起点生成后续视频内容。',
    features: ['首帧引导生成', '画面延续自然', '剧情推进可控']
  },
  '尾帧生视频': {
    desc: '以尾帧画面为目标反向生成视频内容。',
    features: ['尾帧收束', '结局可控', '反向推演剧情']
  },
  '首尾帧生视频': {
    desc: '同时指定首帧与尾帧，生成首尾呼应的完整视频。',
    features: ['首尾帧双向约束', '剧情闭环', '节奏可调']
  },
  '多图参考生视频': {
    desc: '在 MiniMax H3 资源面板加载图片 / 视频 / 音频，配合提示词，融合生成风格一致的视频。',
    features: ['图文音多模参考', '双采样', '角色一致']
  }
};

// ---- 导航切换（含页面切换）----
function fillModule(name) {
  const m = MODULES[name];
  if (!m) return;
  document.getElementById('modTitle').textContent = name;
  document.getElementById('modDesc').textContent = m.desc;
  document.getElementById('modCap').textContent = name + ' · 核心能力';
  const ul = document.getElementById('modFeatures');
  ul.innerHTML = '';
  m.features.forEach(f => {
    const li = document.createElement('li');
    li.textContent = f;
    ul.appendChild(li);
  });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // 切页先把右侧滚动容器回到顶部：若上一页滚动过，sticky 的 RunningHub 指南面板会钉在视口，
  // 导致 alignPreviewColumn 用 getBoundingClientRect 量到的位置失真（双人/三人/方言这类双 panel 页明显）
  const _main = document.querySelector('.main');
  if (_main) _main.scrollTop = 0;
  if (name === '视频生成') {
    document.getElementById('pageVideo').classList.add('active');
  } else if (name === '文生图') {
    document.getElementById('pageText2Img').classList.add('active');
    restoreT2i();   // 切入文生图时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '人像摄影') {
    document.getElementById('pagePortrait').classList.add('active');
    restorePr();    // 切入人像摄影时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '图片洗稿') {
    document.getElementById('pageImgRewrite').classList.add('active');
    restoreIr();    // 切入图片洗稿时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '修脸磨皮') {
    document.getElementById('pageFaceBeauty').classList.add('active');
    restoreFace();  // 切入修脸磨皮时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '高清放大') {
    document.getElementById('pageHdUpscale').classList.add('active');
    restoreHd();    // 切入高清放大时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '动漫转真人') {
    document.getElementById('pageAni2Real').classList.add('active');
    restoreA2r();   // 切入动漫转真人时恢复本地历史
    checkRh();
  } else if (name === '文生视频') {
    document.getElementById('pageMvPanel').classList.add('active');
    restoreMv();    // 切入文生视频时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '首帧生视频') {
    document.getElementById('pageFirstFrame').classList.add('active');
    restoreFf();    // 切入首帧生视频时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '尾帧生视频') {
    document.getElementById('pageLastFrame').classList.add('active');
    restoreLf();    // 切入尾帧生视频时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '首尾帧生视频') {
    document.getElementById('pageBothFrame').classList.add('active');
    restoreBf();    // 切入首尾帧生视频时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '多图参考生视频') {
    document.getElementById('pageMrPanel').classList.add('active');
    if (!window.mrLoader) {
      window.mrLoader = new MediaLoader(document.getElementById('mrMediaLoader'), {
        imageMax: 9, videoMax: 3, audioMax: 3, storageKey: 'mr_media_default'
      });
    }
    restoreMr();    // 切入全能参考双模双采生视频时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '扩图') {
    document.getElementById('pageExInpaint').classList.add('active');
    restoreEx();    // 切入扩图时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '单图指令编辑') {
    document.getElementById('pageInstructEdit').classList.add('active');
    restoreIe();    // 切入单图指令编辑时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '图片反推') {
    document.getElementById('pageRevImgPrompt').classList.add('active');
    if (window.revImgRestore) window.revImgRestore();   // 切入图片反推时恢复本地历史
    checkRh();
  } else if (name === '视频反推') {
    document.getElementById('pageRevVideoPrompt').classList.add('active');
    if (window.revVideoRestore) window.revVideoRestore();   // 切入视频反推时恢复本地历史
    checkRh();
  } else if (name === '姿势迁移') {
    document.getElementById('pagePoseTransfer').classList.add('active');
    restorePose();  // 切入姿势迁移时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '换脸') {
    document.getElementById('pageFaceSwap').classList.add('active');
    restoreFs();    // 切入换脸时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '音色克隆') {
    document.getElementById('pageVoiceClone').classList.add('active');
    restoreVc();    // 切入音色克隆时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '三人对话') {
    document.getElementById('pageTriDialogue').classList.add('active');
    restoreTd();    // 切入三人对话时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '双人对话') {
    document.getElementById('pagePairDialogue').classList.add('active');
    restorePd();    // 切入双人对话时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '方言克隆') {
    document.getElementById('pageDialectClone').classList.add('active');
    restoreDc();    // 切入方言克隆时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '音乐翻唱') {
    document.getElementById('pageMusicCover').classList.add('active');
    restoreMc();    // 切入音乐翻唱时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '参考图生图') {
    document.getElementById('pageRefImg').classList.add('active');
    renderRef3Grid(); // 进入页面即渲染上传按钮（boogu 风格网格）
    restoreRef();   // 切入参考图生图时恢复本地历史（最新在最上方）
    checkRh();
  } else if (name === '去水印下载') {
    document.getElementById('pageDlDownload').classList.add('active');
    dlBootOnce();   // 去水印下载首次切入时初始化（bootstrap 分类 + 绑定）
  } else if (name === '视频关键帧导出') {
    document.getElementById('pageDlKeyframe').classList.add('active');
    kfBootOnce();   // 视频关键帧导出首次切入时初始化
  } else if (name === '导演台') {
    document.getElementById('pageDirector').classList.add('active');
  } else if (name === '本地资源' || name === '本地资源-图片' || name === '本地资源-视频') {
    document.getElementById('pageDlLocal').classList.add('active');
    localBootOnce(); // 本地资源首次切入时初始化
    if (window.localSwitchKind) {
      window.localSwitchKind(name === '本地资源-视频' ? 'video' : 'image', { autoPick: true });
    }
  } else if (name === 'Flux3 视频生成') {
    document.getElementById('pageFlux3Video').classList.add('active');
  } else if (name === '提示词指南') {
    document.getElementById('pagePromptGuide').classList.add('active');
  } else if (name === '测试UI') {
    document.getElementById('pageTestUI').classList.add('active');
    if (!window.testUiLoader) {
      window.testUiLoader = new MediaLoader(document.getElementById('testUiMediaLoader'), {
        imageMax: 9, videoMax: 3, audioMax: 3, storageKey: 'test_ui_default',
        onChange: function(files) { renderTestUiNodePreview(files); },
        onPreview: function(files) {
          renderTestUiNodePreview(files);
          // _renderCounts 必定触发 onPreview，覆盖 refresh/删除/清空/预设等所有路径
          if (window.updateTestUiUploadBtn) window.updateTestUiUploadBtn();
        }
      });
      bindTestUiNodeCopy();
      bindTestUiUpload();
      renderTestUiNodePreview(window.testUiLoader.getFiles());
    }

  } else if (MODULES[name]) {
    fillModule(name);
    document.getElementById('pageModule').classList.add('active');
  } else {
    // 页面尚未接入：展示占位页，避免点击无响应/卡死
    const ph = document.getElementById('pagePlaceholder');
    if (ph) {
      ph.classList.add('active');
      const t = document.getElementById('phTitle');
      const d = document.getElementById('phDesc');
      if (t) t.textContent = name + '（功能建设中）';
      if (d) d.textContent = '该模块页面尚未接入，点击左侧其他功能可继续使用。';
    }
  }
  // 切换页面后，让右侧 RunningHub 指南面板顶部与左侧第一个卡片顶部对齐
  alignPreviewColumn(document.querySelector('.page.active'));
}
function gotoPage(name) {
  // 清除旧高亮和展开状态
  document.querySelectorAll('.nav-item.active, .flyout-item.active').forEach(el => el.classList.remove('active'));
  closeAllFlyouts();

  // 点亮当前叶子及所有祖先（逐级向上找「父级 flyout-wrap」，注意用 parentElement 上溯，
  // 不能直接 wrap.closest('.flyout-wrap')，因为 closest 会命中自身导致死循环）
  const leaf = document.querySelector('.nav-item[data-page="' + name + '"], .flyout-item[data-page="' + name + '"]');
  if (leaf) {
    leaf.classList.add('active');
    let wrap = leaf.closest('.flyout-wrap');
    while (wrap) {
      const trigger = wrap.querySelector(':scope > .nav-item, :scope > .flyout-item');
      if (trigger) trigger.classList.add('active');
      wrap = wrap.parentElement ? wrap.parentElement.closest('.flyout-wrap') : null;
    }
  }
  showPage(name);
}

function closeAllFlyouts() {
  document.querySelectorAll('.flyout-wrap.open').forEach(el => el.classList.remove('open'));
}

// ---- 多级 flyout 定位（fixed 视口坐标，确保弹窗永远浮在右侧内容之上） ----
function positionFlyoutPanel(panel) {
  const wrap = panel.parentElement;
  if (!wrap) return;
  const trigger = wrap.querySelector(':scope > .nav-item, :scope > .flyout-item');
  if (!trigger) return;
  const r = trigger.getBoundingClientRect();
  panel.style.left = (r.right + 6) + 'px';
  panel.style.top = (r.top - 4) + 'px';
}
function bindFlyoutPositioning() {
  document.querySelectorAll('.flyout-wrap').forEach(w => {
    const p = w.querySelector(':scope > .flyout-panel');
    if (p && !p.dataset.posBound) {
      p.dataset.posBound = '1';
      w.addEventListener('mouseenter', () => positionFlyoutPanel(p));
    }
  });
}
// 滚动或窗口变化时刷新已显示弹窗的位置（fixed 相对视口，滚动后需跟随 trigger）
function refreshVisibleFlyouts() {
  document.querySelectorAll('.flyout-panel').forEach(p => {
    if (getComputedStyle(p).display !== 'none') positionFlyoutPanel(p);
  });
}
window.addEventListener('scroll', refreshVisibleFlyouts, true);
window.addEventListener('resize', refreshVisibleFlyouts);
bindFlyoutPositioning();

// 让右侧 RunningHub 指南面板的**上边框**与左侧第一个生成配置卡片的**上边框**对齐。
// 关键：量位置时临时把 panel 改成 position: static，脱离 sticky 干扰（双 panel 页
// preview-column 足够高，sticky 会把 panel 钉在视口 top:24px，量到的 top 失真）。
// 再恢复 sticky。
function alignPreviewColumn(page) {
  if (!page) return;
  const formCol = page.querySelector('.form-column');
  const previewCol = page.querySelector('.preview-column');
  if (!formCol || !previewCol) {
    if (previewCol) { previewCol.style.top = ''; previewCol.style.marginTop = ''; }
    return;
  }
  const firstCard = formCol.querySelector('.card');
  const rightPanel = previewCol.querySelector('.panel');
  previewCol.style.marginTop = '';
  previewCol.style.top = '';
  previewCol.style.maxHeight = '';
  // 让右侧第一个面板顶部与左侧第一个生成配置卡片顶部对齐。
  // 计算时临时把面板改为 static，避免 sticky 干扰测量。
  if (firstCard && previewCol.querySelector('.panel')) {
    const rightPanel = previewCol.querySelector('.panel');
    const savedPos = rightPanel.style.position;
    const savedTop = rightPanel.style.top;
    rightPanel.style.position = 'static';
    rightPanel.style.top = 'auto';
    const cardTop = firstCard.getBoundingClientRect().top;
    const panelTop = rightPanel.getBoundingClientRect().top;
    rightPanel.style.position = savedPos;
    rightPanel.style.top = savedTop;
    const diff = cardTop - panelTop;
    previewCol.style.marginTop = diff + 'px';
  }
  // 让 RunningHub 指南面板的上下左右内边距与左侧生成配置卡片一致（20px），
  // 这样两个标题（card-title / panel-title）的顶边才会落在同一水平线上。
  if (rightPanel) {
    if (rightPanel.querySelector('.guide-list')) {
      rightPanel.style.padding = '20px';
    } else {
      rightPanel.style.padding = '';
    }
  }
}

// 统一用事件委托处理导航点击（更健壮，避免顶层逐个绑定时因异常而遗漏）
function handleNavClick(e) {
  // 1) 叶子（最终功能项，带 data-page）：优先判断，兼容嵌套在父级之下的场景
  const leaf = e.target.closest('.flyout-item[data-page], .nav-item[data-page]');
  if (leaf) {
    e.preventDefault();
    gotoPage(leaf.dataset.page);
    return;
  }
  // 2) 父级（带子菜单，无 data-page）：暂不支持点击事件，仅由 hover 展开，
  //    不切换页面也不切换 open 状态。
  const sub = e.target.closest('.flyout-item[data-submenu], .nav-item[data-submenu]');
  if (sub) {
    e.preventDefault();
    return;
  }
  // 3) 点击空白处：收起所有 flyout
  if (!e.target.closest('.flyout-wrap')) closeAllFlyouts();
}
document.addEventListener('click', handleNavClick);

// 鼠标移出整个侧边栏时收起所有弹出菜单（hover 由 CSS :hover 控制显隐，
// 这里只清理由点击留下的 .open 状态，确保「移出去二级分类就消失」）
const _sideNav = document.querySelector('.sidebar');
if (_sideNav) _sideNav.addEventListener('mouseleave', closeAllFlyouts);

// 窗口大小变化时重新对齐当前页面的 preview-column
window.addEventListener('resize', () => alignPreviewColumn(document.querySelector('.page.active')));

updateSummary();

// ============================================================
//  历史记录通用存储（localStorage）+ 字符串工具
// ============================================================
// ============================================================
//  历史记录通用存储（localStorage）
// ============================================================
function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}
function saveList(key, list) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try { localStorage.setItem(key, JSON.stringify(list)); return; }
    catch (e) {
      if (list.length <= 1) return;
      list = list.slice(0, list.length - 1); // 配额不足时丢弃最旧记录后重试
    }
  }
}
function formatTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function histHTML(list) {
  return '<div class="nav-sub-title">历史记录</div>' + list.map(r =>
    `<div class="hist-item" data-id="${r.id}" title="${escapeHtml(r.title)}">
      <span class="hist-title">${escapeHtml(r.title)}</span>
      <span class="hist-time">${formatTime(r.ts)}</span>
      <button class="hist-del" type="button" title="删除记录">×</button>
    </div>`).join('');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function truncateText(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const API = { config: '/api/config' };
let rhTimeoutMin = 60; // 单任务轮询超时（分钟），取自 /api/config 的 rhTimeout，与后端 worker 一致

// ---- 设置弹窗：配置 RunningHub API Key ----
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsSave = document.getElementById('settingsSave');
const settingsClose = document.getElementById('settingsClose');
const settingsCancel = document.getElementById('settingsCancel');

async function openSettings() {
  settingsRhErr.textContent = '';
  settingsRhKeyInput.value = '';
  if (settingsDyCookie) settingsDyCookie.value = '';
  if (settingsXhsCookie) settingsXhsCookie.value = '';
  settingsModal.hidden = false;
  // 抽屉从右侧滑入：display 生效后再下一帧加 .open 触发过渡
  requestAnimationFrame(() => settingsModal.classList.add('open'));
  try {
    const r = await fetch(API.config);
    const d = await r.json();
    if (d.rhKey) settingsRhKeyInput.value = d.rhKey;
    settingsRhConc.value = (d.rhConcurrency && d.rhConcurrency >= 1) ? d.rhConcurrency : 1;
    if (settingsRhTimeout) settingsRhTimeout.value = String(d.rhTimeout || 60);
    if (d.rhTimeout) rhTimeoutMin = d.rhTimeout;
    // 抖音/小红书 Cookie（去水印下载）：明文回填，自动带入已保存的抖音 Cookie
    if (settingsDyCookie && d.dyCookie) settingsDyCookie.value = d.dyCookie;
    if (settingsXhsCookie && d.xhsCookie) settingsXhsCookie.value = d.xhsCookie;
  } catch (e) { /* 保持空输入 */ }
}
function closeSettings() {
  settingsModal.classList.remove('open');
  // 等过渡结束再 hidden，避免抽屉回弹闪烁
  setTimeout(() => { if (!settingsModal.classList.contains('open')) settingsModal.hidden = true; }, 320);
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsCancel.addEventListener('click', closeSettings);
settingsModal.querySelector('.modal-overlay').addEventListener('click', closeSettings);

settingsSave.addEventListener('click', async () => {
  settingsRhErr.textContent = '';
  const payload = {};
  const rhKey = settingsRhKeyInput.value.trim();
  if (rhKey) payload.rhKey = rhKey;
  const rhConc = parseInt(settingsRhConc.value, 10);
  if (rhConc >= 1) payload.rhConcurrency = rhConc;
  if (settingsRhTimeout) {
    const tm = parseInt(settingsRhTimeout.value, 10);
    if (tm >= 20) payload.rhTimeout = tm;
  }
  // 抖音/小红书 Cookie（去水印下载）：仅在填写时提交；留空表示保持已有配置
  if (settingsDyCookie && settingsDyCookie.value.trim()) payload.dyCookie = settingsDyCookie.value.trim();
  if (settingsXhsCookie && settingsXhsCookie.value.trim()) payload.xhsCookie = settingsXhsCookie.value.trim();
  settingsSave.disabled = true; settingsSave.textContent = '保存中…';
  try {
    const r = await fetch(API.config, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.rhTimeout) rhTimeoutMin = d.rhTimeout;
    if (d.rhKey) hasRh = true;
    renderRhStatus();
    closeSettings();
  } catch (e) { settingsRhErr.textContent = '网络错误：' + e.message; }
  finally { settingsSave.disabled = false; settingsSave.textContent = '保存'; }
});


// ============================================================
//  短剧数字资产 · 文生图（RunningHub 工作流 API）
// ============================================================
const settingsRhKeyInput = document.getElementById('settingsRhKey');
const settingsRhErr = document.getElementById('settingsRhErr');
const settingsRhConc = document.getElementById('settingsRhConc');
const settingsRhTimeout = document.getElementById('settingsRhTimeout');
const settingsDyCookie = document.getElementById('settingsDyCookie');
const settingsXhsCookie = document.getElementById('settingsXhsCookie');
const rhNotice = document.getElementById('rhNotice');
const rhNoticeTitle = document.getElementById('rhNoticeTitle');
const rhNoticeDesc = document.getElementById('rhNoticeDesc');
const rhGuidePanel = document.getElementById('rhGuidePanel');
const rhGoSettingsBtn = document.getElementById('rhGoSettingsBtn');
const t2iPrompt = document.getElementById('t2iPrompt');
const t2iRatio = document.getElementById('t2iRatio');
const t2iScale = document.getElementById('t2iScale');
const t2iCount = document.getElementById('t2iCount');
const t2iBtn = document.getElementById('t2iBtn');
const t2iResultCard = document.getElementById('t2iResultCard');
const t2iMeta = document.getElementById('t2iMeta');
const t2iItems = document.getElementById('t2iItems');
const t2iSaveSel = document.getElementById('t2iSaveSel');
const t2iPickDir = document.getElementById('t2iPickDir');
const t2iClear = document.getElementById('t2iClear');
// ---- 动漫转真人（与 t2i 共用选中集/目录，按钮须在 updateDirLabel 等立即调用之前声明）----
const a2rSaveSel = document.getElementById('a2rSaveSel');
const a2rPickDir = document.getElementById('a2rPickDir');

// ---- 图片洗稿（上传真实人像 → 重绘风格；镜像 a2r，复用 t2i 结果渲染）----
const irFile = document.getElementById('irFile');
const irUpload = document.getElementById('irUpload');
const irPreviewWrap = document.getElementById('irPreviewWrap');
const irPreview = document.getElementById('irPreview');
const irFileName = document.getElementById('irFileName');
const irRePick = document.getElementById('irRePick');
const irRatio = document.getElementById('irRatio');
const irScale = document.getElementById('irScale');
const irCount = document.getElementById('irCount');
const irBtn = document.getElementById('irBtn');
const irResultCard = document.getElementById('irResultCard');
const irMeta = document.getElementById('irMeta');
const irItems = document.getElementById('irItems');
const irSaveSel = document.getElementById('irSaveSel');
const irPickDir = document.getElementById('irPickDir');
const irClear = document.getElementById('irClear');
const irRecover = document.getElementById('irRecover');
let irFileDataUrl = '';
let irTasks = [];
const IR_STORE_KEY = 'ir_history_v1';

// ---- 人像摄影（输入提示词 → 文生图风格人像；镜像图片洗稿，去掉上传图片）----
const prPrompt = document.getElementById('prPrompt');
const prRatio = document.getElementById('prRatio');
const prScale = document.getElementById('prScale');
const prCount = document.getElementById('prCount');
const prBtn = document.getElementById('prBtn');
const prResultCard = document.getElementById('prResultCard');
const prMeta = document.getElementById('prMeta');
const prItems = document.getElementById('prItems');
const prSaveSel = document.getElementById('prSaveSel');
const prPickDir = document.getElementById('prPickDir');
const prClear = document.getElementById('prClear');
const prRecover = document.getElementById('prRecover');
let prTasks = [];
const PR_STORE_KEY = 'pr_history_v1';

// ---- 修脸磨皮 ----
const faceFileInput = document.getElementById('faceFileInput');
const faceUpload = document.getElementById('faceUpload');
const facePreviewWrap = document.getElementById('facePreviewWrap');
const facePreview = document.getElementById('facePreview');
const faceFileName = document.getElementById('faceFileName');
const faceRePick = document.getElementById('faceRePick');
const faceBtn = document.getElementById('faceBtn');
const faceResultCard = document.getElementById('faceResultCard');
const faceMeta = document.getElementById('faceMeta');
const faceItems = document.getElementById('faceItems');
const faceSaveSel = document.getElementById('faceSaveSel');
const facePickDir = document.getElementById('facePickDir');
const faceClear = document.getElementById('faceClear');

let faceFile = null;          // 当前选中的待修脸图片 File
let faceTasks = [];           // 修脸结果模型（newest-first，本地持久化）
let faceSelected = new Set(); // 勾选集合
let faceImages = [];          // 聚合图片数组（灯箱 / 方向键用）
const FACE_STORE_KEY = 'face_history_v1';

// ---- 高清放大 ----
const hdFileInput = document.getElementById('hdFileInput');
const hdUpload = document.getElementById('hdUpload');
const hdPreviewWrap = document.getElementById('hdPreviewWrap');
const hdPreview = document.getElementById('hdPreview');
const hdFileName = document.getElementById('hdFileName');
const hdRePick = document.getElementById('hdRePick');
const hdBtn = document.getElementById('hdBtn');
const hdResultCard = document.getElementById('hdResultCard');
const hdMeta = document.getElementById('hdMeta');
const hdItems = document.getElementById('hdItems');
const hdSaveSel = document.getElementById('hdSaveSel');
const hdPickDir = document.getElementById('hdPickDir');
const hdClear = document.getElementById('hdClear');

let hdFile = null;            // 当前选中的待放大图片 File
let hdTasks = [];             // 高清结果模型（newest-first，本地持久化）
let hdSelected = new Set();   // 勾选集合
let hdImages = [];            // 聚合图片数组（灯箱 / 方向键用）
const HD_STORE_KEY = 'hd_history_v1';

// ---- 文生视频 ----
const mvPrompt = document.getElementById('mvPrompt');
const mvDuration = document.getElementById('mvDuration');
const mvRatio = document.getElementById('mvRatio');
const mvScale = document.getElementById('mvScale');
const mvBtn = document.getElementById('mvBtn');
const mvResultCard = document.getElementById('mvResultCard');
const mvMeta = document.getElementById('mvMeta');
const mvItems = document.getElementById('mvItems');
const mvSaveSel = document.getElementById('mvSaveSel');
const mvPickDir = document.getElementById('mvPickDir');
const mvClear = document.getElementById('mvClear');
const mvLightbox = document.getElementById('mvLightbox');
const mvLbVideo = document.getElementById('mvLbVideo');
const mvLbPlay = document.getElementById('mvLbPlay');
const mvLbPlayIcon = document.getElementById('mvLbPlayIcon');
const mvLbClose = document.getElementById('mvLbClose');

// ---- 视频编辑替换 ----
const vrFileInput = document.getElementById('vrFileInput');
const vrGrid = document.getElementById('vrGrid');
const vrVideoFileInput = document.getElementById('vrVideoFileInput');
const vrVideoUpload = document.getElementById('vrVideoUpload');
const vrVideoPreviewWrap = document.getElementById('vrVideoPreviewWrap');
const vrVideoPreview = document.getElementById('vrVideoPreview');
const vrVideoFileName = document.getElementById('vrVideoFileName');
const vrVideoDuration = document.getElementById('vrVideoDuration');
const vrVideoRePick = document.getElementById('vrVideoRePick');
const vrPrompt = document.getElementById('vrPrompt');
const vrMaxSide = document.getElementById('vrMaxSide');
const vrDuration = document.getElementById('vrDuration');
const vrBtn = document.getElementById('vrBtn');
const vrResultCard = document.getElementById('vrResultCard');
const vrMeta = document.getElementById('vrMeta');
const vrItems = document.getElementById('vrItems');
const vrSaveSel = document.getElementById('vrSaveSel');
const vrPickDir = document.getElementById('vrPickDir');
const vrClear = document.getElementById('vrClear');
let vrFiles = [];    // 已选参考图 File（最多 1 张）
let vrVideoFile = null;
let vrVideoDurationSec = 0;

// ---- 音乐MV生成 ----
const mmvFileInput = document.getElementById('mmvFileInput');
const mmvGrid = document.getElementById('mmvGrid');
const mmvAudioFileInput = document.getElementById('mmvAudioFileInput');
const mmvAudioUpload = document.getElementById('mmvAudioUpload');
const mmvAudioPreviewWrap = document.getElementById('mmvAudioPreviewWrap');
const mmvAudioPreview = document.getElementById('mmvAudioPreview');
const mmvAudioFileName = document.getElementById('mmvAudioFileName');
const mmvAudioRePick = document.getElementById('mmvAudioRePick');
const mmvPrompt = document.getElementById('mmvPrompt');
const mmvStartTime = document.getElementById('mmvStartTime');
const mmvEndTime = document.getElementById('mmvEndTime');
const mmvMaxSide = document.getElementById('mmvMaxSide');
const mmvRatio = document.getElementById('mmvRatio');
const mmvScale = document.getElementById('mmvScale');
const mmvBtn = document.getElementById('mmvBtn');
const mmvResultCard = document.getElementById('mmvResultCard');
const mmvMeta = document.getElementById('mmvMeta');
const mmvItems = document.getElementById('mmvItems');
const mmvSaveSel = document.getElementById('mmvSaveSel');
const mmvPickDir = document.getElementById('mmvPickDir');
const mmvClear = document.getElementById('mmvClear');
let mmvFiles = [];    // 已选参考图 File（最多 2 张）

// ---- 对话音频图片生视频 ----
const davImage1FileInput = document.getElementById('davImage1FileInput');
const davImage1Upload = document.getElementById('davImage1Upload');
const davImage1PreviewWrap = document.getElementById('davImage1PreviewWrap');
const davImage1Preview = document.getElementById('davImage1Preview');
const davImage1FileName = document.getElementById('davImage1FileName');
const davImage1RePick = document.getElementById('davImage1RePick');
const davImage2FileInput = document.getElementById('davImage2FileInput');
const davImage2Upload = document.getElementById('davImage2Upload');
const davImage2PreviewWrap = document.getElementById('davImage2PreviewWrap');
const davImage2Preview = document.getElementById('davImage2Preview');
const davImage2FileName = document.getElementById('davImage2FileName');
const davImage2RePick = document.getElementById('davImage2RePick');
const davAudio1FileInput = document.getElementById('davAudio1FileInput');
const davAudio1Upload = document.getElementById('davAudio1Upload');
const davAudio1PreviewWrap = document.getElementById('davAudio1PreviewWrap');
const davAudio1Preview = document.getElementById('davAudio1Preview');
const davAudio1FileName = document.getElementById('davAudio1FileName');
const davAudio1RePick = document.getElementById('davAudio1RePick');
const davAudio2FileInput = document.getElementById('davAudio2FileInput');
const davAudio2Upload = document.getElementById('davAudio2Upload');
const davAudio2PreviewWrap = document.getElementById('davAudio2PreviewWrap');
const davAudio2Preview = document.getElementById('davAudio2Preview');
const davAudio2FileName = document.getElementById('davAudio2FileName');
const davAudio2RePick = document.getElementById('davAudio2RePick');
const davPrompt = document.getElementById('davPrompt');
const davMaxSide = document.getElementById('davMaxSide');
const davRatio = document.getElementById('davRatio');
const davScale = document.getElementById('davScale');
const davBtn = document.getElementById('davBtn');
const davResultCard = document.getElementById('davResultCard');
const davMeta = document.getElementById('davMeta');
const davItems = document.getElementById('davItems');
const davSaveSel = document.getElementById('davSaveSel');
const davPickDir = document.getElementById('davPickDir');
const davClear = document.getElementById('davClear');
const davRefPrompt = document.getElementById('davRefPrompt');
const davRefPromptCopy = document.getElementById('davRefPromptCopy');
let davImage1File = null;
let davImage2File = null;
let davAudio1File = null;
let davAudio2File = null;
let davAudio1Url = null;
let davAudio2Url = null;
let mmvAudioFile = null;
let mmvAudioUrl = null;

// 对话音频图片生视频参考提示词：一键复制
if (davRefPromptCopy) {
  davRefPromptCopy.addEventListener('click', async () => {
    const text = (davRefPrompt && davRefPrompt.textContent || '').trim();
    if (!text) { showToast('暂无可复制的提示词', 'error'); return; }
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) {}
      ta.remove();
    }
    davRefPromptCopy.classList.add('copied');
    davRefPromptCopy.textContent = '已复制 ✓';
    setTimeout(() => {
      davRefPromptCopy.classList.remove('copied');
      davRefPromptCopy.textContent = '复制提示词';
    }, 1500);
  });
}

// 生成时长实时自适应：提交前（change 事件，避免输入过程中误截断）将 <4 归 4、>15 归 15
mvDuration.addEventListener('change', () => {
  let v = parseInt(mvDuration.value, 10);
  if (isNaN(v)) v = 5;                 // 清空/非法 → 回到默认值 5
  else if (v < 4) v = 4;               // 低于下限自适应为 4
  else if (v > 15) v = 15;             // 高于上限自适应为 15
  mvDuration.value = v;
});


// 视频编辑替换：最长边 768-1536 且为 8 的倍数；失焦/change 后自动修正
function normalizeVrMaxSide(v) {
  let n = parseInt(v, 10);
  if (isNaN(n)) n = 1024;
  n = Math.max(768, Math.min(1536, n));
  n = Math.round(n / 8) * 8;
  return Math.max(768, Math.min(1536, n));
}
if (vrMaxSide) vrMaxSide.addEventListener('blur', () => { vrMaxSide.value = normalizeVrMaxSide(vrMaxSide.value); });
if (vrMaxSide) vrMaxSide.addEventListener('change', () => { vrMaxSide.value = normalizeVrMaxSide(vrMaxSide.value); });
if (vrDuration) vrDuration.addEventListener('change', () => {
  let v = parseInt(vrDuration.value, 10);
  if (isNaN(v)) v = 5;
  else if (v < 4) v = 4;
  else if (v > 15) v = 15;
  vrDuration.value = v;
});
function renderVrRefGrid() {
  if (!vrGrid) return;
  vrGrid.innerHTML = '';
  vrFiles.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'mr-thumb';
    const img = document.createElement('img');
    img.src = f._url || (f._url = URL.createObjectURL(f));
    img.alt = '参考图 ' + (i + 1);
    card.appendChild(img);
    const tag = document.createElement('div');
    tag.className = 'mr-thumb-tag';
    tag.textContent = '参考' + (i + 1);
    card.appendChild(tag);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'mr-thumb-del'; del.textContent = '×';
    del.addEventListener('click', () => {
      vrFiles.splice(i, 1);
      renderVrRefGrid();
    });
    card.appendChild(del);
    vrGrid.appendChild(card);
  });
  if (vrFiles.length < 1) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'mr-add'; add.setAttribute('aria-label', '添加参考图');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M12 6v12M6 12h12" stroke="#0052D9" stroke-width="1.8" stroke-linecap="round"/></svg><span>添加参考图</span>';
    add.addEventListener('click', () => vrFileInput.click());
    vrGrid.appendChild(add);
  }
}

function vrHandleFiles(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    if (vrFiles.length >= 1) break;
    if (!f.type.startsWith('image/')) { showToast('请选择图片文件'); continue; }
    vrFiles.push(f);
  }
  if (vrFileInput) vrFileInput.value = '';
  renderVrRefGrid();
}

if (vrFileInput) {
  vrFileInput.addEventListener('change', () => { vrHandleFiles(vrFileInput.files); });
}

function setVrVideoFile(f) {
  if (!f || !f.type.startsWith('video/')) { showToast('请选择视频文件', 'error'); return; }
  vrVideoFile = f;
  vrVideoDurationSec = 0;
  if (vrVideoPreview.src) URL.revokeObjectURL(vrVideoPreview.src);
  const url = URL.createObjectURL(f);
  vrVideoPreview.src = url;
  vrVideoPreviewWrap.hidden = false;
  vrVideoUpload.hidden = true;
  vrVideoFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  vrVideoDuration.textContent = '';
  const onMeta = () => {
    const d = vrVideoPreview.duration;
    if (d && isFinite(d)) {
      vrVideoDurationSec = d;
      vrVideoDuration.textContent = '时长 ' + d.toFixed(2) + ' 秒';
    }
    vrVideoPreview.removeEventListener('loadedmetadata', onMeta);
  };
  vrVideoPreview.addEventListener('loadedmetadata', onMeta);
}
if (vrVideoFileInput) vrVideoFileInput.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) setVrVideoFile(e.target.files[0]); });
if (vrVideoUpload) {
  vrVideoUpload.addEventListener('click', () => { if (vrVideoFileInput) vrVideoFileInput.click(); });
  vrVideoUpload.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (vrVideoFileInput) vrVideoFileInput.click(); } });
  ['dragover','dragenter'].forEach(ev => vrVideoUpload.addEventListener(ev, (e) => { e.preventDefault(); vrVideoUpload.style.borderColor = '#0052D9'; }));
  ['dragleave','drop'].forEach(ev => vrVideoUpload.addEventListener(ev, (e) => { e.preventDefault(); vrVideoUpload.style.borderColor = ''; }));
  vrVideoUpload.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setVrVideoFile(f); });
}
if (vrVideoRePick) vrVideoRePick.addEventListener('click', () => { if (vrVideoFileInput) vrVideoFileInput.click(); });

// ---- 扩图 ----
const exFileInput = document.getElementById('exFileInput');
const exUpload = document.getElementById('exUpload');
const exPreviewWrap = document.getElementById('exPreviewWrap');
const exPreview = document.getElementById('exPreview');
const exFileName = document.getElementById('exFileName');
const exRePick = document.getElementById('exRePick');
const exLeft = document.getElementById('exLeft');
const exTop = document.getElementById('exTop');
const exRight = document.getElementById('exRight');
const exBottom = document.getElementById('exBottom');
const exBtn = document.getElementById('exBtn');
const exResultCard = document.getElementById('exResultCard');
const exMeta = document.getElementById('exMeta');
const exItems = document.getElementById('exItems');
const exSaveSel = document.getElementById('exSaveSel');
const exPickDir = document.getElementById('exPickDir');
const exClear = document.getElementById('exClear');

let exFile = null;             // 当前选中的待扩图 File
let exTasks = [];              // 结果模型（newest-first，本地持久化）
let exSelected = new Set();    // 勾选集合
let exImages = [];             // 聚合图片数组（灯箱 / 方向键用）
const EX_STORE_KEY = 'ex_history_v1';

// ---- 姿势迁移（图片编辑 · 三级分类）----
const posePersonInput = document.getElementById('posePersonInput');
const posePersonUp = document.getElementById('posePersonUp');
const posePersonWrap = document.getElementById('posePersonWrap');
const posePersonPrev = document.getElementById('posePersonPrev');
const posePersonName = document.getElementById('posePersonName');
const posePersonRePick = document.getElementById('posePersonRePick');
const poseRefInput = document.getElementById('poseRefInput');
const poseRefUp = document.getElementById('poseRefUp');
const poseRefWrap = document.getElementById('poseRefWrap');
const poseRefPrev = document.getElementById('poseRefPrev');
const poseRefName = document.getElementById('poseRefName');
const poseRefRePick = document.getElementById('poseRefRePick');
const poseBtn = document.getElementById('poseBtn');
const poseResultCard = document.getElementById('poseResultCard');
const poseMeta = document.getElementById('poseMeta');
const poseItems = document.getElementById('poseItems');
const poseSaveSel = document.getElementById('poseSaveSel');
const posePickDir = document.getElementById('posePickDir');
const poseClear = document.getElementById('poseClear');

let posePerson = null;         // 人物图片 File
let poseRef = null;            // 姿势参考图 File
let poseTasks = [];            // 结果模型（newest-first，本地持久化）
let poseSelected = new Set();  // 勾选集合
let poseImages = [];           // 聚合图片数组（灯箱 / 方向键用）
const POSE_STORE_KEY = 'pose_history_v1';
// ---- 换脸（图片编辑 · 三级分类）----
const fsPersonInput = document.getElementById('fsPersonInput');
const fsPersonUp = document.getElementById('fsPersonUp');
const fsPersonWrap = document.getElementById('fsPersonWrap');
const fsPersonPrev = document.getElementById('fsPersonPrev');
const fsPersonName = document.getElementById('fsPersonName');
const fsPersonRePick = document.getElementById('fsPersonRePick');
const fsFaceInput = document.getElementById('fsFaceInput');
const fsFaceUp = document.getElementById('fsFaceUp');
const fsFaceWrap = document.getElementById('fsFaceWrap');
const fsFacePrev = document.getElementById('fsFacePrev');
const fsFaceName = document.getElementById('fsFaceName');
const fsFaceRePick = document.getElementById('fsFaceRePick');
const fsBtn = document.getElementById('fsBtn');
const fsResultCard = document.getElementById('fsResultCard');
const fsMeta = document.getElementById('fsMeta');
const fsItems = document.getElementById('fsItems');
const fsSaveSel = document.getElementById('fsSaveSel');
const fsPickDir = document.getElementById('fsPickDir');
const fsClear = document.getElementById('fsClear');

let fsPerson = null;           // 人物图片 File
let fsFace = null;             // 人脸图片 File
let fsTasks = [];              // 结果模型（newest-first，本地持久化）
let fsSelected = new Set();    // 勾选集合
let fsImages = [];             // 聚合图片数组（灯箱 / 方向键用）
const FS_STORE_KEY = 'faceswap_history_v1';

// ---- 音色克隆（声音生成 · 二级分类）----
const vcAudioInput = document.getElementById('vcAudioInput');
const vcAudioUp = document.getElementById('vcAudioUp');
const vcAudioWrap = document.getElementById('vcAudioWrap');
const vcAudioPrev = document.getElementById('vcAudioPrev');
const vcAudioName = document.getElementById('vcAudioName');
const vcAudioRePick = document.getElementById('vcAudioRePick');
const vcText = document.getElementById('vcText');
const vcTextTip = document.getElementById('vcTextTip');
const vcBtn = document.getElementById('vcBtn');
const vcResultCard = document.getElementById('vcResultCard');
const vcMeta = document.getElementById('vcMeta');
const vcItems = document.getElementById('vcItems');
const vcSaveSel = document.getElementById('vcSaveSel');
const vcPickDir = document.getElementById('vcPickDir');
const vcClear = document.getElementById('vcClear');

let vcAudio = null;            // 待克隆的音频 File
let vcTasks = [];              // 结果模型（newest-first，本地持久化）
let vcSelected = new Set();    // 勾选集合
let vcImages = [];             // 音频 URL 聚合（批量下载 / 顺序播放用）
const VC_STORE_KEY = 'voiceclone_history_v1';
const VC_MAX_TEXT = 2000;

// ---- 三人对话（声音生成 · 二级分类）----
const tdAud1Input = document.getElementById('tdAud1Input');
const tdAud1Up = document.getElementById('tdAud1Up');
const tdAud1Wrap = document.getElementById('tdAud1Wrap');
const tdAud1Prev = document.getElementById('tdAud1Prev');
const tdAud1Name = document.getElementById('tdAud1Name');
const tdAud1RePick = document.getElementById('tdAud1RePick');
const tdAud2Input = document.getElementById('tdAud2Input');
const tdAud2Up = document.getElementById('tdAud2Up');
const tdAud2Wrap = document.getElementById('tdAud2Wrap');
const tdAud2Prev = document.getElementById('tdAud2Prev');
const tdAud2Name = document.getElementById('tdAud2Name');
const tdAud2RePick = document.getElementById('tdAud2RePick');
const tdAud3Input = document.getElementById('tdAud3Input');
const tdAud3Up = document.getElementById('tdAud3Up');
const tdAud3Wrap = document.getElementById('tdAud3Wrap');
const tdAud3Prev = document.getElementById('tdAud3Prev');
const tdAud3Name = document.getElementById('tdAud3Name');
const tdAud3RePick = document.getElementById('tdAud3RePick');
const tdText = document.getElementById('tdText');
const tdTextTip = document.getElementById('tdTextTip');
const tdFormatSummary = document.getElementById('tdFormatSummary');
const tdFormatErrs = document.getElementById('tdFormatErrs');
const tdFormatHelp = document.getElementById('tdFormatHelp');
const tdFormatBar = document.querySelector('#pageTriDialogue .td-format-bar');
const tdBtn = document.getElementById('tdBtn');
const tdResultCard = document.getElementById('tdResultCard');
const tdMeta = document.getElementById('tdMeta');
const tdItems = document.getElementById('tdItems');
const tdSaveSel = document.getElementById('tdSaveSel');
const tdPickDir = document.getElementById('tdPickDir');
const tdClear = document.getElementById('tdClear');

let tdAud1 = null;             // 角色1 音频 File
let tdAud2 = null;             // 角色2 音频 File
let tdAud3 = null;             // 角色3 音频 File
let tdTasks = [];              // 结果模型（newest-first，本地持久化）
let tdSelected = new Set();    // 勾选集合
let tdImages = [];             // 音频 URL 聚合
const TD_STORE_KEY = 'tridialogue_history_v1';
const TD_MAX_TEXT = 8000;

// ---- 双人对话（声音生成 · 二级分类）----
const pdAud1Input = document.getElementById('pdAud1Input');
const pdAud1Up = document.getElementById('pdAud1Up');
const pdAud1Wrap = document.getElementById('pdAud1Wrap');
const pdAud1Prev = document.getElementById('pdAud1Prev');
const pdAud1Name = document.getElementById('pdAud1Name');
const pdAud1RePick = document.getElementById('pdAud1RePick');
const pdAud2Input = document.getElementById('pdAud2Input');
const pdAud2Up = document.getElementById('pdAud2Up');
const pdAud2Wrap = document.getElementById('pdAud2Wrap');
const pdAud2Prev = document.getElementById('pdAud2Prev');
const pdAud2Name = document.getElementById('pdAud2Name');
const pdAud2RePick = document.getElementById('pdAud2RePick');
const pdText = document.getElementById('pdText');
const pdTextTip = document.getElementById('pdTextTip');
const pdFormatSummary = document.getElementById('pdFormatSummary');
const pdFormatErrs = document.getElementById('pdFormatErrs');
const pdFormatHelp = document.getElementById('pdFormatHelp');
const pdFormatBar = document.querySelector('#pagePairDialogue .td-format-bar');  // 限定双人对话页面内的格式条
const pdBtn = document.getElementById('pdBtn');
const pdResultCard = document.getElementById('pdResultCard');
const pdMeta = document.getElementById('pdMeta');
const pdItems = document.getElementById('pdItems');
const pdSaveSel = document.getElementById('pdSaveSel');
const pdPickDir = document.getElementById('pdPickDir');
const pdClear = document.getElementById('pdClear');

let pdAud1 = null;             // 角色1 音频 File
let pdAud2 = null;             // 角色2 音频 File
let pdTasks = [];              // 结果模型（newest-first，本地持久化）
let pdSelected = new Set();    // 勾选集合
let pdImages = [];             // 音频 URL 聚合
const PD_STORE_KEY = 'pairdialogue_history_v1';
const PD_MAX_TEXT = 8000;
const PD_ROLE_SLOTS = [
  { input: pdAud1Input, up: pdAud1Up, wrap: pdAud1Wrap, prev: pdAud1Prev, name: pdAud1Name, rePick: pdAud1RePick, setFile: (f) => { pdAud1 = f; } },
  { input: pdAud2Input, up: pdAud2Up, wrap: pdAud2Wrap, prev: pdAud2Prev, name: pdAud2Name, rePick: pdAud2RePick, setFile: (f) => { pdAud2 = f; } },
];

// ---- 方言克隆（声音生成 · 二级分类）----
const dcTextArea = document.getElementById('dcTextArea');
const dcTextTip = document.getElementById('dcTextTip');
const dcParams = document.getElementById('dcParams');
const dcParamsSummary = document.getElementById('dcParamsSummary');
const dcBtn = document.getElementById('dcBtn');
const dcResultCard = document.getElementById('dcResultCard');
const dcMeta = document.getElementById('dcMeta');
const dcItems = document.getElementById('dcItems');
const dcSaveSel = document.getElementById('dcSaveSel');
const dcPickDir = document.getElementById('dcPickDir');
const dcClear = document.getElementById('dcClear');
const dcToneBtn = document.getElementById('dcToneBtn');
const dcToneModal = document.getElementById('dcToneModal');
const dcToneClose = document.getElementById('dcToneClose');
const dcToneDone = document.getElementById('dcToneDone');
const dcToneList = document.getElementById('dcToneList');
const dcDropdown = document.getElementById('dcDropdown');
const dcDropdownTitle = document.getElementById('dcDropdownTitle');
const dcDropdownList = document.getElementById('dcDropdownList');
const dcDropdownClose = document.getElementById('dcDropdownClose');

let dcTasks = [];              // 结果模型（newest-first，本地持久化）
let dcSelected = new Set();    // 勾选集合
let dcImages = [];             // 音频 URL 聚合
const DC_STORE_KEY = 'dialectclone_history_v1';
const DC_MAX_TEXT = 4000;

// 多选项（按截图 5 组；每组单选，存储 label）
const DC_PARAM_GROUPS = [
  { key: 'gender',   name: '性别',  options: ['男', '女'] },
  { key: 'age',      name: '年龄',  options: ['儿童', '少年', '青年', '中年', '老年'] },
  { key: 'dialect',  name: '方言',  options: ['四川话', '东北话', '陕西话', '河南话', '云南话', '贵州话', '甘肃话', '宁夏话', '石家庄话', '济南话', '青岛话', '桂林话'] },
  { key: 'tone',     name: '音调',  options: ['极低音调', '低音调', '中音调', '高音调', '极高音调'] },
  { key: 'style',    name: '风格',  options: ['耳语'] },
];
// 每组已选项（label 或 ''）；空字符串表示未选
let dcParamPicked = { gender: '', age: '', dialect: '', tone: '', style: '' };

// 语气词标签（按截图第二个 Markdown Note）
const DC_TONE_GROUPS = [
  { name: '基础语气', tags: [
    { tag: '[laughter]',                 label: '笑' },
    { tag: '[sigh]',                     label: '叹气' },
    { tag: '[sniff]',                    label: '吸鼻子' },
  ]},
  { name: '疑问语气', tags: [
    { tag: '[question-en]',              label: '疑问语气' },
    { tag: '[question-ah]',              label: '疑问语气' },
    { tag: '[question-oh]',              label: '疑问语气' },
  ]},
  { name: '惊讶语气', tags: [
    { tag: '[surprise-ah]',              label: '惊讶语气' },
    { tag: '[surprise-oh]',              label: '惊讶语气' },
    { tag: '[surprise-wa]',              label: '惊讶语气' },
    { tag: '[surprise-yo]',              label: '惊讶语气' },
  ]},
  { name: '情感', tags: [
    { tag: '[dissatisfaction-hnn]',      label: '不满' },
    { tag: '[confirmation-en]',          label: '确认' },
  ]},
];
// 单角色音频上传相关 DOM 集合（便于循环绑定）
const TD_ROLE_SLOTS = [
  { input: tdAud1Input, up: tdAud1Up, wrap: tdAud1Wrap, prev: tdAud1Prev, name: tdAud1Name, rePick: tdAud1RePick, setFile: (f) => { tdAud1 = f; } },
  { input: tdAud2Input, up: tdAud2Up, wrap: tdAud2Wrap, prev: tdAud2Prev, name: tdAud2Name, rePick: tdAud2RePick, setFile: (f) => { tdAud2 = f; } },
  { input: tdAud3Input, up: tdAud3Up, wrap: tdAud3Wrap, prev: tdAud3Prev, name: tdAud3Name, rePick: tdAud3RePick, setFile: (f) => { tdAud3 = f; } },
];


let mvTasks = [];             // 结果模型（newest-first，本地持久化）
let mvSelected = new Set();   // 勾选集合
let mvVideos = [];            // 聚合视频 URL 数组（批量下载用）
const MV_STORE_KEY = 'mv_history_v1';

let ffTasks = [];             // 首帧生视频：结果模型（newest-first，本地持久化）
let ffSelected = new Set();   // 首帧生视频：勾选集合
let ffVideos = [];            // 首帧生视频：聚合视频 URL 数组（批量下载用）
const FF_STORE_KEY = 'ff_history_v1';

// ---- 参考图生图 ----
const REF3_IMG_NODES = ['351', '352', '353'];   // 第 1~3 张参考图对应节点
const ref3FileInput = document.getElementById('ref3FileInput');
const ref3Grid = document.getElementById('ref3Grid');
const refPrompt = document.getElementById('refPrompt');
const refRatio = document.getElementById('refRatio');
const refScale = document.getElementById('refScale');
const refCount = document.getElementById('refCount');
const refBtn = document.getElementById('refBtn');
const refResultCard = document.getElementById('refResultCard');
const refMeta = document.getElementById('refMeta');
const refItems = document.getElementById('refItems');
const refSaveSel = document.getElementById('refSaveSel');
const refPickDir = document.getElementById('refPickDir');
const refClear = document.getElementById('refClear');

let refFiles = [];  // 参考图生图已选参考图 File（最多 3 张）
let refTasks = [];                  // 结果模型（newest-first，本地持久化）
let refSelected = new Set();        // 勾选集合
let refImages = [];                 // 聚合图片数组（灯箱 / 方向键用）
const REF_STORE_KEY = 'refimg_history_v1';

let hasRh = false;
let selectedImgs = new Set();
let t2iDirHandle = null;  // File System Access 目录句柄（批量下载落盘用）
let t2iImages = [];       // 当前文生图结果列表（灯箱/方向键用）
let t2iTasks = [];        // 文生图结果模型（单一数据源，newest-first），用于本地持久化与恢复

// 灯箱元素
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');
const lbCount = document.getElementById('lbCount');
const lbPrev = document.getElementById('lbPrev');
const lbNext = document.getElementById('lbNext');
const lbClose = document.getElementById('lbClose');
const lbTip = document.getElementById('lbTip');
const toast = document.getElementById('toast');
let lbIndex = 0;

if (rhGoSettingsBtn) rhGoSettingsBtn.addEventListener('click', openSettings);

function renderRhStatus() {
  rhNotice.hidden = hasRh;
}
async function checkRh() {
  try {
    const r = await fetch(API.config);
    const d = await r.json();
    hasRh = !!(d.rhKey);
  } catch (e) { hasRh = false; }
  renderRhStatus();
}

t2iBtn.addEventListener('click', async () => {
  const prompt = t2iPrompt.value.trim();
  if (!prompt) { t2iPrompt.focus(); t2iPrompt.style.borderColor = '#d93025'; return; }
  t2iPrompt.style.borderColor = '';
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const ratio = t2iRatio.value;
  const scale = Math.max(0.2, Math.min(2.0, parseFloat(t2iScale.value) || 0.5));
  const count = Math.max(1, Math.min(4, parseInt(t2iCount.value, 10) || 1));
  // 每次点击新增一组独立结果（多次点击 → 多个 Item 依次累加）
  const task = addT2iItem(prompt, ratio, scale, count);
  try {
    const r = await fetch('/api/rh-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ratio, scale, count })
    });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setItemStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistT2i();
      openSettings();
      return;
    }
    if (d.error) {
      setItemStatus(task, 'err', '提交失败：' + (d.message || '未知错误'));
      (task._persist || persistT2i)();
      return;
    }
    task.taskId = d.taskId;
    pollRhTask(task);
  } catch (e) {
    setItemStatus(task, 'err', '请求出错：' + e.message);
    (task._persist || persistT2i)();
  }
});

// 本地持久化：仅保存已完成 / 失败的最终结果（进行中的任务靠内存模型实时轮询，无需落盘）
const T2I_STORE_KEY = 't2i_history_v1';
function persistT2i() {
  const data = t2iTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({
      id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, ratio: t.ratio,
      scale: t.scale, count: t.count, images: t.images,
      status: t.status, statusText: t.statusText, ts: t.ts
    }));
  saveList(T2I_STORE_KEY, data);
}

// 由模型构建单个结果卡片 DOM（新增 / 恢复共用）
// 重要：删除按钮必须用 task._remove（默认 t2i.remove），否则 a2r 等其他类型调进来
// 会被覆盖成 t2i 的删除逻辑，导致"切页回来历史记录还在"。
function createT2iItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.prompt) + '</div>' +
        '<div class="t2i-result-sub">' + escapeHtml(task.ratio) + ' · ' + task.scale + '× · ' + task.count + ' 张 · ' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  if (!task._kind) task._kind = 't2i';
  if (!task._remove) task._remove = taskRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => task._remove(task));
  // 恢复最终结果（已完成则渲染图片，失败则显示错误）
  if (task.status === 'done') {
    setItemStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderT2iGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setItemStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setItemStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}

// 新增一组生成结果 Item，返回 task 对象供轮询更新（最新排在最上方）
function addT2iItem(prompt, ratio, scale, count) {
  t2iResultCard.hidden = false;
  const task = {
    id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, prompt, ratio, scale, count,
    images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  t2iTasks.unshift(task);                 // 最新在前
  t2iItems.prepend(createT2iItemEl(task)); // DOM 同样最新在上
  updateT2iMeta();
  persistT2i();
  task._kind = 't2i';
  task._remove = taskRemove;
  return task;
}

function setItemStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = (cls === 'ok') ? 'done' : (cls === 'err' ? 'err' : 'queued');
}

// 删除任务时同步取消后端队列任务（排队中的不再执行，其余任务序号自动前移）
async function cancelRhTask(task) {
  task.cancelled = true;   // 通知前端轮询循环立即退出
  if (!task.taskId) return;
  try {
    await fetch('/api/rh-task/' + task.taskId + '/cancel', { method: 'POST' });
  } catch (e) { /* 后端不可达时仅本地移除 */ }
}

function taskRemove(task) {
  cancelRhTask(task);
  const i = t2iTasks.indexOf(task);
  if (i >= 0) t2iTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateT2iMeta();
  rebuildT2iImages();
  persistT2i();
  if (!t2iTasks.length) t2iResultCard.hidden = true;
}

// 从本地存储恢复历史（仅在本会话尚未加载时进行，避免重复）
function restoreT2i() {
  const now = Date.now();
  const fresh = t2iTasks.length === 0;
  if (fresh) {
    const data = loadList(T2I_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(T2I_STORE_KEY, []); return; }  // 全部过期：清理缓存
    t2iTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    t2iResultCard.hidden = false;
    t2iItems.innerHTML = '';
    t2iTasks.forEach(task => t2iItems.appendChild(createT2iItemEl(task))); // t2iTasks 已 newest-first
    updateT2iMeta();
    rebuildT2iImages();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(t2iTasks, { setStatus: setItemStatus, renderGrid: renderT2iGrid, noun: '张', remove: taskRemove, poll: pollRhTask });
}

function updateT2iMeta() {
  const n = t2iItems ? t2iItems.children.length : 0;
  t2iMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}

// 由所有 Item 的图片重新聚合全局数组（灯箱 / 方向键用）
function rebuildT2iImages() {
  t2iImages = Array.from(t2iItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}

// 统一增强 RunningHub 错误提示：命中 414 / Unknown error / 未知错误 / TOKEN_INVALID 时，
// 追加「请查看 RunningHub 账户余额」的明确引导（414 多为余额不足或工作流不可用）。
// 若后端消息本身已含余额提示（_rh_submit_error 已写入），则不重复追加。
function enhanceRhError(msg) {
  if (!msg) return msg;
  const s = String(msg);
  if (/余额|RunningHub 控制台/.test(s)) return s;  // 后端已带提示，避免重复
  if (/414|Unknown error|未知错误|TOKEN_INVALID/i.test(s)) {
    return s + '（请前往 RunningHub 控制台查看账户余额，错误码 414 多为余额不足或工作流不可用）';
  }
  return s;
}

// 重新连接某个任务的 RunningHub 轮询（带防重入保护）。
// 切换分类 / 刷新页面后再回到本页时，用它把「仍在 RunningHub 跑」的任务重新挂上轮询，
// 即便前端此前因瞬时错误把它标记成了失败也不会丢结果。
// 通用：把「仍可能在 RunningHub 跑」的任务重新挂上轮询（切回页面 / 刷新后找回结果）。
// 已完成 -> 直接渲染；带 taskId 且未取消的「进行中 / 30 分钟内失败」-> 重新连接轮询；
// 明确「任务丢失」-> 保留手动从后台恢复入口；陈年失败 / 无 taskId -> 不再自动重连。
function reconnectRhTasks(tasks, opts) {
  const { setStatus, renderGrid, noun, remove, poll, recentMs = 30 * 60 * 1000 } = opts;
  tasks.forEach(t => {
    if (t.status === 'done') {
      const items = (t.images && t.images.length) ? t.images : (t.videos || []);
      setStatus(t, 'ok', t.statusText || ('生成完成 · ' + items.length + ' ' + noun));
      if (items.length) renderGrid(t, items);
      return;
    }
    if (t.cancelled) return;
    if (!t.taskId) {  // 提交阶段就失败的（无 taskId）无法找回
      if (t.status === 'err') setStatus(t, 'err', t.statusText || '生成失败');
      return;
    }
    if (t.status === 'err' && t.statusText && t.statusText.indexOf('任务丢失') >= 0) {
      setNotFoundRecovery(t, remove);
      return;
    }
    if (t.status === 'err' && (Date.now() - (t.ts || 0)) > recentMs) {
      setStatus(t, 'err', t.statusText || '生成失败');
      return;
    }
    if (!t._polling) setStatus(t, '', '正在重新连接 RunningHub…');
    attachRhPoll(t, poll);
  });
}

function attachRhPoll(task, pollFn) {
  if (!task || !task.taskId || task.cancelled || task._polling) return;
  (pollFn || pollRhTask)(task);
}

// 轮询 RunningHub 任务状态，实时反映该 Item 的排队 / 执行进度
async function pollRhTask(task) {
  if (task._polling) return;          // 防止重复轮询（切换分类/恢复时可能多次进入）
  task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000; // 按配置 rhTimeout 上限
  while (Date.now() < deadline) {
    if (task.cancelled) return;  // 已被删除：停止轮询
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      // 队列排名：第 (position+1) / 共 total 个任务
      setItemStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
      (task._persist || persistT2i)();   // 持续持久化进行中任务，防止切换/刷新丢失
    } else if (st.status === 'running') {
      setItemStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
      (task._persist || persistT2i)();   // 持续持久化进行中任务，防止切换/刷新丢失
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { taskRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      // textContent 显示，不需要 escapeHtml（之前误用导致 &quot; 残留）
      setItemStatus(task, 'err', '生成失败：' + enhanceRhError(em));
      (task._persist || persistT2i)();
      return;
    } else if (st.status === 'done') {
      setItemStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderT2iGrid(task, st.images || []);
      (task._persist || persistT2i)();
      return;
    }
  }
  setItemStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  (task._persist || persistT2i)();
  } finally {
    task._polling = false;
  }
}

function renderT2iGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '生成图片'; img.loading = 'lazy';
    // 传入当前 task.images，避免依赖全局 t2iImages（a2r/face 等其他类型的图片不在 t2iItems 里）
    img.addEventListener('click', () => openLightbox(url, task.images));
    box.appendChild(img);

    // 选择圆圈（hover 显示，点击打勾）
    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) selectedImgs.add(url); else selectedImgs.delete(url);
      const empty = selectedImgs.size === 0;
      t2iSaveSel.disabled = empty;
      if (a2rSaveSel) a2rSaveSel.disabled = empty;   // a2r 与 t2i 共用选中集
      if (irSaveSel) irSaveSel.disabled = empty;     // ir 与 t2i 共用选中集
    });
    box.appendChild(pick);

    // 单张下载图标（右下角）
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildT2iImages();
}

function genName(ext = '.png') {
  return 't2i_' + Date.now() + '_' + Math.floor(Math.random() * 1e4) + ext;
}

// 从 URL 推断文件扩展名（忽略查询串），仅保留常见图片/视频格式；无法识别返回 ''
function extFromUrl(url) {
  try {
    const path = String(url).split('?')[0].split('#')[0];
    const m = path.match(/\.([A-Za-z0-9]+)$/);
    if (m) {
      const e = m[1].toLowerCase();
      return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'mp4', 'webm', 'mov', 'mkv', 'avi'].includes(e) ? '.' + e : '';
    }
  } catch (e) {}
  return '';
}

// 写入已选本地目录；不支持或无目录时返回 false
async function saveBlobToDir(blob, filename) {
  if (!t2iDirHandle) return false;
  try {
    const fileHandle = await t2iDirHandle.getFileHandle(filename, { create: true });
    const w = await fileHandle.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (e) { return false; }
}

// 绑定单个「选择目录」按钮：首次选目录 / 切换目录 / 恢复上次授权
function bindPickDirBtn(btn) {
  if (!btn) return;
  if (!window.showDirectoryPicker) { btn.hidden = true; return; }
  btn.addEventListener('click', async () => {
    if (t2iDirHandle) {
      try {
        const perm = await t2iDirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'prompt') {
          const g = await t2iDirHandle.requestPermission({ mode: 'readwrite' });
          if (g === 'granted') { updateDirLabel(); showToast('已恢复上次选择的目录'); return; }
        }
      } catch (e) { /* 句柄失效则重新选择 */ }
    }
    await pickDir();
  });
  // 这个按钮可能声明得比首次 updateDirLabel() 还晚，绑定后立刻同步一次当前目录名
  updateDirLabel();
}

// 确保目录句柄可用：无句柄则选目录；有句柄但权限待授权则在当前用户手势内恢复授权
async function ensureDirHandle() {
  if (!window.showDirectoryPicker) return;
  if (!t2iDirHandle) { await pickDir(); return; }
  try {
    const perm = await t2iDirHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'prompt') {
      const g = await t2iDirHandle.requestPermission({ mode: 'readwrite' });
      if (g !== 'granted') t2iDirHandle = null;   // 拒绝授权 → 后续走浏览器下载
    } else if (perm !== 'granted') {
      t2iDirHandle = null;
    }
  } catch (e) { t2iDirHandle = null; }
}

// 单张下载：已选目录直接写入该目录；未选过目录则先弹窗选择（用户手势内），再写入
async function downloadOne(url, label = '图片') {
  try {
    await ensureDirHandle();
    const res = await fetch(url);
    const blob = await res.blob();
    // 视频类结果（label='视频'）统一用 .mp4；图片类从 URL 推断，兜底 .png
    const ext = extFromUrl(url) || (label === '视频' ? '.mp4' : '.png');
    const name = genName(ext);
    if (await saveBlobToDir(blob, name)) { showToast(`已下载：单个${label}已成功保存到本地`); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast(`已开始下载${label}`);
  } catch (e) { showToast('下载失败，请重试', 'error'); }
}

// ---- 目录句柄持久化（IndexedDB：FileSystemDirectoryHandle 可结构化克隆）----
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wb_dir_storage', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const r = tx.objectStore('kv').get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch (e) { return undefined; }
}
async function idbSet(key, val) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { /* 存储失败仅本次不持久化 */ }
}
const DIR_HANDLE_KEY = 't2iDirHandle';

// 本地目录选择 / 切换：选中的句柄持久化到 IndexedDB，刷新/切分类后自动恢复
async function pickDir() {
  if (!window.showDirectoryPicker) return false;
  try {
    t2iDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    idbSet(DIR_HANDLE_KEY, t2iDirHandle);   // 记住目录（异步，不阻塞）
    updateDirLabel();
    return true;
  } catch (e) { return false; }  // 用户取消
}
// 页面加载时恢复上次选择的目录：只要权限未被明确拒绝就保留句柄，
// prompt 状态会在下次用户手势内自动恢复授权，无需重新选择目录。
async function restoreDirHandle() {
  if (!window.showDirectoryPicker || !window.indexedDB) return;
  const h = await idbGet(DIR_HANDLE_KEY);
  if (!h) return;
  try {
    const perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'denied') {
      t2iDirHandle = h;
      updateDirLabel();
    }
  } catch (e) { /* 句柄失效则忽略 */ }
}
function updateDirLabel() {
  // 实时查询所有目录按钮（id 以 PickDir 结尾），不受 JS 声明顺序影响；
  // ie / mc 等晚声明的按钮也能在 bind / 恢复目录时正确同步文字
  document.querySelectorAll('[id$="PickDir"]').forEach(btn => {
    // 本地资源根目录按钮（dlLocalPickDir）独立运作，不参与文生图等分类的共享目录标签
    if (btn.id === 'dlLocalPickDir') return;
    if (t2iDirHandle) {
      btn.textContent = '目录：' + (t2iDirHandle.name || '已选');
      btn.classList.add('chosen');
    } else {
      btn.textContent = '选择目录';
      btn.classList.remove('chosen');
    }
  });
}
// 所有早声明的「选择目录」按钮走同一逻辑（ie/mc 在下方单独绑定，避免 TDZ）
[t2iPickDir, a2rPickDir, facePickDir, hdPickDir, mvPickDir, exPickDir, posePickDir, fsPickDir, refPickDir, vcPickDir, tdPickDir, pdPickDir, dcPickDir, vrPickDir, mmvPickDir, davPickDir].forEach(bindPickDirBtn);
if (t2iPickDir && window.showDirectoryPicker) updateDirLabel();
restoreDirHandle();   // 异步恢复上次目录（浏览器记住授权后免选择）

// 批量下载勾选图片：t2i / a2r 等共用（同一全局选中集 + 目录句柄）
async function batchDownloadAll() {
  if (!selectedImgs.size) return;
  // 支持目录写入且尚未选目录时，先让用户选（处于用户手势内）；已有记录则恢复授权
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of selectedImgs) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 't2i_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }  // 已落盘
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    // 清空所有容器里的选中态（t2i / a2r 共用全局选中集）
    selectedImgs.clear();
    document.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    t2iSaveSel.disabled = true;
    if (a2rSaveSel) a2rSaveSel.disabled = true;
    if (irSaveSel) irSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
}
if (t2iSaveSel) t2iSaveSel.addEventListener('click', batchDownloadAll);
if (a2rSaveSel) a2rSaveSel.addEventListener('click', batchDownloadAll);

// 清空生成结果：删除所有结果列表 + 同步清空本地缓存
if (t2iClear) {
  t2iClear.addEventListener('click', () => {
    t2iTasks = [];
    t2iItems.innerHTML = '';
    t2iImages = [];
    selectedImgs.clear();
    t2iSaveSel.disabled = true;
    updateT2iMeta();
    persistT2i();           // 写入空数组，localStorage 同步清空
    t2iResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  动漫转真人（RunningHub 工作流 2091929488073510913 · 节点 241/259/262）
// ============================================================
const a2rFile = document.getElementById('a2rFile');
const a2rUpload = document.getElementById('a2rUpload');
const a2rPreviewWrap = document.getElementById('a2rPreviewWrap');
const a2rPreview = document.getElementById('a2rPreview');
const a2rFileName = document.getElementById('a2rFileName');
const a2rRePick = document.getElementById('a2rRePick');
const a2rScale = document.getElementById('a2rScale');
const a2rBtn = document.getElementById('a2rBtn');
const a2rItems = document.getElementById('a2rItems');
const a2rMeta = document.getElementById('a2rMeta');
const a2rResultCard = document.getElementById('a2rResultCard');
const a2rClear = document.getElementById('a2rClear');
const A2R_STORE_KEY = 'a2r_history_v1';
let a2rTasks = [];
let a2rFileDataUrl = '';

if (a2rUpload) {
  a2rUpload.addEventListener('click', () => a2rFile && a2rFile.click());
  a2rUpload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a2rFile && a2rFile.click(); }
  });
  const setDrag = (on) => a2rUpload.classList.toggle('drag', on);
  a2rUpload.addEventListener('dragover', (e) => { e.preventDefault(); setDrag(true); });
  a2rUpload.addEventListener('dragleave', () => setDrag(false));
  a2rUpload.addEventListener('drop', (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setA2rFile(f);
  });
}
if (a2rFile) {
  a2rFile.addEventListener('change', () => {
    const f = a2rFile.files && a2rFile.files[0];
    if (f) setA2rFile(f);
  });
}
if (a2rRePick) {
  a2rRePick.addEventListener('click', () => { if (a2rFile) a2rFile.click(); });
}

// 缩放值：失焦（blur）/ 回车（change）时校验并夹紧 768–2048（输入过程中不打扰，失焦后自动改值）
if (a2rScale) {
  const clampScale = () => {
    let v = parseInt(a2rScale.value, 10);
    if (isNaN(v) || a2rScale.value === '') { a2rScale.value = '1536'; return; }
    if (v < 768) a2rScale.value = '768';
    else if (v > 2048) a2rScale.value = '2048';
  };
  a2rScale.addEventListener('blur', clampScale);
  a2rScale.addEventListener('change', clampScale);
}

// 6 个单选下拉（multi-dd single-dd）：点击 trigger 弹出 panel，点击 item 直接选中并关闭；× 按钮清空
function initA2rMultiDd() {
  const dds = document.querySelectorAll('.field .multi-dd[data-tag]');
  if (!dds.length) return;
  const closeAll = (except) => {
    dds.forEach(dd => { if (dd !== except) { dd.classList.remove('open'); const p = dd.querySelector('.multi-dd-panel'); if (p) p.hidden = true; } });
  };
  const updateTrigger = (dd) => {
    const trigger = dd.querySelector('.multi-dd-trigger');
    const label = dd.querySelector('.multi-dd-label');
    const clear = dd.querySelector('.multi-dd-clear');
    const val = trigger.dataset.value || '';
    let item = null;
    if (!val) {
      label.textContent = '请选择（可不选）';
      trigger.classList.remove('has-sel');
      if (clear) clear.hidden = true;
    } else {
      item = dd.querySelector('.multi-dd-item[data-value="' + cssEscape(val) + '"]');
      const txt = item ? item.textContent : val;
      label.textContent = (txt || '').split('(')[0].trim() || val;
      trigger.classList.add('has-sel');
      if (clear) clear.hidden = false;
    }
    // 标记当前选中项（用于 panel 打开时显示勾）
    dd.querySelectorAll('.multi-dd-item').forEach(it => {
      it.classList.toggle('checked', !!(item && it === item));
    });
  };
  const cssEscape = (s) => String(s).replace(/(["\\])/g, '\\$1');
  const updatePreview = () => {
    const el = document.getElementById('a2rTagsValue');
    if (!el) return;
    const val = ['a2rTag1','a2rTag2','a2rTag3','a2rTag4','a2rTag5','a2rTag6']
      .map(id => {
        const root = document.querySelector('.multi-dd[data-tag="' + id + '"]');
        return root ? (root.querySelector('.multi-dd-trigger').dataset.value || '') : '';
      })
      .filter(s => s)
      .join(',');
    if (val) {
      el.textContent = val;
      el.classList.remove('empty');
    } else {
      el.textContent = '（未选择任何标签，将传空字符串）';
      el.classList.add('empty');
    }
  };
  dds.forEach(dd => {
    const trigger = dd.querySelector('.multi-dd-trigger');
    const panel = dd.querySelector('.multi-dd-panel');
    if (!trigger || !panel) return;
    trigger.addEventListener('click', (e) => {
      // 点 × 清空按钮不触发 toggle（事件已在 clear 自己的 listener 阻止）
      if (e.target.classList && e.target.classList.contains('multi-dd-clear')) return;
      e.stopPropagation();
      const isOpen = dd.classList.contains('open');
      closeAll(isOpen ? null : dd);
      if (isOpen) { dd.classList.remove('open'); panel.hidden = true; }
      else { dd.classList.add('open'); panel.hidden = false; }
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    dd.querySelectorAll('.multi-dd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        trigger.dataset.value = item.dataset.value;
        updateTrigger(dd);
        updatePreview();
        dd.classList.remove('open'); panel.hidden = true;
      });
    });
    const clear = dd.querySelector('.multi-dd-clear');
    if (clear) {
      clear.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        trigger.dataset.value = '';
        updateTrigger(dd);
        updatePreview();
        closeAll(null);
      });
    }
    updateTrigger(dd);
  });
  updatePreview();
  document.addEventListener('click', () => closeAll(null));
}
initA2rMultiDd();

function setA2rFile(f) {
  if (!f || !f.type || !f.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error'); return;
  }
  a2rFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  a2rPreview.src = '';
  a2rPreviewWrap.hidden = true;
  a2rUpload.hidden = false;
  const reader = new FileReader();
  reader.onload = () => {
    a2rFileDataUrl = String(reader.result || '');
    a2rPreview.src = a2rFileDataUrl;
    a2rPreviewWrap.hidden = false;
    a2rUpload.hidden = true;   // 上传后隐藏上传框，只显示预览（与扩图一致）
  };
  reader.onerror = () => showToast('读取图片失败', 'error');
  reader.readAsDataURL(f);
}

function persistA2r() {
  const data = a2rTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId,
                prompt: t.prompt, ratio: t.ratio, scale: t.scale, count: t.count,
                images: t.images, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(A2R_STORE_KEY, data);
}
function a2rRemove(task) {
  cancelRhTask(task);
  const i = a2rTasks.indexOf(task);
  if (i >= 0) a2rTasks.splice(i, 1);
  if (task.el && task.el.parentNode) task.el.parentNode.removeChild(task.el);
  persistA2r();
  if (!a2rTasks.length) a2rResultCard.hidden = true;
  updateA2rMeta();
}
function restoreA2r() {
  if (!a2rItems) return;
  const fresh = a2rTasks.length === 0;   // 首次进入才从本地重建 DOM，已加载则保留内存任务
  if (fresh) {
    const data = loadList(A2R_STORE_KEY, []);
    a2rTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    a2rItems.innerHTML = '';
    // 先标记 _kind/_remove，再 createT2iItemEl（事件绑定读 task._remove，避免被默认值覆盖）
    a2rTasks.forEach(t => { t._kind = 'a2r'; t._remove = a2rRemove; t._persist = persistA2r; });
    a2rTasks.forEach(t => a2rItems.appendChild(createT2iItemEl(t)));
  }
  // 统一恢复 / 重连：已完成渲染结果；其余有 taskId 且未取消/未超时的任务重新挂上轮询，
  // 这样即便前端曾因瞬时错误把任务标成「失败」，只要 RunningHub 还在跑，回来就能找回结果。
  const recentMs = 30 * 60 * 1000; // 仅重连 30 分钟内的失败任务，避免反复轮询陈年失败记录
  a2rTasks.forEach(t => {
    if (t.status === 'done') {
      setItemStatus(t, 'ok', t.statusText || ('生成完成 · ' + (t.images ? t.images.length : 0) + ' 张'));
      if (t.images && t.images.length) renderT2iGrid(t, t.images);
      return;
    }
    if (t.cancelled) return;
    if (!t.taskId) {  // 提交阶段就失败的（无 taskId）无法找回
      if (t.status === 'err') setItemStatus(t, 'err', t.statusText || '生成失败');
      return;
    }
    // 明确是「任务丢失」的：保留手动从后台恢复入口
    if (t.status === 'err' && t.statusText && t.statusText.includes('任务丢失')) {
      setNotFoundRecovery(t, a2rRemove);
      return;
    }
    // 陈年失败（>30 分钟）不再自动重连，避免无意义轮询
    if (t.status === 'err' && (Date.now() - (t.ts || 0) > recentMs)) {
      setItemStatus(t, 'err', t.statusText || '生成失败');
      return;
    }
    // 进行中 / 近期失败：重新连接 RunningHub 轮询找回结果
    if (!t._polling) setItemStatus(t, '', '正在重新连接 RunningHub…');
    attachRhPoll(t);
  });
  a2rResultCard.hidden = !a2rTasks.length;
  updateA2rMeta();
}
function updateA2rMeta() {
  if (!a2rMeta) return;
  const n = a2rTasks.length;
  if (!n) { a2rMeta.textContent = ''; return; }
  const ok = a2rTasks.filter(t => t.status === 'done').length;
  const err = a2rTasks.filter(t => t.status === 'err').length;
  a2rMeta.textContent = '共 ' + n + ' 组 · 成功 ' + ok + ' · 失败 ' + err;
}
function addA2rItem(tagDesc, scale) {
  a2rResultCard.hidden = false;
  const task = {
    id: 'a2r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, rhTaskId: null,
    prompt: '动漫转真人', ratio: tagDesc || '（无标签）', scale: scale, count: 1,
    images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null,
  };
  task._kind = 'a2r';
  task._remove = a2rRemove;
  task._persist = persistA2r;
  a2rTasks.unshift(task);
  a2rItems.prepend(createT2iItemEl(task));
  updateA2rMeta();
  persistA2r();
  return task;
}

if (a2rBtn) {
  a2rBtn.addEventListener('click', async () => {
    if (!a2rFileDataUrl) {
      showToast('请先上传一张动漫图片', 'error');
      if (a2rUpload && a2rUpload.scrollIntoView) a2rUpload.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!hasRh) {
      if (rhNotice) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); }
      openSettings();
      return;
    }
    let scale = parseInt(a2rScale.value, 10);
    if (isNaN(scale)) scale = 1536;
    const clamped = Math.max(768, Math.min(2048, scale));
    if (clamped !== scale) {
      a2rScale.value = String(clamped);
      showToast('缩放值已自动调整为 ' + clamped, 'info');
      scale = clamped;
    }
    const tags = ['a2rTag1','a2rTag2','a2rTag3','a2rTag4','a2rTag5','a2rTag6']
      .map(id => {
        const root = document.querySelector('.multi-dd[data-tag="' + id + '"]');
        if (!root) return '';
        return root.querySelector('.multi-dd-trigger').dataset.value || '';
      })
      .filter(s => s)
      .join(',');
    const tagDesc = tags || '（无标签）';
    const task = addA2rItem(tagDesc, scale);
    try {
      const r = await fetch('/api/rh-ani2real-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: a2rFileDataUrl, scale, tags }),
      });
      const d = await r.json();
      if (d.error === 'NO_RH_KEY') {
        hasRh = false; renderRhStatus();
        setItemStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
        persistA2r();
        openSettings();
        return;
      }
      if (d.error) {
        setItemStatus(task, 'err', '提交失败：' + (d.message || '未知错误'));
        persistA2r();
        return;
      }
      task.taskId = d.taskId;
      persistA2r();   // 立即落地 taskId，避免提交后瞬间切走/刷新导致记录丢失
      pollRhTask(task);
    } catch (e) {
      setItemStatus(task, 'err', '请求出错：' + e.message);
      persistA2r();
    }
  });
}

if (a2rClear) {
  a2rClear.addEventListener('click', () => {
    if (!a2rTasks.length) return;
    if (!confirm('确认清空所有动漫转真人生成结果？')) return;
    a2rTasks.slice().forEach(t => cancelRhTask(t));
    a2rTasks = [];
    a2rItems.innerHTML = '';
    // 同步清空共享选中集与按钮态（与 t2i 清空一致）
    selectedImgs.clear();
    t2iSaveSel.disabled = true;
    if (a2rSaveSel) a2rSaveSel.disabled = true;
    if (irSaveSel) irSaveSel.disabled = true;
    updateA2rMeta();
    persistA2r();
    a2rResultCard.hidden = true;
    showToast('已清空全部动漫转真人结果');
  });
}

// ============================================================
//  图片洗稿（上传真实人像 → 重绘风格，工作流 2092246175167635458）
//  镜像 动漫转真人(a2r)：上传图片 + 复用文生图结果渲染(createT2iItemEl)
// ============================================================
function setIrFile(f) {
  if (!f || !f.type || !f.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error'); return;
  }
  irFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  irPreview.src = '';
  irPreviewWrap.hidden = true;
  irUpload.hidden = false;
  const reader = new FileReader();
  reader.onload = () => {
    irFileDataUrl = String(reader.result || '');
    irPreview.src = irFileDataUrl;
    irPreviewWrap.hidden = false;
    irUpload.hidden = true;
  };
  reader.onerror = () => showToast('读取图片失败', 'error');
  reader.readAsDataURL(f);
}

function persistIr() {
  const data = irTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId,
                prompt: t.prompt, ratio: t.ratio, scale: t.scale, count: t.count,
                srcName: t.srcName, images: t.images, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(IR_STORE_KEY, data);
}
function irRemove(task) {
  cancelRhTask(task);
  const i = irTasks.indexOf(task);
  if (i >= 0) irTasks.splice(i, 1);
  if (task.el && task.el.parentNode) task.el.parentNode.removeChild(task.el);
  persistIr();
  if (!irTasks.length) irResultCard.hidden = true;
  updateIrMeta();
}
function restoreIr() {
  if (!irItems) return;
  const now = Date.now();
  const fresh = irTasks.length === 0;
  if (fresh) {
    const data = loadList(IR_STORE_KEY, []);
    irTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    irTasks.forEach(t => { t._kind = 'ir'; t._remove = irRemove; t._persist = persistIr; });
    irItems.innerHTML = '';
    irTasks.forEach(t => irItems.appendChild(createT2iItemEl(t)));
    irResultCard.hidden = !irTasks.length;
    updateIrMeta();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(irTasks, { setStatus: setItemStatus, renderGrid: renderT2iGrid, noun: '张', remove: irRemove, poll: pollRhTask });
}
function updateIrMeta() {
  if (!irMeta) return;
  const n = irTasks.length;
  if (!n) { irMeta.textContent = ''; return; }
  const ok = irTasks.filter(t => t.status === 'done').length;
  const err = irTasks.filter(t => t.status === 'err').length;
  irMeta.textContent = '共 ' + n + ' 组 · 成功 ' + ok + ' · 失败 ' + err;
}
function addIrItem(srcName, ratio, scale, count) {
  irResultCard.hidden = false;
  const task = {
    id: 'ir_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, rhTaskId: null,
    prompt: '图片洗稿 · ' + (srcName || '人像'),
    srcName: srcName || '',
    ratio: ratio, scale: scale, count: count,
    images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null,
  };
  task._kind = 'ir';
  task._remove = irRemove;
  task._persist = persistIr;
  irTasks.unshift(task);
  irItems.prepend(createT2iItemEl(task));
  updateIrMeta();
  persistIr();
  return task;
}

if (irUpload) {
  irUpload.addEventListener('click', () => irFile.click());
  irUpload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irFile.click(); }
  });
  irUpload.addEventListener('dragover', (e) => { e.preventDefault(); irUpload.classList.add('drag'); });
  irUpload.addEventListener('dragleave', () => irUpload.classList.remove('drag'));
  irUpload.addEventListener('drop', (e) => {
    e.preventDefault(); irUpload.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setIrFile(f);
  });
}
if (irFile) {
  irFile.addEventListener('change', () => {
    if (irFile.files && irFile.files[0]) setIrFile(irFile.files[0]);
  });
}
if (irRePick) {
  irRePick.addEventListener('click', () => irFile.click());
}
if (irBtn) {
  irBtn.addEventListener('click', async () => {
    if (!irFileDataUrl) {
      showToast('请先上传一张真实人像图片', 'error');
      if (irUpload && irUpload.scrollIntoView) irUpload.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!hasRh) {
      if (rhNotice) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); }
      openSettings();
      return;
    }
    const ratio = irRatio.value;
    const scale = Math.max(0.2, Math.min(2.0, parseFloat(irScale.value) || 0.5));
    const count = Math.max(1, Math.min(4, parseInt(irCount.value, 10) || 1));
    const srcName = (irFileName.textContent || '').split('（')[0] || '人像';
    const task = addIrItem(srcName, ratio, scale, count);
    try {
      const r = await fetch('/api/rh-imgrewrite-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: irFileDataUrl, ratio, scale, count }),
      });
      const d = await r.json();
      if (d.error === 'NO_RH_KEY') {
        hasRh = false; renderRhStatus();
        setItemStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
        persistIr();
        openSettings();
        return;
      }
      if (d.error) {
        setItemStatus(task, 'err', '提交失败：' + (d.message || '未知错误'));
        persistIr();
        return;
      }
      task.taskId = d.taskId;
      pollRhTask(task);
    } catch (e) {
      setItemStatus(task, 'err', '请求出错：' + e.message);
      persistIr();
    }
  });
}
if (irClear) {
  irClear.addEventListener('click', () => {
    if (!irTasks.length) return;
    if (!confirm('确认清空所有图片洗稿生成结果？')) return;
    irTasks.slice().forEach(t => cancelRhTask(t));
    irTasks = [];
    irItems.innerHTML = '';
    selectedImgs.clear();
    t2iSaveSel.disabled = true;
    if (a2rSaveSel) a2rSaveSel.disabled = true;
    if (irSaveSel) irSaveSel.disabled = true;
    if (irSaveSel) irSaveSel.disabled = true;
    updateIrMeta();
    persistIr();
    irResultCard.hidden = true;
    showToast('已清空全部图片洗稿结果');
  });
}
if (irPickDir) bindPickDirBtn(irPickDir);
if (irSaveSel) irSaveSel.addEventListener('click', batchDownloadAll);

// 从后台（RunningHub）恢复本模块「生成失败」的历史记录（按当前工作流精确筛选）
if (irRecover) {
  irRecover.addEventListener('click', () => recoverFailed('ir'));
}


// ============================================================
//  人像摄影（输入提示词 → 文生图风格人像；镜像图片洗稿，去掉上传图片）
// ============================================================
function persistPr() {
  const data = prTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId,
                prompt: t.prompt, ratio: t.ratio, scale: t.scale, count: t.count,
                srcName: t.srcName, images: t.images, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(PR_STORE_KEY, data);
}
function prRemove(task) {
  cancelRhTask(task);
  const i = prTasks.indexOf(task);
  if (i >= 0) prTasks.splice(i, 1);
  if (task.el && task.el.parentNode) task.el.parentNode.removeChild(task.el);
  persistPr();
  if (!prTasks.length) prResultCard.hidden = true;
  updatePrMeta();
}
function restorePr() {
  if (!prItems) return;
  const now = Date.now();
  const fresh = prTasks.length === 0;
  if (fresh) {
    const data = loadList(PR_STORE_KEY, []);
    prTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    prTasks.forEach(t => { t._kind = 'pr'; t._remove = prRemove; t._persist = persistPr; });
    prItems.innerHTML = '';
    prTasks.forEach(t => prItems.appendChild(createT2iItemEl(t)));
    prResultCard.hidden = !prTasks.length;
    updatePrMeta();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(prTasks, { setStatus: setItemStatus, renderGrid: renderT2iGrid, noun: '张', remove: prRemove, poll: pollRhTask });
}
function updatePrMeta() {
  if (!prMeta) return;
  const n = prTasks.length;
  if (!n) { prMeta.textContent = ''; return; }
  const ok = prTasks.filter(t => t.status === 'done').length;
  const err = prTasks.filter(t => t.status === 'err').length;
  prMeta.textContent = '共 ' + n + ' 组 · 成功 ' + ok + ' · 失败 ' + err;
}
function addPrItem(prompt, ratio, scale, count) {
  prResultCard.hidden = false;
  const task = {
    id: 'pr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, rhTaskId: null,
    prompt: '人像摄影 · ' + (prompt ? prompt.slice(0, 20) : '提示词'),
    srcName: '',
    ratio: ratio, scale: scale, count: count,
    images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null,
  };
  task._kind = 'pr';
  task._remove = prRemove;
  task._persist = persistPr;
  prTasks.unshift(task);
  prItems.prepend(createT2iItemEl(task));
  updatePrMeta();
  persistPr();
  return task;
}

if (prBtn) {
  prBtn.addEventListener('click', async () => {
    const prompt = (prPrompt.value || '').trim();
    if (!prompt) {
      showToast('请输入人像摄影提示词（支持中英文）', 'error');
      if (prPrompt && prPrompt.scrollIntoView) prPrompt.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!hasRh) {
      if (rhNotice) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); }
      openSettings();
      return;
    }
    const ratio = prRatio.value;
    const scale = Math.max(0.2, Math.min(2.0, parseFloat(prScale.value) || 0.5));
    const count = Math.max(1, Math.min(4, parseInt(prCount.value, 10) || 1));
    const task = addPrItem(prompt, ratio, scale, count);
    try {
      const r = await fetch('/api/rh-portrait-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ratio, scale, count }),
      });
      const d = await r.json();
      if (d.error === 'NO_RH_KEY') {
        hasRh = false; renderRhStatus();
        setItemStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
        persistPr();
        openSettings();
        return;
      }
      if (d.error) {
        setItemStatus(task, 'err', '提交失败：' + (d.message || '未知错误'));
        persistPr();
        return;
      }
      task.taskId = d.taskId;
      pollRhTask(task);
    } catch (e) {
      setItemStatus(task, 'err', '请求出错：' + e.message);
      persistPr();
    }
  });
}
if (prClear) {
  prClear.addEventListener('click', () => {
    if (!prTasks.length) return;
    if (!confirm('确认清空所有人像摄影生成结果？')) return;
    prTasks.slice().forEach(t => cancelRhTask(t));
    prTasks = [];
    prItems.innerHTML = '';
    selectedImgs.clear();
    t2iSaveSel.disabled = true;
    if (a2rSaveSel) a2rSaveSel.disabled = true;
    if (irSaveSel) irSaveSel.disabled = true;
    if (prSaveSel) prSaveSel.disabled = true;
    updatePrMeta();
    persistPr();
    prResultCard.hidden = true;
    showToast('已清空全部人像摄影结果');
  });
}
if (prPickDir) bindPickDirBtn(prPickDir);
if (prSaveSel) prSaveSel.addEventListener('click', batchDownloadAll);

// 从后台（RunningHub）恢复历史任务：扫描本机记录 → 拉取后台产出 → 显示为人像摄影结果
if (prRecover) {
  prRecover.addEventListener('click', () => recoverFailed('pr'));
}


// ============================================================
//  修脸磨皮（RunningHub 图生图工作流 · 上传图片节点 #642）
// ============================================================
function setFaceFile(f) {
  if (!f || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  faceFile = f;
  if (facePreview.src) URL.revokeObjectURL(facePreview.src);
  facePreview.src = URL.createObjectURL(f);
  facePreviewWrap.hidden = false;
  faceUpload.hidden = true;
  faceFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
if (faceUpload) {
  faceUpload.addEventListener('click', () => faceFileInput.click());
  faceUpload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); faceFileInput.click(); }
  });
  faceUpload.addEventListener('dragover', (e) => { e.preventDefault(); faceUpload.classList.add('drag'); });
  faceUpload.addEventListener('dragleave', () => faceUpload.classList.remove('drag'));
  faceUpload.addEventListener('drop', (e) => {
    e.preventDefault(); faceUpload.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFaceFile(f);
  });
}
if (faceFileInput) {
  faceFileInput.addEventListener('change', () => {
    if (faceFileInput.files && faceFileInput.files[0]) setFaceFile(faceFileInput.files[0]);
  });
}
if (faceRePick) {
  faceRePick.addEventListener('click', () => faceFileInput.click());  // 直接打开选择器，未选择不做任何操作
}

// 生成：上传图片 → 入队（上传 + 提交工作流都在后端队列中执行）
faceBtn.addEventListener('click', async () => {
  if (!faceFile) { showToast('请先上传一张图片', 'error'); faceUpload.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const task = addFaceItem(faceFile.name);
  const fd = new FormData();
  fd.append('file', faceFile);
  try {
    const r = await fetch('/api/rh-face-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setFaceStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistFace();
      openSettings();
      return;
    }
    if (d.error) {
      setFaceStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistFace();
      return;
    }
    task.taskId = d.taskId;
    pollFaceTask(task);
  } catch (e) {
    setFaceStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistFace();
  }
});

// 新增一组修脸结果 Item（最新在最上方）
function addFaceItem(name) {
  faceResultCard.hidden = false;
  const task = {
    id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  faceTasks.unshift(task);
  faceItems.prepend(createFaceItemEl(task));
  updateFaceMeta();
  persistFace();
  task._kind = 'face';
  task._remove = faceRemove;
  return task;
}
function createFaceItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'face';
  task._remove = faceRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => faceRemove(task));
  if (task.status === 'done') {
    setFaceStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderFaceGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setFaceStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setFaceStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setFaceStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function faceRemove(task) {
  cancelRhTask(task);
  const i = faceTasks.indexOf(task);
  if (i >= 0) faceTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateFaceMeta();
  rebuildFaceImages();
  persistFace();
  if (!faceTasks.length) faceResultCard.hidden = true;
}
function updateFaceMeta() {
  const n = faceItems ? faceItems.children.length : 0;
  faceMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildFaceImages() {
  faceImages = Array.from(faceItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistFace() {
  const data = faceTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, name: t.name, images: t.images, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(FACE_STORE_KEY, data);
}
function restoreFace() {
  if (faceTasks.length) return;
  const now = Date.now();
  const data = loadList(FACE_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(FACE_STORE_KEY, []); return; }  // 全部过期：清理缓存
  faceTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
  faceResultCard.hidden = false;
  faceItems.innerHTML = '';
  faceTasks.forEach(task => faceItems.appendChild(createFaceItemEl(task)));
  updateFaceMeta();
  rebuildFaceImages();
}

// 轮询修脸任务状态（与文生图共用同一 RunningHub 任务队列）
async function pollFaceTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;  // 已被删除：停止轮询
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setFaceStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setFaceStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { faceRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setFaceStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistFace();
      return;
    } else if (st.status === 'done') {
      setFaceStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderFaceGrid(task, st.images || []);
      persistFace();
      return;
    }
  }
  setFaceStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistFace();
}

// 渲染一组修脸结果（图片 + 圆圈选择 + 单张下载 + 灯箱）
function renderFaceGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '修脸结果'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, faceImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) faceSelected.add(url); else faceSelected.delete(url);
      faceSaveSel.disabled = faceSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildFaceImages();
}

// 修脸批量下载（与文生图共用已选目录 t2iDirHandle）
faceSaveSel.addEventListener('click', async () => {
  if (!faceSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of faceSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'face_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    faceSelected.clear();
    faceItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    faceSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

// 清空修脸生成结果 + 同步清空本地缓存
if (faceClear) {
  faceClear.addEventListener('click', () => {
    faceTasks = [];
    faceItems.innerHTML = '';
    faceImages = [];
    faceSelected.clear();
    faceSaveSel.disabled = true;
    updateFaceMeta();
    persistFace();
    faceResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  高清放大（RunningHub 图生图工作流 · 上传图片节点 #43）
// ============================================================
function setHdFile(f) {
  if (!f || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  hdFile = f;
  if (hdPreview.src) URL.revokeObjectURL(hdPreview.src);
  hdPreview.src = URL.createObjectURL(f);
  hdPreviewWrap.hidden = false;
  hdUpload.hidden = true;
  hdFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
if (hdUpload) {
  hdUpload.addEventListener('click', () => hdFileInput.click());
  hdUpload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hdFileInput.click(); }
  });
  hdUpload.addEventListener('dragover', (e) => { e.preventDefault(); hdUpload.classList.add('drag'); });
  hdUpload.addEventListener('dragleave', () => hdUpload.classList.remove('drag'));
  hdUpload.addEventListener('drop', (e) => {
    e.preventDefault(); hdUpload.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setHdFile(f);
  });
}
if (hdFileInput) {
  hdFileInput.addEventListener('change', () => {
    if (hdFileInput.files && hdFileInput.files[0]) setHdFile(hdFileInput.files[0]);
  });
}
if (hdRePick) {
  hdRePick.addEventListener('click', () => hdFileInput.click());  // 直接打开选择器，未选择不做任何操作
}

hdBtn.addEventListener('click', async () => {
  if (!hdFile) { showToast('请先上传一张图片', 'error'); hdUpload.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const task = addHdItem(hdFile.name);
  const fd = new FormData();
  fd.append('file', hdFile);
  try {
    const r = await fetch('/api/rh-hd-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setHdStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistHd();
      openSettings();
      return;
    }
    if (d.error) {
      setHdStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistHd();
      return;
    }
    task.taskId = d.taskId;
    pollHdTask(task);
  } catch (e) {
    setHdStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistHd();
  }
});

function addHdItem(name) {
  hdResultCard.hidden = false;
  const task = {
    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  hdTasks.unshift(task);
  hdItems.prepend(createHdItemEl(task));
  updateHdMeta();
  persistHd();
  task._kind = 'hd';
  task._remove = hdRemove;
  return task;
}
function createHdItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'hd';
  task._remove = hdRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => hdRemove(task));
  if (task.status === 'done') {
    setHdStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderHdGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setHdStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setHdStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setHdStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function hdRemove(task) {
  cancelRhTask(task);
  const i = hdTasks.indexOf(task);
  if (i >= 0) hdTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateHdMeta();
  rebuildHdImages();
  persistHd();
  if (!hdTasks.length) hdResultCard.hidden = true;
}
function updateHdMeta() {
  const n = hdItems ? hdItems.children.length : 0;
  hdMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildHdImages() {
  hdImages = Array.from(hdItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistHd() {
  const data = hdTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, name: t.name, images: t.images, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(HD_STORE_KEY, data);
}
function restoreHd() {
  if (hdTasks.length) return;
  const now = Date.now();
  const data = loadList(HD_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(HD_STORE_KEY, []); return; }  // 全部过期：清理缓存
  hdTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
  hdResultCard.hidden = false;
  hdItems.innerHTML = '';
  hdTasks.forEach(task => hdItems.appendChild(createHdItemEl(task)));
  updateHdMeta();
  rebuildHdImages();
}

async function pollHdTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setHdStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setHdStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { hdRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setHdStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistHd();
      return;
    } else if (st.status === 'done') {
      setHdStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderHdGrid(task, st.images || []);
      persistHd();
      return;
    }
  }
  setHdStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistHd();
}

function renderHdGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '高清结果'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, hdImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) hdSelected.add(url); else hdSelected.delete(url);
      hdSaveSel.disabled = hdSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildHdImages();
}

hdSaveSel.addEventListener('click', async () => {
  if (!hdSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of hdSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'hd_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    hdSelected.clear();
    hdItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    hdSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (hdClear) {
  hdClear.addEventListener('click', () => {
    hdTasks = [];
    hdItems.innerHTML = '';
    hdImages = [];
    hdSelected.clear();
    hdSaveSel.disabled = true;
    updateHdMeta();
    persistHd();
    hdResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  参考图生图（RunningHub 图生图工作流 · 图片节点 351/352/353）
// ============================================================
function renderRef3Grid() {
  if (!ref3Grid) return;
  ref3Grid.innerHTML = '';
  refFiles.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'ref3-thumb';
    const img = document.createElement('img');
    img.src = f._url || (f._url = URL.createObjectURL(f));
    img.alt = '参考图 ' + (i + 1);
    card.appendChild(img);
    const tag = document.createElement('span');
    tag.className = 'ref3-thumb-tag';
    tag.textContent = '#' + REF3_IMG_NODES[i];
    card.appendChild(tag);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'ref3-thumb-del'; del.setAttribute('aria-label', '删除');
    del.innerHTML = '×';
    del.addEventListener('click', () => {
      if (f._url) URL.revokeObjectURL(f._url);
      refFiles.splice(i, 1);
      renderRef3Grid();
    });
    card.appendChild(del);
    ref3Grid.appendChild(card);
  });
  if (refFiles.length < 3) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'ref3-add'; add.setAttribute('aria-label', '添加参考图');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M12 6v12M6 12h12" stroke="#0052D9" stroke-width="1.8" stroke-linecap="round"/></svg><span>添加参考图</span>';
    add.addEventListener('click', () => ref3FileInput.click());
    ref3Grid.appendChild(add);
  }
}
if (ref3FileInput) {
  ref3FileInput.addEventListener('change', () => {
    const picked = Array.from(ref3FileInput.files || []);
    for (const f of picked) {
      if (refFiles.length >= 3) break;
      if (!f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); continue; }
      refFiles.push(f);
    }
    ref3FileInput.value = '';
    renderRef3Grid();
  });
}

refBtn.addEventListener('click', async () => {
  if (!refFiles.length) { showToast('请上传至少一张参考图片', 'error'); return; }
  const prompt = refPrompt.value.trim();
  if (!prompt) { refPrompt.focus(); refPrompt.style.borderColor = '#d93025'; return; }
  refPrompt.style.borderColor = '';
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const ratio = refRatio.value;
  const scale = Math.max(0.2, Math.min(2.0, parseFloat(refScale.value) || 0.5));
  const count = Math.max(1, Math.min(4, parseInt(refCount.value, 10) || 1));
  const task = addRefItem(prompt, ratio, scale, count, refFiles.length);
  const fd = new FormData();
  refFiles.forEach((f, i) => fd.append('file_' + i, f));
  fd.append('prompt', prompt);
  fd.append('ratio', ratio);
  fd.append('scale', scale);
  fd.append('count', count);
  try {
    const r = await fetch('/api/rh-refimg-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setRefStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistRef();
      openSettings();
      return;
    }
    if (d.error) {
      setRefStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistRef();
      return;
    }
    task.taskId = d.taskId;
    persistRef();
    pollRefTask(task);
  } catch (e) {
    setRefStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistRef();
  }
});

function addRefItem(prompt, ratio, scale, count, imgCount) {
  refResultCard.hidden = false;
  const task = {
    id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, prompt, ratio, scale, count, imgCount: imgCount || refFiles.length,
    images: [],
    status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  refTasks.unshift(task);
  refItems.prepend(createRefItemEl(task));
  updateRefMeta();
  persistRef();
  task._kind = 'ref';
  task._remove = refRemove;
  return task;
}
function createRefItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.prompt) + '</div>' +
        '<div class="t2i-result-sub">参考 ' + (task.imgCount || 3) + ' 张 · ' + escapeHtml(task.ratio) + ' · ' + task.scale + '× · ' + task.count + ' 张 · ' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'ref';
  task._remove = refRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => refRemove(task));
  if (task.status === 'done') {
    setRefStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderRefGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setRefStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setRefStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setRefStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function refRemove(task) {
  cancelRhTask(task);
  const i = refTasks.indexOf(task);
  if (i >= 0) refTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateRefMeta();
  rebuildRefImages();
  persistRef();
  if (!refTasks.length) refResultCard.hidden = true;
}
function updateRefMeta() {
  const n = refItems ? refItems.children.length : 0;
  refMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildRefImages() {
  refImages = Array.from(refItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistRef() {
  const data = refTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, ratio: t.ratio, scale: t.scale, count: t.count, images: t.images, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(REF_STORE_KEY, data);
}
function restoreRef() {
  const now = Date.now();
  const fresh = refTasks.length === 0;
  if (fresh) {
    const data = loadList(REF_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(REF_STORE_KEY, []); return; }  // 全部过期：清理缓存
    refTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    refResultCard.hidden = false;
    refItems.innerHTML = '';
    refTasks.forEach(task => refItems.appendChild(createRefItemEl(task)));
    updateRefMeta();
    rebuildRefImages();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(refTasks, { setStatus: setRefStatus, renderGrid: renderRefGrid, noun: '张', remove: refRemove, poll: pollRefTask });
}

async function pollRefTask(task) {
  if (task._polling) return; task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setRefStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setRefStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { refRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setRefStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistRef();
      return;
    } else if (st.status === 'done') {
      setRefStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderRefGrid(task, st.images || []);
      persistRef();
      return;
    }
  }
  setRefStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistRef();
  } finally {
    task._polling = false;
  }
}

function renderRefGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '生成图片'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, refImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) refSelected.add(url); else refSelected.delete(url);
      refSaveSel.disabled = refSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildRefImages();
}

refSaveSel.addEventListener('click', async () => {
  if (!refSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of refSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'ref_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    refSelected.clear();
    refItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    refSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (refClear) {
  refClear.addEventListener('click', () => {
    refTasks = [];
    refItems.innerHTML = '';
    refImages = [];
    refSelected.clear();
    refSaveSel.disabled = true;
    updateRefMeta();
    persistRef();
    refResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  文生视频（RunningHub 纯文本工作流 · 提示词 #19 · 时长 #16 · 比例/缩放 #15）
// ============================================================
// ============================================================
//  文生视频（RunningHub 纯文本工作流 · 提示词 #19 · 时长 #16 · 比例/缩放 #15）
// ============================================================

mvBtn.addEventListener('click', async () => {
  const prompt = mvPrompt.value.trim();
  if (!prompt) { mvPrompt.focus(); mvPrompt.style.borderColor = '#d93025'; return; }
  mvPrompt.style.borderColor = '';
  const duration = Math.max(4, Math.min(15, parseInt(mvDuration.value, 10) || 5));
  mvDuration.value = duration;
  const ratio = mvRatio.value;
  const scale = Math.max(0.2, Math.min(2.0, parseFloat(mvScale.value) || 0.5));
  mvScale.value = scale;
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const task = addMvItem(prompt, duration, ratio, scale);
  try {
    const r = await fetch('/api/rh-mv-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration, ratio, scale })
    });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setMvStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistMv();
      openSettings();
      return;
    }
    if (d.error) {
      setMvStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistMv();
      return;
    }
    task.taskId = d.taskId;
    persistMv();
    pollMvTask(task);
  } catch (e) {
    setMvStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistMv();
  }
});

function addMvItem(prompt, duration, ratio, scale) {
  mvResultCard.hidden = false;
  const task = {
    id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, prompt, duration, ratio, scale, videos: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  mvTasks.unshift(task);
  mvItems.prepend(createMvItemEl(task));
  updateMvMeta();
  persistMv();
  task._kind = 'mv';
  task._remove = mvRemove;
  return task;
}
function createMvItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const paramText = [
    task.duration ? task.duration + ' 秒' : '',
    task.ratio,
    task.scale ? 'x' + task.scale : ''
  ].filter(Boolean).join(' · ');
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt" title="' + escapeHtml(task.prompt || '') + '">' + escapeHtml(truncateText(task.prompt, 30)) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + paramText + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'mv';
  task._remove = mvRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => mvRemove(task));
  if (task.status === 'done') {
    setMvStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.videos ? task.videos.length : 0) + ' 个视频'));
    if (task.videos && task.videos.length) renderMvGrid(task, task.videos);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setMvStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setMvStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setMvStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function mvRemove(task) {
  cancelRhTask(task);
  const i = mvTasks.indexOf(task);
  if (i >= 0) mvTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateMvMeta();
  rebuildMvVideos();
  persistMv();
  if (!mvTasks.length) mvResultCard.hidden = true;
}
function updateMvMeta() {
  const n = mvItems ? mvItems.children.length : 0;
  mvMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildMvVideos() {
  mvVideos = Array.from(mvItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistMv() {
  const data = mvTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, duration: t.duration, ratio: t.ratio, scale: t.scale, videos: t.videos, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(MV_STORE_KEY, data);
}
function restoreMv() {
  const now = Date.now();
  const fresh = mvTasks.length === 0;
  if (fresh) {
    // 一次性清理：本次更新后首次进入文生视频时清空本地历史，便于干净测试；之后不再自动清理
    if (!localStorage.getItem('mv_cleared_20260824')) {
      localStorage.removeItem(MV_STORE_KEY);
      localStorage.setItem('mv_cleared_20260824', '1');
    }
    const data = loadList(MV_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(MV_STORE_KEY, []); return; }  // 全部过期：清理缓存
    mvTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    mvResultCard.hidden = false;
    mvItems.innerHTML = '';
    mvTasks.forEach(task => mvItems.appendChild(createMvItemEl(task)));
    updateMvMeta();
    rebuildMvVideos();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(mvTasks, { setStatus: setMvStatus, renderGrid: renderMvGrid, noun: '个视频', remove: mvRemove, poll: pollMvTask });
}

async function pollMvTask(task) {
  if (task._polling) return; task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setMvStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setMvStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { mvRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setMvStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistMv();
      return;
    } else if (st.status === 'done') {
      const videos = st.images || [];
      setMvStatus(task, 'ok', `生成完成 · ${videos.length} 个视频`);
      renderMvGrid(task, videos);
      persistMv();
      return;
    }
  }
  setMvStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistMv();
  } finally {
    task._polling = false;
  }
}

function renderMvGrid(task, videos) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.videos = videos.slice();
  if (!videos.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回视频，请稍后重试。</div>';
    return;
  }
  videos.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item video-item';
    box.dataset.url = url;

    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = false;
    video.setAttribute('playsinline', '');
    // 点击视频缩略图 → 像图片一样放大到灯箱
    video.addEventListener('click', () => openMvLightbox(url));
    box.appendChild(video);

    const play = document.createElement('button');
    play.type = 'button'; play.className = 'mv-play'; play.setAttribute('aria-label', '放大预览');
    play.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.55)"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>';
    play.addEventListener('click', (e) => { e.stopPropagation(); openMvLightbox(url); });
    box.appendChild(play);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) mvSelected.add(url); else mvSelected.delete(url);
      mvSaveSel.disabled = mvSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单个视频');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url, '视频'); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildMvVideos();
}

// ---------- 文生视频 · 视频放大灯箱（点击视频 → 灯箱 → 中间播放按钮 → 播放/暂停） ----------
// 播放按钮自动隐藏模型：鼠标移入视频区显示、移出隐藏；点击交互后 1 秒自动隐藏。
let mvLbHideTimer = null;
function mvLbShowPlay() {
  if (!mvLbPlay) return;
  if (mvLbHideTimer) { clearTimeout(mvLbHideTimer); mvLbHideTimer = null; }
  mvLbPlay.classList.remove('hidden');
}
function mvLbHidePlay() {
  if (!mvLbPlay) return;
  if (mvLbHideTimer) { clearTimeout(mvLbHideTimer); mvLbHideTimer = null; }
  mvLbPlay.classList.add('hidden');
}
function mvLbScheduleHide() {
  if (mvLbHideTimer) clearTimeout(mvLbHideTimer);
  mvLbHideTimer = setTimeout(() => { if (mvLbPlay) mvLbPlay.classList.add('hidden'); }, 1000);
}
function updateMvLbPlayIcon() {
  if (!mvLbPlayIcon) return;
  const playing = mvLbVideo && !mvLbVideo.paused && !mvLbVideo.ended;
  // 暂停时显示 ▶ 播放按钮；播放中显示 ⏸ 暂停按钮
  mvLbPlayIcon.innerHTML = playing
    ? '<circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/><rect x="8.5" y="7.5" width="2.5" height="9" rx="1" fill="#fff"/><rect x="13" y="7.5" width="2.5" height="9" rx="1" fill="#fff"/>'
    : '<circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/><path d="M9.5 7.5l7 4.5-7 4.5V7.5z" fill="#fff"/>';
}
function openMvLightbox(url) {
  if (!mvLightbox || !mvLbVideo) return;
  mvLbVideo.src = url;
  mvLbVideo.load();
  mvLbVideo.pause();
  updateMvLbPlayIcon();
  mvLightbox.hidden = false;
  mvLbShowPlay();
  mvLbScheduleHide();   // 打开后无操作 1 秒自动隐藏按钮
}
function closeMvLightbox() {
  if (!mvLightbox || !mvLbVideo) return;
  mvLightbox.hidden = true;
  mvLbVideo.pause();
  mvLbVideo.src = '';
  mvLbHidePlay();
  updateMvLbPlayIcon();
}
function toggleMvLbPlay() {
  if (!mvLbVideo) return;
  if (mvLbVideo.paused || mvLbVideo.ended) mvLbVideo.play().catch(() => {});
  else mvLbVideo.pause();
}
const mvLbStage = mvLightbox ? mvLightbox.querySelector('.mv-lb-stage') : null;
if (mvLbPlay) {
  // 点击按钮：切换播放/暂停，并 1 秒后自动隐藏
  mvLbPlay.addEventListener('click', (e) => { e.stopPropagation(); toggleMvLbPlay(); mvLbScheduleHide(); });
}
if (mvLbVideo) {
  // 点击视频画面本身也切换播放/暂停，并 1 秒后自动隐藏按钮
  mvLbVideo.addEventListener('click', (e) => { e.stopPropagation(); toggleMvLbPlay(); mvLbScheduleHide(); });
}
['play', 'pause', 'ended'].forEach(evt => {
  if (mvLbVideo) mvLbVideo.addEventListener(evt, updateMvLbPlayIcon);
});
if (mvLbStage) {
  // 鼠标移入视频区域 → 显示按钮；移出 → 隐藏；区域内移动 → 重新显示
  mvLbStage.addEventListener('mouseenter', mvLbShowPlay);
  mvLbStage.addEventListener('mouseleave', mvLbHidePlay);
  mvLbStage.addEventListener('mousemove', mvLbShowPlay);
}
if (mvLbClose) mvLbClose.addEventListener('click', closeMvLightbox);
if (mvLightbox) {
  const mvLbOv = mvLightbox.querySelector('.mv-lb-overlay');
  if (mvLbOv) mvLbOv.addEventListener('click', closeMvLightbox);
}

mvSaveSel.addEventListener('click', async () => {
  if (!mvSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of mvSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'mv_' + Date.now() + '_' + i + '.mp4';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个视频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    mvSelected.clear();
    mvItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    mvSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (mvClear) {
  mvClear.addEventListener('click', () => {
    mvTasks = [];
    mvItems.innerHTML = '';
    mvVideos = [];
    mvSelected.clear();
    mvSaveSel.disabled = true;
    updateMvMeta();
    persistMv();
    mvResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}


// ============================================================
//  扩图（RunningHub 图生图工作流 · 上传图片 #521 · 扩图像素 #526）
// ============================================================
// 扩图像素：最小值为 0（该边不扩），输入大于 0 时取最接近的 8 的倍数，且最大不超过 2048
function normalizePad(v) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0) return 0;
  if (n === 0) return 0;   // 0 合法：该边不扩
  return Math.min(2048, Math.max(8, Math.round(n / 8) * 8));   // >0 时取最接近的 8 的倍数，上限 2048
}
[exLeft, exTop, exRight, exBottom].forEach(inp => {
  if (inp) inp.addEventListener('change', () => { inp.value = normalizePad(inp.value); });
});
function setExFile(f) {
  if (!f || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  exFile = f;
  if (exPreview.src) URL.revokeObjectURL(exPreview.src);
  exPreview.src = URL.createObjectURL(f);
  exPreviewWrap.hidden = false;
  exUpload.hidden = true;
  exFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
if (exUpload) {
  exUpload.addEventListener('click', () => exFileInput.click());
  exUpload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exFileInput.click(); }
  });
  exUpload.addEventListener('dragover', (e) => { e.preventDefault(); exUpload.classList.add('drag'); });
  exUpload.addEventListener('dragleave', () => exUpload.classList.remove('drag'));
  exUpload.addEventListener('drop', (e) => {
    e.preventDefault(); exUpload.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setExFile(f);
  });
}
if (exFileInput) {
  exFileInput.addEventListener('change', () => {
    if (exFileInput.files && exFileInput.files[0]) setExFile(exFileInput.files[0]);
  });
}
if (exRePick) {
  exRePick.addEventListener('click', () => exFileInput.click());  // 直接打开选择器，未选择不做任何操作
}

exBtn.addEventListener('click', async () => {
  if (!exFile) { showToast('请先上传一张图片', 'error'); exUpload.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const left   = normalizePad(exLeft.value);
  const top    = normalizePad(exTop.value);
  const right  = normalizePad(exRight.value);
  const bottom = normalizePad(exBottom.value);
  exLeft.value = left; exTop.value = top; exRight.value = right; exBottom.value = bottom;  // 回显校正值
  if (left + top + right + bottom <= 0) {
    showToast('请至少设置一边（左 / 上 / 右 / 下）的扩图像素大于 0', 'error');
    return;
  }
  const task = addExItem(exFile.name, { left, top, right, bottom });
  const fd = new FormData();
  fd.append('file', exFile);
  fd.append('left',   left);
  fd.append('top',    top);
  fd.append('right',  right);
  fd.append('bottom', bottom);
  try {
    const r = await fetch('/api/rh-ex-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setExStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistEx(); openSettings(); return;
    }
    if (d.error) {
      setExStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistEx(); return;
    }
    task.taskId = d.taskId;
    pollExTask(task);
  } catch (e) {
    setExStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistEx();
  }
});

function addExItem(name, pad) {
  exResultCard.hidden = false;
  const task = {
    id: 'x_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, pad, images: [],
    status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  exTasks.unshift(task);
  exItems.prepend(createExItemEl(task));
  updateExMeta();
  persistEx();
  return task;
}
function createExItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const pad = task.pad || {};
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">像素 ' + pad.left + '/' + pad.top + '/' + pad.right + '/' + pad.bottom + ' · ' + time + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'ex';
  task._remove = exRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => exRemove(task));
  if (task.status === 'done') {
    setExStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderExGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setExStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setExStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setExStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function exRemove(task) {
  cancelRhTask(task);
  const i = exTasks.indexOf(task);
  if (i >= 0) exTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateExMeta();
  rebuildExImages();
  persistEx();
  if (!exTasks.length) exResultCard.hidden = true;
}
function updateExMeta() {
  const n = exItems ? exItems.children.length : 0;
  exMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildExImages() {
  exImages = Array.from(exItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistEx() {
  const data = exTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, pad: t.pad, images: t.images,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(EX_STORE_KEY, data);
}
function restoreEx() {
  if (exTasks.length) return;
  const now = Date.now();
  const data = loadList(EX_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(EX_STORE_KEY, []); return; }  // 全部过期：清理缓存
  exTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
  exResultCard.hidden = false;
  exItems.innerHTML = '';
  exTasks.forEach(task => exItems.appendChild(createExItemEl(task)));
  updateExMeta();
  rebuildExImages();
}

async function pollExTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') {
      setNotFoundRecovery(task, task._remove);
      return;
    }
    const em = st.error || '';
    if (em.includes('取消')) { exRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setExStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setExStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setExStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistEx();
      return;
    } else if (st.status === 'done') {
      setExStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderExGrid(task, st.images || []);
      persistEx();
      return;
    }
  }
  setExStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistEx();
}

function renderExGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '扩图结果'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, exImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) exSelected.add(url); else exSelected.delete(url);
      exSaveSel.disabled = exSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildExImages();
}

exSaveSel.addEventListener('click', async () => {
  if (!exSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of exSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'ex_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    exSelected.clear();
    exItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    exSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (exClear) {
  exClear.addEventListener('click', () => {
    exTasks = [];
    exItems.innerHTML = '';
    exImages = [];
    exSelected.clear();
    exSaveSel.disabled = true;
    updateExMeta();
    persistEx();
    exResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  单图指令编辑（RunningHub 图生图工作流 · 图片 #76 · 指令 #109）
// ============================================================
const ieFileInput = document.getElementById('ieFileInput');
const ieUpload = document.getElementById('ieUpload');
const iePreviewWrap = document.getElementById('iePreviewWrap');
const iePreview = document.getElementById('iePreview');
const ieFileName = document.getElementById('ieFileName');
const ieRePick = document.getElementById('ieRePick');
const ieCmd = document.getElementById('ieCmd');
const ieBtn = document.getElementById('ieBtn');
const ieResultCard = document.getElementById('ieResultCard');
const ieMeta = document.getElementById('ieMeta');
const ieItems = document.getElementById('ieItems');
const ieSaveSel = document.getElementById('ieSaveSel');
const iePickDir = document.getElementById('iePickDir');
const ieClear = document.getElementById('ieClear');

let ieFile = null;             // 当前选中的待编辑图片 File
let ieTasks = [];             // 生成任务列表（最新在前）
let ieImages = [];            // 所有结果图片（灯箱用）
let ieSelected = new Set();   // 勾选待批量下载的图片 URL
const IE_STORE_KEY = 'ie_history_v1';

function setIeFile(f) {
  if (!f || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  ieFile = f;
  if (iePreview.src) URL.revokeObjectURL(iePreview.src);
  iePreview.src = URL.createObjectURL(f);
  iePreviewWrap.hidden = false;
  ieUpload.hidden = true;
  ieFileName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
if (ieUpload) {
  ieUpload.addEventListener('click', () => ieFileInput.click());
  ieUpload.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ieFileInput.click(); } });
  ieUpload.addEventListener('dragover', (e) => { e.preventDefault(); ieUpload.classList.add('drag'); });
  ieUpload.addEventListener('dragleave', () => ieUpload.classList.remove('drag'));
  ieUpload.addEventListener('drop', (e) => {
    e.preventDefault(); ieUpload.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setIeFile(f);
  });
}
if (ieFileInput) {
  ieFileInput.addEventListener('change', () => { if (ieFileInput.files && ieFileInput.files[0]) setIeFile(ieFileInput.files[0]); });
}
if (ieRePick) {
  ieRePick.addEventListener('click', () => ieFileInput.click());  // 直接打开选择器，未选择不做任何操作
}

ieBtn.addEventListener('click', async () => {
  if (!ieFile) { showToast('请先上传一张图片', 'error'); ieUpload.scrollIntoView({ behavior: 'smooth' }); return; }
  const cmd = (ieCmd.value || '').trim();
  if (!cmd) { showToast('请输入描述词指令', 'error'); ieCmd.focus(); return; }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const task = addIeItem(ieFile.name, cmd);
  const fd = new FormData();
  fd.append('file', ieFile);
  fd.append('prompt', cmd);
  try {
    const r = await fetch('/api/rh-ie-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setIeStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistIe(); openSettings(); return;
    }
    if (d.error) {
      setIeStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistIe(); return;
    }
    task.taskId = d.taskId;
    pollIeTask(task);
  } catch (e) {
    setIeStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistIe();
  }
});

function addIeItem(name, cmd) {
  ieResultCard.hidden = false;
  const task = {
    id: 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, cmd, images: [],
    status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  ieTasks.unshift(task);
  ieItems.prepend(createIeItemEl(task));
  updateIeMeta();
  persistIe();
  return task;
}
function createIeItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const cmd = task.cmd || '';
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">指令：' + escapeHtml(cmd) + ' · ' + time + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'ie';
  task._remove = ieRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => ieRemove(task));
  if (task.status === 'done') {
    setIeStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderIeGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setIeStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setIeStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setIeStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function ieRemove(task) {
  cancelRhTask(task);
  const i = ieTasks.indexOf(task);
  if (i >= 0) ieTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateIeMeta();
  rebuildIeImages();
  persistIe();
  if (!ieTasks.length) ieResultCard.hidden = true;
}
function updateIeMeta() {
  const n = ieItems ? ieItems.children.length : 0;
  ieMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildIeImages() {
  ieImages = Array.from(ieItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistIe() {
  const data = ieTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, cmd: t.cmd, images: t.images,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(IE_STORE_KEY, data);
}
function restoreIe() {
  if (ieTasks.length) return;
  const now = Date.now();
  const data = loadList(IE_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(IE_STORE_KEY, []); return; }  // 全部过期：清理缓存
  ieTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
  ieResultCard.hidden = false;
  ieItems.innerHTML = '';
  ieTasks.forEach(task => ieItems.appendChild(createIeItemEl(task)));
  updateIeMeta();
  rebuildIeImages();
}

async function pollIeTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') {
      setNotFoundRecovery(task, task._remove);
      return;
    }
    const em = st.error || '';
    if (em.includes('取消')) { ieRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setIeStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setIeStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setIeStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistIe();
      return;
    } else if (st.status === 'done') {
      setIeStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderIeGrid(task, st.images || []);
      persistIe();
      return;
    }
  }
  setIeStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistIe();
}

// 反推提示词类模块（setupReverseModule）的 tasks 数组在其闭包内，通过此注册表暴露给「从后台恢复历史」
const RECOVER_REGISTRY = {};
function registerRecoverModule(kind, getTasks) { RECOVER_REGISTRY[kind] = { getTasks }; }

/* ============ 反推提示词（图片反推 / 视频反推） ============ */
function captureVideoPoster(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const url = URL.createObjectURL(file);
    v.src = url;
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch (e) {} resolve(val); };
    v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) {} };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 320; c.height = v.videoHeight || 180;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/jpeg', 0.7));
      } catch (e) { finish(''); }
    };
    v.onerror = () => finish('');
    setTimeout(() => finish(''), 4000);
  });
}

function setupReverseModule(cfg) {
  const fileInput = document.getElementById(cfg.prefix + 'FileInput');
  const upload = document.getElementById(cfg.prefix + 'Upload');
  const previewWrap = document.getElementById(cfg.prefix + 'PreviewWrap');
  const preview = document.getElementById(cfg.prefix + 'Preview');
  const fileNameEl = document.getElementById(cfg.prefix + 'FileName');
  const rePick = document.getElementById(cfg.prefix + 'RePick');
  const btn = document.getElementById(cfg.prefix + 'Btn');
  const resultCard = document.getElementById(cfg.prefix + 'ResultCard');
  const meta = document.getElementById(cfg.prefix + 'Meta');
  const items = document.getElementById(cfg.prefix + 'Items');
  const clearBtn = document.getElementById(cfg.prefix + 'Clear');

  let file = null;
  let thumbData = '';
  let tasks = [];
  const STORE_KEY = cfg.storeKey;

  function setFile(f) {
    if (!f) return;
    if (cfg.fileKind === 'image' && !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
    if (cfg.fileKind === 'video' && !f.type.startsWith('video/')) { showToast('请选择视频文件', 'error'); return; }
    file = f;
    fileNameEl.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
    if (cfg.fileKind === 'video') {
      captureVideoPoster(f).then(d => { thumbData = d || ''; if (preview) preview.src = thumbData; });
    } else {
      const reader = new FileReader();
      reader.onload = () => { thumbData = reader.result; if (preview) preview.src = thumbData; };
      reader.readAsDataURL(f);
    }
    if (previewWrap) previewWrap.hidden = false;
    if (upload) upload.hidden = true;
  }
  if (upload) {
    upload.addEventListener('click', () => fileInput && fileInput.click());
    upload.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput && fileInput.click(); } });
    upload.addEventListener('dragover', (e) => { e.preventDefault(); upload.classList.add('drag'); });
    upload.addEventListener('dragleave', () => upload.classList.remove('drag'));
    upload.addEventListener('drop', (e) => { e.preventDefault(); upload.classList.remove('drag'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setFile(f); });
  }
  if (fileInput) fileInput.addEventListener('change', () => { if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]); });
  if (rePick) rePick.addEventListener('click', () => fileInput && fileInput.click());

  btn.addEventListener('click', async () => {
    if (!file) { showToast('请先上传' + (cfg.fileKind === 'video' ? '视频' : '图片'), 'error'); if (upload) upload.scrollIntoView({ behavior: 'smooth' }); return; }
    if (!hasRh) { if (rhNotice) rhNotice.hidden = false; if (rhNotice) rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
    const task = addItem(file.name);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(cfg.endpoint, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.error === 'NO_RH_KEY') {
        hasRh = false; renderRhStatus();
        setStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
        persist(); openSettings(); return;
      }
      if (d.error) { setStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persist(); return; }
      task.taskId = d.taskId;
      pollTask(task);
    } catch (e) { setStatus(task, 'err', '请求出错：' + escapeHtml(e.message)); persist(); }
  });

  function addItem(name) {
    resultCard.hidden = false;
    const task = {
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      taskId: null, name, thumb: thumbData, text: '',
      status: 'queued', statusText: '提交中…', ts: Date.now(),
      el: null, statusEl: null, textEl: null
    };
    tasks.unshift(task);
    items.prepend(createItemEl(task));
    updateMeta();
    persist();
    return task;
  }
  function createItemEl(task) {
    const item = document.createElement('div');
    item.className = 'rev-result';
    const time = formatTime(task.ts || Date.now());
    const thumbHtml = task.thumb
      ? '<img class="rev-thumb-img" src="' + task.thumb + '" alt="上传缩略图" />'
      : '<div class="rev-thumb-ph">' + (cfg.fileKind === 'video' ? '视频' : '图片') + '预览</div>';
    item.innerHTML =
      '<div class="rev-result-head">' +
        '<div class="rev-result-info">' +
          '<div class="rev-result-name">' + escapeHtml(task.name) + '</div>' +
          '<div class="rev-result-sub">' + time + '</div>' +
        '</div>' +
        '<button class="rev-del" type="button" title="删除该结果">×</button>' +
      '</div>' +
      '<div class="rev-body">' +
        '<div class="rev-thumb">' + thumbHtml + '</div>' +
        '<div class="rev-text-wrap">' +
          '<div class="rev-text">提交中…</div>' +
          '<div class="rev-actions">' +
            '<button class="btn-ghost sm rev-copy" type="button">复制提示词</button>' +
            '<button class="btn-ghost sm rev-dl" type="button">下载 .txt</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rev-queue">提交中…</div>';
    task.el = item;
    task._kind = cfg.kind;
    task._remove = remove;
    task._persist = persist;
    task._setStatus = setStatus;
    task._renderText = renderText;
    task.statusEl = item.querySelector('.rev-queue');
    task.textEl = item.querySelector('.rev-text');
    item.querySelector('.rev-del').addEventListener('click', () => remove(task));
    item.querySelector('.rev-copy').addEventListener('click', () => copyPrompt(task));
    item.querySelector('.rev-dl').addEventListener('click', () => downloadTxt(task));
    if (task.status === 'done') {
      setStatus(task, 'ok', task.statusText || '生成完成');
      if (task.text) renderText(task, task.text);
    } else if (task.status === 'err') {
      setStatus(task, 'err', task.statusText || '生成失败');
    } else {
      setStatus(task, '', task.statusText || '提交中…');
    }
    return item;
  }
  function setStatus(task, cls, text) {
    if (!task.statusEl) return;
    task.statusEl.className = 'rev-queue' + (cls ? ' ' + cls : '');
    task.statusEl.textContent = text;
    task.statusText = text;
    task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
  }
  function renderText(task, text) {
    if (!task.textEl) return;
    task.text = text;
    task.textEl.textContent = text;
    task.textEl.classList.add('filled');
  }
  async function copyPrompt(task) {
    const text = task.text || '';
    if (!text) { showToast('暂无可复制的提示词', 'error'); return; }
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) {}
      ta.remove();
    }
  }
  function downloadTxt(task) {
    const text = task.text || '';
    if (!text) { showToast('暂无可下载的提示词', 'error'); return; }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (task.name || 'prompt') + '_提示词.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function remove(task) {
    cancelRhTask(task);
    const i = tasks.indexOf(task);
    if (i >= 0) tasks.splice(i, 1);
    if (task.el) task.el.remove();
    updateMeta();
    persist();
    if (!tasks.length) resultCard.hidden = true;
  }
  function updateMeta() { if (meta) meta.textContent = items.children.length ? ('共 ' + items.children.length + ' 组结果') : ''; }
  function persist() {
    const data = tasks
      .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
      .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, thumb: t.thumb, text: t.text,
                   status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
    saveList(STORE_KEY, data);
  }
  function restore() {
    if (tasks.length) return;
    const now = Date.now();
    const data = loadList(STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(STORE_KEY, []); return; }
    tasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, textEl: null }));
    resultCard.hidden = false;
    items.innerHTML = '';
    tasks.forEach(task => items.appendChild(createItemEl(task)));
    updateMeta();
  }
  async function pollTask(task) {
    const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
    while (Date.now() < deadline) {
      if (task.cancelled) return;
      await new Promise(res => setTimeout(res, 1000));
      if (!task.taskId) continue;
      let st;
      try {
        const r = await fetch('/api/rh-task/' + task.taskId);
        st = await r.json();
      } catch (e) { continue; }
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
      if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
      const em = st.error || '';
      if (em.includes('取消')) { remove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      if (st.status === 'queued') {
        setStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
      } else if (st.status === 'running') {
        setStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
      } else if (st.status === 'error') {
        setStatus(task, 'err', '生成失败：' + escapeHtml(em));
        persist();
        return;
      } else if (st.status === 'done') {
        const text = (st.text && st.text.length) ? st.text.join('\n\n') : '';
        setStatus(task, 'ok', '生成完成' + (st.text && st.text.length ? (' · ' + st.text.length + ' 段') : ''));
        renderText(task, text);
        persist();
        return;
      }
    }
    setStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
    persist();
  }
  if (clearBtn) clearBtn.addEventListener('click', () => {
    tasks.slice().forEach(t => { cancelRhTask(t); if (t.el) t.el.remove(); });
    tasks = [];
    items.innerHTML = '';
    resultCard.hidden = true;
    updateMeta();
    persist();
  });
  window[cfg.restoreKey] = restore;
  // 暴露 tasks 数组给「从后台恢复失败记录」功能（RECOVER_REGISTRY）
  registerRecoverModule(cfg.kind, () => tasks);
}

setupReverseModule({ prefix: 'revImg', fileKind: 'image', endpoint: '/api/rh-revimg-generate', storeKey: 'revimg_history_v1', kind: 'revimg', restoreKey: 'revImgRestore' });
setupReverseModule({ prefix: 'revVideo', fileKind: 'video', endpoint: '/api/rh-revvideo-generate', storeKey: 'revvideo_history_v1', kind: 'revvideo', restoreKey: 'revVideoRestore' });

function renderIeGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '编辑结果'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, ieImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) ieSelected.add(url); else ieSelected.delete(url);
      ieSaveSel.disabled = ieSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildIeImages();
}

if (ieSaveSel) {
  ieSaveSel.addEventListener('click', async () => {
    if (!ieSelected.size) return;
    await ensureDirHandle();
    let i = 0; let ok = 0;
    for (const url of ieSelected) {
      i++;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const name = 'ie_' + Date.now() + '_' + i + '.png';
        if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        ok++;
      } catch (e) { /* 单个失败跳过 */ }
    }
    if (ok > 0) {
      showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
      ieSelected.clear();
      ieItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
      ieSaveSel.disabled = true;
    } else {
      showToast('下载失败，请重试', 'error');
    }
  });
}
if (ieClear) {
  ieClear.addEventListener('click', () => {
    ieTasks = [];
    ieItems.innerHTML = '';
    ieImages = [];
    ieSelected.clear();
    ieSaveSel.disabled = true;
    updateIeMeta();
    persistIe();
    ieResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}
bindPickDirBtn(iePickDir);


// ============================================================
//  姿势迁移（RunningHub 图生图工作流 · 人物图 #20 · 姿势参考图 #1）
// ============================================================
function setPoseSlot(kind, f) {
  if (!f || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  const isPerson = kind === 'person';
  if (isPerson) {
    posePerson = f;
    if (posePersonPrev.src) URL.revokeObjectURL(posePersonPrev.src);
    posePersonPrev.src = URL.createObjectURL(f);
    posePersonWrap.hidden = false;
    posePersonUp.hidden = true;
    posePersonName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  } else {
    poseRef = f;
    if (poseRefPrev.src) URL.revokeObjectURL(poseRefPrev.src);
    poseRefPrev.src = URL.createObjectURL(f);
    poseRefWrap.hidden = false;
    poseRefUp.hidden = true;
    poseRefName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  }
}
function bindPoseUpload(up, input, kind) {
  if (!up) return;
  up.addEventListener('click', () => input.click());
  up.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  up.addEventListener('dragover', (e) => { e.preventDefault(); up.classList.add('drag'); });
  up.addEventListener('dragleave', () => up.classList.remove('drag'));
  up.addEventListener('drop', (e) => {
    e.preventDefault(); up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setPoseSlot(kind, f);
  });
  input.addEventListener('change', () => { if (input.files && input.files[0]) setPoseSlot(kind, input.files[0]); });
}
bindPoseUpload(posePersonUp, posePersonInput, 'person');
bindPoseUpload(poseRefUp, poseRefInput, 'ref');
posePersonRePick.addEventListener('click', () => posePersonInput.click());  // 直接打开选择器，未选择不做任何操作
poseRefRePick.addEventListener('click', () => poseRefInput.click());

poseBtn.addEventListener('click', async () => {
  if (!posePerson) { showToast('请先上传人物图片', 'error'); posePersonUp.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!poseRef) { showToast('请先上传姿势参考图', 'error'); poseRefUp.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const task = addPoseItem(posePerson.name + ' → ' + poseRef.name);
  const fd = new FormData();
  fd.append('person', posePerson);
  fd.append('pose', poseRef);
  try {
    const r = await fetch('/api/rh-pose-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setPoseStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistPose(); openSettings(); return;
    }
    if (d.error) { setPoseStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistPose(); return; }
    task.taskId = d.taskId;
    pollPoseTask(task);
  } catch (e) {
    setPoseStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistPose();
  }
});

function addPoseItem(name) {
  poseResultCard.hidden = false;
  const task = {
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  poseTasks.unshift(task);
  poseItems.prepend(createPoseItemEl(task));
  updatePoseMeta();
  persistPose();
  return task;
}
function createPoseItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'pose';
  task._remove = poseRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => poseRemove(task));
  if (task.status === 'done') {
    setPoseStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderPoseGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setPoseStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setPoseStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setPoseStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function poseRemove(task) {
  cancelRhTask(task);
  const i = poseTasks.indexOf(task);
  if (i >= 0) poseTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updatePoseMeta();
  rebuildPoseImages();
  persistPose();
  if (!poseTasks.length) poseResultCard.hidden = true;
}
function updatePoseMeta() {
  const n = poseItems ? poseItems.children.length : 0;
  poseMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildPoseImages() {
  poseImages = Array.from(poseItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistPose() {
  const data = poseTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, images: t.images,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(POSE_STORE_KEY, data);
}
function restorePose() {
  if (poseTasks.length) return;
  const now = Date.now();
  const data = loadList(POSE_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(POSE_STORE_KEY, []); return; }  // 全部过期：清理缓存
  poseTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
  poseResultCard.hidden = false;
  poseItems.innerHTML = '';
  poseTasks.forEach(task => poseItems.appendChild(createPoseItemEl(task)));
  updatePoseMeta();
  rebuildPoseImages();
}

async function pollPoseTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { poseRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setPoseStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setPoseStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setPoseStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistPose();
      return;
    } else if (st.status === 'done') {
      setPoseStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderPoseGrid(task, st.images || []);
      persistPose();
      return;
    }
  }
  setPoseStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistPose();
}

function renderPoseGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '姿势迁移结果'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, poseImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) poseSelected.add(url); else poseSelected.delete(url);
      poseSaveSel.disabled = poseSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildPoseImages();
}

poseSaveSel.addEventListener('click', async () => {
  if (!poseSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of poseSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'pose_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    poseSelected.clear();
    poseItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    poseSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (poseClear) {
  poseClear.addEventListener('click', () => {
    poseTasks = [];
    poseItems.innerHTML = '';
    poseImages = [];
    poseSelected.clear();
    poseSaveSel.disabled = true;
    updatePoseMeta();
    persistPose();
    poseResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  换脸（RunningHub 图生图工作流 · 人物图 #99 · 人脸图 #98）
// ============================================================
function setFsSlot(kind, f) {
  if (!f || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  const isPerson = kind === 'person';
  if (isPerson) {
    fsPerson = f;
    if (fsPersonPrev.src) URL.revokeObjectURL(fsPersonPrev.src);
    fsPersonPrev.src = URL.createObjectURL(f);
    fsPersonWrap.hidden = false;
    fsPersonUp.hidden = true;
    fsPersonName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  } else {
    fsFace = f;
    if (fsFacePrev.src) URL.revokeObjectURL(fsFacePrev.src);
    fsFacePrev.src = URL.createObjectURL(f);
    fsFaceWrap.hidden = false;
    fsFaceUp.hidden = true;
    fsFaceName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
  }
}
function bindFsUpload(up, input, kind) {
  if (!up) return;
  up.addEventListener('click', () => input.click());
  up.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  up.addEventListener('dragover', (e) => { e.preventDefault(); up.classList.add('drag'); });
  up.addEventListener('dragleave', () => up.classList.remove('drag'));
  up.addEventListener('drop', (e) => {
    e.preventDefault(); up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFsSlot(kind, f);
  });
  input.addEventListener('change', () => { if (input.files && input.files[0]) setFsSlot(kind, input.files[0]); });
}
bindFsUpload(fsPersonUp, fsPersonInput, 'person');
bindFsUpload(fsFaceUp, fsFaceInput, 'face');
fsPersonRePick.addEventListener('click', () => fsPersonInput.click());  // 直接打开选择器，未选择不做任何操作
fsFaceRePick.addEventListener('click', () => fsFaceInput.click());

fsBtn.addEventListener('click', async () => {
  if (!fsPerson) { showToast('请先上传人物图片', 'error'); fsPersonUp.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!fsFace) { showToast('请先上传人脸图片', 'error'); fsFaceUp.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const task = addFsItem(fsPerson.name + ' → ' + fsFace.name);
  const fd = new FormData();
  fd.append('person', fsPerson);
  fd.append('face', fsFace);
  try {
    const r = await fetch('/api/rh-faceswap-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setFsStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistFs(); openSettings(); return;
    }
    if (d.error) { setFsStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistFs(); return; }
    task.taskId = d.taskId;
    pollFsTask(task);
  } catch (e) {
    setFsStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistFs();
  }
});

function addFsItem(name) {
  fsResultCard.hidden = false;
  const task = {
    id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, images: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  fsTasks.unshift(task);
  fsItems.prepend(createFsItemEl(task));
  updateFsMeta();
  persistFs();
  return task;
}
function createFsItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'pose';
  task._remove = fsRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => fsRemove(task));
  if (task.status === 'done') {
    setFsStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.images ? task.images.length : 0) + ' 张'));
    if (task.images && task.images.length) renderFsGrid(task, task.images);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setFsStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setFsStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setFsStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function fsRemove(task) {
  cancelRhTask(task);
  const i = fsTasks.indexOf(task);
  if (i >= 0) fsTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateFsMeta();
  rebuildFsImages();
  persistFs();
  if (!fsTasks.length) fsResultCard.hidden = true;
}
function updateFsMeta() {
  const n = fsItems ? fsItems.children.length : 0;
  fsMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildFsImages() {
  fsImages = Array.from(fsItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistFs() {
  const data = fsTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, images: t.images,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(FS_STORE_KEY, data);
}
function restoreFs() {
  if (fsTasks.length) return;
  const now = Date.now();
  const data = loadList(FS_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(FS_STORE_KEY, []); return; }  // 全部过期：清理缓存
  fsTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
  fsResultCard.hidden = false;
  fsItems.innerHTML = '';
  fsTasks.forEach(task => fsItems.appendChild(createFsItemEl(task)));
  updateFsMeta();
  rebuildFsImages();
}

async function pollFsTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { fsRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setFsStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setFsStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setFsStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistFs();
      return;
    } else if (st.status === 'done') {
      setFsStatus(task, 'ok', `生成完成 · ${st.images.length} 张`);
      renderFsGrid(task, st.images || []);
      persistFs();
      return;
    }
  }
  setFsStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistFs();
}

function renderFsGrid(task, images) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.images = images.slice();
  if (!images.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回图片，请稍后重试。</div>';
    return;
  }
  images.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item';
    box.dataset.url = url;

    const img = document.createElement('img');
    img.src = url; img.alt = '换脸结果'; img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(url, fsImages));
    box.appendChild(img);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) fsSelected.add(url); else fsSelected.delete(url);
      fsSaveSel.disabled = fsSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单张');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildFsImages();
}

fsSaveSel.addEventListener('click', async () => {
  if (!fsSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of fsSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'pose_' + Date.now() + '_' + i + '.png';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 张图片` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    fsSelected.clear();
    fsItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    fsSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (fsClear) {
  fsClear.addEventListener('click', () => {
    fsTasks = [];
    fsItems.innerHTML = '';
    fsImages = [];
    fsSelected.clear();
    fsSaveSel.disabled = true;
    updateFsMeta();
    persistFs();
    fsResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

// ============================================================
//  音色克隆（声音生成 · RunningHub 音频工作流 · 音频 #4 · 文本 #11）
// ============================================================
function setVcAudio(f) {
  if (!f) return;
  if (!f.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|webm|amr|sil|aif|aiff)$/i.test(f.name)) {
    showToast('请选择音频文件（MP3 / WAV / M4A 等）', 'error');
    return;
  }
  vcAudio = f;
  if (vcAudioPrev.src) URL.revokeObjectURL(vcAudioPrev.src);
  vcAudioPrev.src = URL.createObjectURL(f);
  vcAudioPrev.load();
  vcAudioWrap.hidden = false;
  vcAudioUp.hidden = true;
  vcAudioName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
function bindVcUpload(up, input) {
  if (!up) return;
  up.addEventListener('click', () => input.click());
  up.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  up.addEventListener('dragover', (e) => { e.preventDefault(); up.classList.add('drag'); });
  up.addEventListener('dragleave', () => up.classList.remove('drag'));
  up.addEventListener('drop', (e) => {
    e.preventDefault(); up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setVcAudio(f);
  });
  input.addEventListener('change', () => { if (input.files && input.files[0]) setVcAudio(input.files[0]); });
}
bindVcUpload(vcAudioUp, vcAudioInput);
vcAudioRePick.addEventListener('click', () => vcAudioInput.click());

// 文本输入字数提示
function updateVcTextTip() {
  if (!vcTextTip || !vcText) return;
  const n = vcText.value.length;
  vcTextTip.textContent = n + ' / ' + VC_MAX_TEXT + ' 字 · 节点 11 · CR Text (兼容文本)';
}
if (vcText) {
  vcText.addEventListener('input', updateVcTextTip);
  updateVcTextTip();
}

vcBtn.addEventListener('click', async () => {
  if (!vcAudio) { showToast('请先上传需要克隆的音频', 'error'); vcAudioUp.scrollIntoView({ behavior: 'smooth' }); return; }
  const text = (vcText.value || '').trim();
  if (!text) { showToast('请输入要合成的文字内容', 'error'); vcText.scrollIntoView({ behavior: 'smooth' }); vcText.focus(); return; }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const display = (text.length > 32 ? text.slice(0, 32) + '…' : text);
  const task = addVcItem(vcAudio.name + ' · ' + display);
  const fd = new FormData();
  fd.append('audio', vcAudio);
  fd.append('text', text);
  try {
    const r = await fetch('/api/rh-voice-clone-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setVcStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistVc(); openSettings(); return;
    }
    if (d.error) { setVcStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistVc(); return; }
    task.taskId = d.taskId;
    pollVcTask(task);
  } catch (e) {
    setVcStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistVc();
  }
});

function addVcItem(name) {
  vcResultCard.hidden = false;
  const task = {
    id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, items: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, listEl: null
  };
  vcTasks.unshift(task);
  vcItems.prepend(createVcItemEl(task));
  updateVcMeta();
  persistVc();
  return task;
}
function createVcItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="vc-audio-list"></div>';
  task.el = item;
  task._kind = 'vc';
  task._remove = vcRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.listEl = item.querySelector('.vc-audio-list');
  item.querySelector('.t2i-del').addEventListener('click', () => vcRemove(task));
  if (task.status === 'done') {
    setVcStatus(task, 'ok', task.statusText || ('克隆完成 · ' + (task.items ? task.items.length : 0) + ' 个音频'));
    if (task.items && task.items.length) renderVcList(task, task.items);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setVcStatus(task, 'err', task.statusText || '克隆失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setVcStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setVcStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function vcRemove(task) {
  cancelRhTask(task);
  const i = vcTasks.indexOf(task);
  if (i >= 0) vcTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateVcMeta();
  rebuildVcImages();
  persistVc();
  if (!vcTasks.length) vcResultCard.hidden = true;
}
function updateVcMeta() {
  const n = vcItems ? vcItems.children.length : 0;
  vcMeta.textContent = n ? ('共 ' + n + ' 组音频') : '';
}
function rebuildVcImages() {
  vcImages = Array.from(vcItems.querySelectorAll('.vc-audio-item')).map(b => b.dataset.url);
}
function persistVc() {
  const data = vcTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, items: t.items,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(VC_STORE_KEY, data);
}
function restoreVc() {
  if (vcTasks.length) return;
  const now = Date.now();
  const data = loadList(VC_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(VC_STORE_KEY, []); return; }
  vcTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, listEl: null }));
  vcResultCard.hidden = false;
  vcItems.innerHTML = '';
  vcTasks.forEach(task => vcItems.appendChild(createVcItemEl(task)));
  updateVcMeta();
  rebuildVcImages();
}

async function pollVcTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { vcRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setVcStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setVcStatus(task, '', `克隆中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setVcStatus(task, 'err', '克隆失败：' + escapeHtml(em));
      persistVc();
      return;
    } else if (st.status === 'done') {
      const urls = (st.images || []).slice();
      // 把字符串视图的项目转换为 {url, name} 形式以便 UI 处理
      task.items = urls.map(u => ({ url: u, name: extractFilename(u) || '克隆结果' }));
      setVcStatus(task, 'ok', `克隆完成 · ${urls.length} 个音频`);
      renderVcList(task, task.items);
      persistVc();
      return;
    }
  }
  setVcStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistVc();
}

// 从 URL 中推断文件名（含后缀）；缺失时给 wav
function extractFilename(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    let n = (u.pathname || '').split('/').pop() || '';
    n = n.split('?')[0].split('#')[0];
    if (n && n.includes('.')) return n;
  } catch (e) {}
  return '';
}
function audioExt(url, blobType) {
  const fn = extractFilename(url);
  if (fn && /\.[A-Za-z0-9]+$/.test(fn)) return fn.match(/\.[A-Za-z0-9]+$/)[0];
  const m = (blobType || '').toLowerCase();
  if (m.includes('mpeg')) return '.mp3';
  if (m.includes('wav'))  return '.wav';
  if (m.includes('flac')) return '.flac';
  if (m.includes('ogg'))  return '.ogg';
  if (m.includes('aac'))  return '.aac';
  if (m.includes('mp4') || m.includes('aac')) return '.m4a';
  return '.wav';
}
function audioFileName(prefix, idx, url, blobType) {
  const ext = audioExt(url, blobType);
  return prefix + '_' + Date.now() + '_' + idx + ext;
}

function renderVcList(task, items) {
  if (!task.listEl) return;
  task.listEl.innerHTML = '';
  if (!items.length) {
    task.listEl.innerHTML = '<div class="dis-error">未返回音频，请稍后重试。</div>';
    return;
  }
  items.forEach((item, i) => {
    const url = item.url;
    const row = document.createElement('div');
    row.className = 'vc-audio-item';
    row.dataset.url = url;

    // 圆形音频图标
    const icon = document.createElement('div');
    icon.className = 'vc-audio-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M5 14V10a7 7 0 0 1 14 0v4M5 14a2 2 0 1 0 4 0M15 14a2 2 0 1 0 4 0M5 14v3a2 2 0 0 0 2 2h1M19 14v3a2 2 0 0 1-2 2h-1" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    row.appendChild(icon);

    // 名称 + 元信息
    const info = document.createElement('div');
    info.className = 'vc-audio-info';
    const name = document.createElement('div');
    name.className = 'vc-audio-name';
    name.title = url;
    name.textContent = item.name || extractFilename(url) || ('音频 ' + (i + 1));
    info.appendChild(name);
    const meta = document.createElement('div');
    meta.className = 'vc-audio-meta';
    meta.textContent = '音频 #' + (i + 1);
    info.appendChild(meta);
    row.appendChild(info);

    // 内联播放器
    const player = document.createElement('audio');
    player.src = url; player.preload = 'metadata'; player.controls = true;
    player.style.maxWidth = '280px';
    player.addEventListener('click', (e) => e.stopPropagation());
    row.appendChild(player);

    // 下载单条按钮
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'vc-audio-action'; dl.setAttribute('aria-label', '下载');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadVcOne(url); });
    row.appendChild(dl);

    // 圆形选择按钮
    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'vc-audio-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = row.classList.toggle('sel');
      if (on) vcSelected.add(url); else vcSelected.delete(url);
      vcSaveSel.disabled = vcSelected.size === 0;
    });
    row.appendChild(pick);

    // 行本体不响应选区（点 audio/icon/player/选区都已是 stopPropagation）；点 row 空白也走选区
    row.addEventListener('click', (e) => {
      const on = row.classList.toggle('sel');
      if (on) vcSelected.add(url); else vcSelected.delete(url);
      vcSaveSel.disabled = vcSelected.size === 0;
    });

    task.listEl.appendChild(row);
  });
  rebuildVcImages();
}

// 单条下载（音频专用：依据 URL/Content-Type 后缀命名）
async function downloadVcOne(url) {
  try {
    await ensureDirHandle();
    const res = await fetch(url);
    if (!res.ok) throw new Error('http ' + res.status);
    const blob = await res.blob();
    const name = audioFileName('vc', 1, url, blob.type);
    if (await saveBlobToDir(blob, name)) { showToast('已下载：' + name); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('已开始下载音频');
  } catch (e) { showToast('下载失败：' + escapeHtml(e.message || '未知错误'), 'error'); }
}

vcSaveSel.addEventListener('click', async () => {
  if (!vcSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of vcSelected) {
    i++;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const name = audioFileName('vc', i, url, blob.type);
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个音频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    vcSelected.clear();
    vcItems.querySelectorAll('.vc-audio-item.sel').forEach(el => el.classList.remove('sel'));
    vcSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (vcClear) {
  vcClear.addEventListener('click', () => {
    vcTasks = [];
    vcItems.innerHTML = '';
    vcImages = [];
    vcSelected.clear();
    vcSaveSel.disabled = true;
    updateVcMeta();
    persistVc();
    vcResultCard.hidden = true;
    showToast('已清空全部克隆结果');
  });
}

// ============================================================
//  三人对话（声音生成 · RunningHub 音频工作流 · 3 段音频 #18/#19/#20 + 文本 #45）
// ============================================================
// 角色参考音频：上传 / 拖拽 / 重选 / 预览（统一循环绑定）
function setTdAudioSlot(slot, f) {
  if (!f) return;
  if (!f.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|webm|amr|sil|aif|aiff)$/i.test(f.name)) {
    showToast('请选择音频文件（MP3 / WAV / M4A 等）', 'error');
    return;
  }
  slot.setFile(f);
  if (slot.prev.src) URL.revokeObjectURL(slot.prev.src);
  slot.prev.src = URL.createObjectURL(f);
  slot.prev.load();
  slot.wrap.hidden = false;
  slot.up.hidden = true;
  slot.name.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
function bindTdAudioSlot(slot) {
  if (!slot.up) return;
  slot.up.addEventListener('click', () => slot.input.click());
  slot.up.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.input.click(); } });
  slot.up.addEventListener('dragover', (e) => { e.preventDefault(); slot.up.classList.add('drag'); });
  slot.up.addEventListener('dragleave', () => slot.up.classList.remove('drag'));
  slot.up.addEventListener('drop', (e) => {
    e.preventDefault(); slot.up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setTdAudioSlot(slot, f);
  });
  slot.input.addEventListener('change', () => { if (slot.input.files && slot.input.files[0]) setTdAudioSlot(slot, slot.input.files[0]); });
  slot.rePick.addEventListener('click', () => slot.input.click());
}
TD_ROLE_SLOTS.forEach(bindTdAudioSlot);

// 对话文本格式校验：每行 [角色1/2/3] 内容，标签后至少 1 个空白，内容非空
function validateTriDialogue(text) {
  const allLines = text.split('\n');
  const errs = [];
  const parsed = [];
  const stats = { 1: 0, 2: 0, 3: 0 };
  let lineNo = 0;
  allLines.forEach((raw) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') return;  // 空行忽略，不计入错误
    lineNo += 1;
    const m = line.match(/^\[角色(1|2|3)\]\s*(.*)$/);
    if (!m) {
      // 区分"角色编号错"和"格式错"
      const wrongRole = line.match(/^\[角色([^\]]+)\]/);
      if (wrongRole) {
        const got = wrongRole[1];
        errs.push('第 ' + lineNo + ' 行：角色编号「' + escapeHtml(got) + '」无效，仅支持 1 / 2 / 3');
      } else {
        const preview = line.length > 24 ? line.slice(0, 24) + '…' : line;
        errs.push('第 ' + lineNo + ' 行格式错误：「' + escapeHtml(preview) + '」应为 [角色1/2/3] + 空格 + 内容');
      }
      parsed.push(null);
      return;
    }
    const role = Number(m[1]);
    const content = m[2].trim();
    if (!content) {
      errs.push('第 ' + lineNo + ' 行：[角色' + role + '] 后内容不能为空');
      parsed.push(null);
      return;
    }
    parsed.push({ role: role, text: content, lineNo: lineNo });
    stats[role] += 1;
  });
  return { ok: errs.length === 0, errs: errs, lines: parsed, stats: stats, totalLines: lineNo };
}
function updateTdFormatUi() {
  if (!tdText || !tdFormatSummary || !tdFormatErrs) return;
  const r = validateTriDialogue(tdText.value || '');
  // 摘要
  if (r.totalLines === 0) {
    tdFormatSummary.className = 'td-format-summary empty';
    tdFormatSummary.textContent = '请输入对话内容，每行 [角色1] / [角色2] / [角色3] + 内容';
  } else if (r.ok) {
    tdFormatSummary.className = 'td-format-summary ok';
    tdFormatSummary.textContent = '✓ 共 ' + r.totalLines + ' 段对话 · 角色1:' + r.stats[1] + ' / 角色2:' + r.stats[2] + ' / 角色3:' + r.stats[3];
  } else {
    tdFormatSummary.className = 'td-format-summary';
    tdFormatSummary.textContent = r.totalLines + ' 段对话（' + r.lines.filter(Boolean).length + ' 段格式正确）· 角色1:' + r.stats[1] + ' / 角色2:' + r.stats[2] + ' / 角色3:' + r.stats[3];
  }
  // 错误列表（最多 6 条，超出显示 "其余 X 条")
  const errs = r.errs;
  if (errs.length === 0) {
    tdFormatErrs.innerHTML = '';
    tdFormatBar.classList.remove('has-err');
    tdText.classList.remove('err');
  } else {
    const head = errs.slice(0, 6).map(e => '<div>' + e + '</div>').join('');
    const more = errs.length > 6 ? '<div>其余 ' + (errs.length - 6) + ' 条错误未显示</div>' : '';
    tdFormatErrs.innerHTML = head + more;
    tdFormatBar.classList.add('has-err');
    tdText.classList.add('err');
  }
  // 字数提示
  if (tdTextTip) tdTextTip.textContent = (tdText.value || '').length + ' / ' + TD_MAX_TEXT + ' 字 · 节点 45 · YC text box';
}
if (tdText) {
  tdText.addEventListener('input', updateTdFormatUi);
  updateTdFormatUi();
}
if (tdFormatHelp) {
  tdFormatHelp.addEventListener('click', () => {
    const example =
      '[角色1] 山无棱，天地合，乃敢与君绝。\n' +
      '[角色2] 停。紫薇姑娘，本府先问你，你可曾在雪山救过一只狐狸？\n' +
      '[角色1] 狐狸？没有啊。不过尔康去长沙了，说是去买酱板鸭。\n' +
      '[角色3] 嘿嘿，包黑炭，听见没？酱板鸭。跟你这张脸一个色号。';
    if (!tdText.value || tdText.value.trim() === '') {
      tdText.value = example;
      updateTdFormatUi();
      showToast('已填入示例对话，可直接修改');
    } else {
      // 已有内容，把示例追加在末尾
      tdText.value = tdText.value.replace(/\s*$/, '') + '\n\n' + example;
      updateTdFormatUi();
      showToast('已追加示例对话到末尾');
    }
    tdText.focus();
  });
}

tdBtn.addEventListener('click', async () => {
  if (!tdAud1) { showToast('请先上传角色 1 的参考音频', 'error'); tdAud1Up.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!tdAud2) { showToast('请先上传角色 2 的参考音频', 'error'); tdAud2Up.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!tdAud3) { showToast('请先上传角色 3 的参考音频', 'error'); tdAud3Up.scrollIntoView({ behavior: 'smooth' }); return; }
  // 提交前再次校验
  const v = validateTriDialogue(tdText.value || '');
  if (!v.ok) {
    showToast('对话内容格式错误：' + (v.errs[0] || '请按 [角色1/2/3] 内容 格式输入'), 'error');
    updateTdFormatUi();
    tdText.scrollIntoView({ behavior: 'smooth' });
    tdText.focus();
    return;
  }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const display = (tdText.value.length > 32 ? tdText.value.slice(0, 32) + '…' : tdText.value.replace(/\s+/g, ' '));
  const task = addTdItem('3人' + v.totalLines + '段 · ' + display);
  const fd = new FormData();
  fd.append('audio1', tdAud1);
  fd.append('audio2', tdAud2);
  fd.append('audio3', tdAud3);
  fd.append('text', tdText.value);
  try {
    const r = await fetch('/api/rh-tri-dialogue-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setTdStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistTd(); openSettings(); return;
    }
    if (d.error) { setTdStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistTd(); return; }
    task.taskId = d.taskId;
    pollTdTask(task);
  } catch (e) {
    setTdStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistTd();
  }
});

function addTdItem(name) {
  tdResultCard.hidden = false;
  const task = {
    id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, items: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, listEl: null
  };
  tdTasks.unshift(task);
  tdItems.prepend(createTdItemEl(task));
  updateTdMeta();
  persistTd();
  return task;
}
function createTdItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="vc-audio-list"></div>';
  task.el = item;
  task._kind = 'td';
  task._remove = tdRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.listEl = item.querySelector('.vc-audio-list');
  item.querySelector('.t2i-del').addEventListener('click', () => tdRemove(task));
  if (task.status === 'done') {
    setTdStatus(task, 'ok', task.statusText || ('合成完成 · ' + (task.items ? task.items.length : 0) + ' 个音频'));
    if (task.items && task.items.length) renderVcList(task, task.items);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setTdStatus(task, 'err', task.statusText || '合成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setTdStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setTdStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function tdRemove(task) {
  cancelRhTask(task);
  const i = tdTasks.indexOf(task);
  if (i >= 0) tdTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateTdMeta();
  rebuildTdImages();
  persistTd();
  if (!tdTasks.length) tdResultCard.hidden = true;
}
function updateTdMeta() {
  const n = tdItems ? tdItems.children.length : 0;
  tdMeta.textContent = n ? ('共 ' + n + ' 组音频') : '';
}
function rebuildTdImages() {
  tdImages = Array.from(tdItems.querySelectorAll('.vc-audio-item')).map(b => b.dataset.url);
}
function persistTd() {
  const data = tdTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, items: t.items,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(TD_STORE_KEY, data);
}
function restoreTd() {
  if (tdTasks.length) return;
  const now = Date.now();
  const data = loadList(TD_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(TD_STORE_KEY, []); return; }
  tdTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, listEl: null }));
  tdResultCard.hidden = false;
  tdItems.innerHTML = '';
  tdTasks.forEach(task => tdItems.appendChild(createTdItemEl(task)));
  updateTdMeta();
  rebuildTdImages();
}

async function pollTdTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { tdRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setTdStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setTdStatus(task, '', `合成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setTdStatus(task, 'err', '合成失败：' + escapeHtml(em));
      persistTd();
      return;
    } else if (st.status === 'done') {
      const urls = (st.images || []).slice();
      task.items = urls.map(u => ({ url: u, name: extractFilename(u) || '对话结果' }));
      setTdStatus(task, 'ok', `合成完成 · ${urls.length} 个音频`);
      renderVcList(task, task.items);
      persistTd();
      return;
    }
  }
  setTdStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistTd();
}

tdSaveSel.addEventListener('click', async () => {
  if (!tdSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of tdSelected) {
    i++;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const name = audioFileName('td', i, url, blob.type);
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个音频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    tdSelected.clear();
    tdItems.querySelectorAll('.vc-audio-item.sel').forEach(el => el.classList.remove('sel'));
    tdSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (tdClear) {
  tdClear.addEventListener('click', () => {
    tdTasks = [];
    tdItems.innerHTML = '';
    tdImages = [];
    tdSelected.clear();
    tdSaveSel.disabled = true;
    updateTdMeta();
    persistTd();
    tdResultCard.hidden = true;
    showToast('已清空全部合成结果');
  });
}

// ============================================================
//  双人对话（声音生成 · RunningHub 音频工作流 · 2 段音频 #17/#18 + 文本 #20）
// ============================================================
function setPdAudioSlot(slot, f) {
  if (!f) return;
  if (!f.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|webm|amr|sil|aif|aiff)$/i.test(f.name)) {
    showToast('请选择音频文件（MP3 / WAV / M4A 等）', 'error');
    return;
  }
  slot.setFile(f);
  if (slot.prev.src) URL.revokeObjectURL(slot.prev.src);
  slot.prev.src = URL.createObjectURL(f);
  slot.prev.load();
  slot.wrap.hidden = false;
  slot.up.hidden = true;
  slot.name.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
function bindPdAudioSlot(slot) {
  if (!slot.up) return;
  slot.up.addEventListener('click', () => slot.input.click());
  slot.up.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.input.click(); } });
  slot.up.addEventListener('dragover', (e) => { e.preventDefault(); slot.up.classList.add('drag'); });
  slot.up.addEventListener('dragleave', () => slot.up.classList.remove('drag'));
  slot.up.addEventListener('drop', (e) => {
    e.preventDefault(); slot.up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setPdAudioSlot(slot, f);
  });
  slot.input.addEventListener('change', () => { if (slot.input.files && slot.input.files[0]) setPdAudioSlot(slot, slot.input.files[0]); });
  slot.rePick.addEventListener('click', () => slot.input.click());
}
PD_ROLE_SLOTS.forEach(bindPdAudioSlot);

// 双人对话文本格式校验：每行 [角色1/2] 内容
function validatePairDialogue(text) {
  const allLines = text.split('\n');
  const errs = [];
  const parsed = [];
  const stats = { 1: 0, 2: 0 };
  let lineNo = 0;
  allLines.forEach((raw) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') return;  // 空行忽略
    lineNo += 1;
    const m = line.match(/^\[角色(1|2)\]\s*(.*)$/);
    if (!m) {
      const wrongRole = line.match(/^\[角色([^\]]+)\]/);
      if (wrongRole) {
        const got = wrongRole[1];
        errs.push('第 ' + lineNo + ' 行：角色编号「' + escapeHtml(got) + '」无效，仅支持 1 / 2');
      } else {
        const preview = line.length > 24 ? line.slice(0, 24) + '…' : line;
        errs.push('第 ' + lineNo + ' 行格式错误：「' + escapeHtml(preview) + '」应为 [角色1/2] + 空格 + 内容');
      }
      parsed.push(null);
      return;
    }
    const role = Number(m[1]);
    const content = m[2].trim();
    if (!content) {
      errs.push('第 ' + lineNo + ' 行：[角色' + role + '] 后内容不能为空');
      parsed.push(null);
      return;
    }
    parsed.push({ role: role, text: content, lineNo: lineNo });
    stats[role] += 1;
  });
  return { ok: errs.length === 0, errs: errs, lines: parsed, stats: stats, totalLines: lineNo };
}
function updatePdFormatUi() {
  if (!pdText || !pdFormatSummary || !pdFormatErrs) return;
  const r = validatePairDialogue(pdText.value || '');
  if (r.totalLines === 0) {
    pdFormatSummary.className = 'td-format-summary empty';
    pdFormatSummary.textContent = '请输入对话内容，每行 [角色1] / [角色2] + 内容';
  } else if (r.ok) {
    pdFormatSummary.className = 'td-format-summary ok';
    pdFormatSummary.textContent = '✓ 共 ' + r.totalLines + ' 段对话 · 角色1:' + r.stats[1] + ' / 角色2:' + r.stats[2];
  } else {
    pdFormatSummary.className = 'td-format-summary';
    pdFormatSummary.textContent = r.totalLines + ' 段对话（' + r.lines.filter(Boolean).length + ' 段格式正确）· 角色1:' + r.stats[1] + ' / 角色2:' + r.stats[2];
  }
  const errs = r.errs;
  if (errs.length === 0) {
    pdFormatErrs.innerHTML = '';
    pdFormatBar.classList.remove('has-err');
    pdText.classList.remove('err');
  } else {
    const head = errs.slice(0, 6).map(e => '<div>' + e + '</div>').join('');
    const more = errs.length > 6 ? '<div>其余 ' + (errs.length - 6) + ' 条错误未显示</div>' : '';
    pdFormatErrs.innerHTML = head + more;
    pdFormatBar.classList.add('has-err');
    pdText.classList.add('err');
  }
  if (pdTextTip) pdTextTip.textContent = (pdText.value || '').length + ' / ' + PD_MAX_TEXT + ' 字 · 节点 20 · YC text box';
}
if (pdText) {
  pdText.addEventListener('input', updatePdFormatUi);
  updatePdFormatUi();
}
if (pdFormatHelp) {
  pdFormatHelp.addEventListener('click', () => {
    const example =
      '[角色1] 山无棱，天地合，乃敢与君绝。\n' +
      '[角色2] 停。紫薇姑娘，本府先问你，你可曾在雪山救过一只狐狸？\n' +
      '[角色1] 狐狸？没有啊。不过尔康去长沙了。';
    if (!pdText.value || pdText.value.trim() === '') {
      pdText.value = example;
      updatePdFormatUi();
      showToast('已填入示例对话，可直接修改');
    } else {
      pdText.value = pdText.value.replace(/\s*$/, '') + '\n\n' + example;
      updatePdFormatUi();
      showToast('已追加示例对话到末尾');
    }
    pdText.focus();
  });
}

pdBtn.addEventListener('click', async () => {
  if (!pdAud1) { showToast('请先上传角色 1 的参考音频', 'error'); pdAud1Up.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!pdAud2) { showToast('请先上传角色 2 的参考音频', 'error'); pdAud2Up.scrollIntoView({ behavior: 'smooth' }); return; }
  const v = validatePairDialogue(pdText.value || '');
  if (!v.ok) {
    showToast('对话内容格式错误：' + (v.errs[0] || '请按 [角色1/2] 内容 格式输入'), 'error');
    updatePdFormatUi();
    pdText.scrollIntoView({ behavior: 'smooth' });
    pdText.focus();
    return;
  }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const display = (pdText.value.length > 32 ? pdText.value.slice(0, 32) + '…' : pdText.value.replace(/\s+/g, ' '));
  const task = addPdItem('2人' + v.totalLines + '段 · ' + display);
  const fd = new FormData();
  fd.append('audio1', pdAud1);
  fd.append('audio2', pdAud2);
  fd.append('text', pdText.value);
  try {
    const r = await fetch('/api/rh-pair-dialogue-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setPdStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistPd(); openSettings(); return;
    }
    if (d.error) { setPdStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistPd(); return; }
    task.taskId = d.taskId;
    pollPdTask(task);
  } catch (e) {
    setPdStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistPd();
  }
});

function addPdItem(name) {
  pdResultCard.hidden = false;
  const task = {
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, items: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, listEl: null
  };
  pdTasks.unshift(task);
  pdItems.prepend(createPdItemEl(task));
  updatePdMeta();
  persistPd();
  return task;
}
function createPdItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="vc-audio-list"></div>';
  task.el = item;
  task._kind = 'pd';
  task._remove = pdRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.listEl = item.querySelector('.vc-audio-list');
  item.querySelector('.t2i-del').addEventListener('click', () => pdRemove(task));
  if (task.status === 'done') {
    setPdStatus(task, 'ok', task.statusText || ('合成完成 · ' + (task.items ? task.items.length : 0) + ' 个音频'));
    if (task.items && task.items.length) renderVcList(task, task.items);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setPdStatus(task, 'err', task.statusText || '合成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setPdStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setPdStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function pdRemove(task) {
  cancelRhTask(task);
  const i = pdTasks.indexOf(task);
  if (i >= 0) pdTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updatePdMeta();
  rebuildPdImages();
  persistPd();
  if (!pdTasks.length) pdResultCard.hidden = true;
}
function updatePdMeta() {
  const n = pdItems ? pdItems.children.length : 0;
  pdMeta.textContent = n ? ('共 ' + n + ' 组音频') : '';
}
function rebuildPdImages() {
  pdImages = Array.from(pdItems.querySelectorAll('.vc-audio-item')).map(b => b.dataset.url);
}
function persistPd() {
  const data = pdTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, items: t.items,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(PD_STORE_KEY, data);
}
function restorePd() {
  if (pdTasks.length) return;
  const now = Date.now();
  const data = loadList(PD_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(PD_STORE_KEY, []); return; }
  pdTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, listEl: null }));
  pdResultCard.hidden = false;
  pdItems.innerHTML = '';
  pdTasks.forEach(task => pdItems.appendChild(createPdItemEl(task)));
  updatePdMeta();
  rebuildPdImages();
}

async function pollPdTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { pdRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setPdStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setPdStatus(task, '', `合成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setPdStatus(task, 'err', '合成失败：' + escapeHtml(em));
      persistPd();
      return;
    } else if (st.status === 'done') {
      const urls = (st.images || []).slice();
      task.items = urls.map(u => ({ url: u, name: extractFilename(u) || '对话结果' }));
      setPdStatus(task, 'ok', `合成完成 · ${urls.length} 个音频`);
      renderVcList(task, task.items);
      persistPd();
      return;
    }
  }
  setPdStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistPd();
}

pdSaveSel.addEventListener('click', async () => {
  if (!pdSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of pdSelected) {
    i++;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const name = audioFileName('pd', i, url, blob.type);
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个音频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    pdSelected.clear();
    pdItems.querySelectorAll('.vc-audio-item.sel').forEach(el => el.classList.remove('sel'));
    pdSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (pdClear) {
  pdClear.addEventListener('click', () => {
    pdTasks = [];
    pdItems.innerHTML = '';
    pdImages = [];
    pdSelected.clear();
    pdSaveSel.disabled = true;
    updatePdMeta();
    persistPd();
    pdResultCard.hidden = true;
    showToast('已清空全部合成结果');
  });
}

// ============================================================
//  方言克隆（声音生成 · RunningHub 工作流 · 主文本 #12 + 拼接参数 #11）
// ============================================================

// 字数提示
if (dcTextArea) {
  dcTextArea.addEventListener('input', () => {
    if (dcTextTip) dcTextTip.textContent = (dcTextArea.value || '').length + ' / ' + DC_MAX_TEXT + ' 字 · 节点 12 · CR Prompt Text';
  });
}

// 渲染 5 组多选项
function renderDcParams() {
  if (!dcParams) return;
  dcParams.innerHTML = '';
  dcParams.className = 'dc-selector-row';
  DC_PARAM_GROUPS.forEach((g) => {
    const picked = dcParamPicked[g.key];
    const item = document.createElement('div');
    item.className = 'dc-selector-item' + (picked ? ' has-val' : '');
    item.dataset.key = g.key;
    item.innerHTML =
      '<div class="dc-selector-label">' + escapeHtml(g.name) + '</div>' +
      '<div class="dc-selector-value">' + escapeHtml(picked || '请选择') + '</div>';
    item.addEventListener('click', (e) => openDcDropdown(g.key, item));
    dcParams.appendChild(item);
  });
}
renderDcParams();

// 方言克隆 · 下拉选择弹窗
let activeDcDropdownKey = null;
let activeDcDropdownAnchor = null;

function openDcDropdown(key, anchor) {
  const g = DC_PARAM_GROUPS.find(x => x.key === key);
  if (!g || !dcDropdown || !dcDropdownTitle || !dcDropdownList) return;
  activeDcDropdownKey = key;
  activeDcDropdownAnchor = anchor;
  dcDropdownTitle.textContent = g.name;
  dcDropdownList.innerHTML = '';
  g.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dc-dropdown-option' + (dcParamPicked[key] === opt ? ' sel' : '');
    btn.textContent = opt;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 单选：再次点击已选项则取消，否则选中
      dcParamPicked[key] = dcParamPicked[key] === opt ? '' : opt;
      renderDcParams();
      updateDcParamsSummary();
      closeDcDropdown();
    });
    dcDropdownList.appendChild(btn);
  });
  dcDropdown.hidden = false;
  positionDcDropdown(anchor);
}

function closeDcDropdown() {
  if (dcDropdown) dcDropdown.hidden = true;
  activeDcDropdownKey = null;
  activeDcDropdownAnchor = null;
}

function positionDcDropdown(anchor) {
  if (!dcDropdown || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const dd = dcDropdown;
  const pad = 6;
  let top = rect.bottom + pad;
  let left = rect.left;
  // 最小宽度对齐锚点
  dd.style.minWidth = rect.width + 'px';
  dd.style.maxWidth = Math.max(220, rect.width) + 'px';
  // 防止超出视口右边界
  const ddRect = dd.getBoundingClientRect();
  const rightOverflow = left + ddRect.width - window.innerWidth;
  if (rightOverflow > 0) left = Math.max(8, left - rightOverflow - 8);
  // 防止超出视口下边界（优先在上方显示）
  const bottomOverflow = top + ddRect.height - window.innerHeight;
  if (bottomOverflow > 0 && rect.top - ddRect.height - pad > 0) {
    top = rect.top - ddRect.height - pad;
  }
  dd.style.top = top + 'px';
  dd.style.left = left + 'px';
}

if (dcDropdownClose) {
  dcDropdownClose.addEventListener('click', (e) => { e.stopPropagation(); closeDcDropdown(); });
}

// 点击下拉外部或切换锚点时关闭
function isInsideDcDropdown(el) {
  return dcDropdown && dcDropdown.contains(el);
}
function isDcDropdownAnchor(el) {
  return el && el.classList && el.classList.contains('dc-selector-item');
}
document.addEventListener('click', (e) => {
  if (!dcDropdown || dcDropdown.hidden) return;
  const target = e.target;
  if (isInsideDcDropdown(target)) return;
  const anchor = target.closest && target.closest('.dc-selector-item');
  if (anchor && anchor.dataset.key === activeDcDropdownKey) return;
  closeDcDropdown();
});
window.addEventListener('resize', () => {
  if (activeDcDropdownAnchor) positionDcDropdown(activeDcDropdownAnchor);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dcDropdown && !dcDropdown.hidden) closeDcDropdown();
});

// 拼接并显示摘要
function getDcParamsJoined() {
  const order = ['gender', 'age', 'dialect', 'tone', 'style'];
  return order.map(k => dcParamPicked[k]).filter(Boolean);
}
function updateDcParamsSummary() {
  if (!dcParamsSummary) return;
  const items = getDcParamsJoined();
  if (items.length === 0) {
    dcParamsSummary.className = 'dc-params-summary empty';
    dcParamsSummary.textContent = '已选 0 项：';
  } else {
    dcParamsSummary.className = 'dc-params-summary ok';
    dcParamsSummary.textContent = '已选 ' + items.length + ' 项：' + items.join(', ');
  }
}
updateDcParamsSummary();

// 复制语气词弹窗：渲染标签列表
function renderDcToneModal() {
  if (!dcToneList) return;
  dcToneList.innerHTML = '';
  DC_TONE_GROUPS.forEach((g) => {
    const grp = document.createElement('div');
    grp.className = 'dc-tone-group';
    grp.innerHTML = '<div class="dc-tone-group-title">' + escapeHtml(g.name) + '</div><div class="dc-tone-list"></div>';
    const list = grp.querySelector('.dc-tone-list');
    g.tags.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'dc-tone-row';
      row.innerHTML =
        '<code>' + escapeHtml(it.tag) + '</code>' +
        '<span class="dc-tone-label">' + escapeHtml(it.label) + '</span>' +
        '<button class="dc-tone-copy" type="button" data-tag="' + escapeHtml(it.tag) + '">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M9 5h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" stroke="#fff" stroke-width="1.6"/><path d="M9 5V3h6v2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>' +
          '<span>复制</span>' +
        '</button>';
      list.appendChild(row);
    });
    dcToneList.appendChild(grp);
  });
}
renderDcToneModal();

function copyDcTone(btn) {
  const tag = btn.dataset.tag || '';
  if (!tag) return;
  // 使用 Clipboard API + textarea fallback
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = tag; ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(tag).catch(fallback);
  } else {
    fallback();
  }
  // 视觉反馈：按钮短暂变绿显示「已复制」
  btn.classList.add('copied');
  const span = btn.querySelector('span');
  const oldText = span ? span.textContent : '';
  if (span) span.textContent = '已复制';
  setTimeout(() => {
    btn.classList.remove('copied');
    if (span) span.textContent = oldText || '复制';
  }, 1200);
  showToast('已复制：' + tag + '（到主内容框选择位置粘贴）');
}

// 弹窗事件：打开 / 关闭 / 点遮罩关闭 / Esc 关闭
function openDcToneModal() {
  if (!dcToneModal) return;
  dcToneModal.hidden = false;
}
function closeDcToneModal() {
  if (!dcToneModal) return;
  dcToneModal.hidden = true;
}
if (dcToneBtn) dcToneBtn.addEventListener('click', openDcToneModal);
if (dcToneClose) dcToneClose.addEventListener('click', closeDcToneModal);
if (dcToneDone) dcToneDone.addEventListener('click', closeDcToneModal);
if (dcToneModal) {
  dcToneModal.addEventListener('click', (e) => {
    if (e.target === dcToneModal) closeDcToneModal();
  });
}
if (dcToneList) {
  dcToneList.addEventListener('click', (e) => {
    const btn = e.target.closest('.dc-tone-copy');
    if (btn) copyDcTone(btn);
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dcToneModal && !dcToneModal.hidden) closeDcToneModal();
});

// 提交
dcBtn.addEventListener('click', async () => {
  const text = (dcTextArea.value || '').trim();
  if (!text) {
    showToast('请输入主内容（节点 12）', 'error');
    dcTextArea.scrollIntoView({ behavior: 'smooth' });
    dcTextArea.focus();
    return;
  }
  const items = getDcParamsJoined();
  if (items.length === 0) {
    showToast('请在下方至少勾选一项参数（节点 11）', 'error');
    dcParams.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const params = items.join(', ');
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const task = addDcItem('「' + params + '」 · ' + (text.length > 24 ? text.slice(0, 24) + '…' : text));
  const fd = new FormData();
  fd.append('text', text);
  fd.append('params', params);
  try {
    const r = await fetch('/api/rh-dialect-clone-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setDcStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistDc(); openSettings(); return;
    }
    if (d.error) { setDcStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistDc(); return; }
    task.taskId = d.taskId;
    pollDcTask(task);
  } catch (e) {
    setDcStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistDc();
  }
});

function addDcItem(name) {
  dcResultCard.hidden = false;
  const task = {
    id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, items: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, listEl: null
  };
  dcTasks.unshift(task);
  dcItems.prepend(createDcItemEl(task));
  updateDcMeta();
  persistDc();
  return task;
}
function createDcItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="vc-audio-list"></div>';
  task.el = item;
  task._kind = 'dc';
  task._remove = dcRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.listEl = item.querySelector('.vc-audio-list');
  item.querySelector('.t2i-del').addEventListener('click', () => dcRemove(task));
  if (task.status === 'done') {
    setDcStatus(task, 'ok', task.statusText || ('合成完成 · ' + (task.items ? task.items.length : 0) + ' 个音频'));
    if (task.items && task.items.length) renderVcList(task, task.items);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setDcStatus(task, 'err', task.statusText || '合成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setDcStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setDcStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function dcRemove(task) {
  cancelRhTask(task);
  const i = dcTasks.indexOf(task);
  if (i >= 0) dcTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateDcMeta();
  rebuildDcImages();
  persistDc();
  if (!dcTasks.length) dcResultCard.hidden = true;
}
function updateDcMeta() {
  const n = dcItems ? dcItems.children.length : 0;
  dcMeta.textContent = n ? ('共 ' + n + ' 组音频') : '';
}
function rebuildDcImages() {
  dcImages = Array.from(dcItems.querySelectorAll('.vc-audio-item')).map(b => b.dataset.url);
}
function persistDc() {
  const data = dcTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, items: t.items,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(DC_STORE_KEY, data);
}
function restoreDc() {
  if (dcTasks.length) return;
  const now = Date.now();
  const data = loadList(DC_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(DC_STORE_KEY, []); return; }
  dcTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, listEl: null }));
  dcResultCard.hidden = false;
  dcItems.innerHTML = '';
  dcTasks.forEach(task => dcItems.appendChild(createDcItemEl(task)));
  updateDcMeta();
  rebuildDcImages();
}

async function pollDcTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { dcRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setDcStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setDcStatus(task, '', `合成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setDcStatus(task, 'err', '合成失败：' + escapeHtml(em));
      persistDc();
      return;
    } else if (st.status === 'done') {
      const urls = (st.images || []).slice();
      task.items = urls.map(u => ({ url: u, name: extractFilename(u) || '克隆结果' }));
      setDcStatus(task, 'ok', `合成完成 · ${urls.length} 个音频`);
      renderVcList(task, task.items);
      persistDc();
      return;
    }
  }
  setDcStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistDc();
}

dcSaveSel.addEventListener('click', async () => {
  if (!dcSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of dcSelected) {
    i++;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const name = audioFileName('dc', i, url, blob.type);
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个音频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    dcSelected.clear();
    dcItems.querySelectorAll('.vc-audio-item.sel').forEach(el => el.classList.remove('sel'));
    dcSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (dcClear) {
  dcClear.addEventListener('click', () => {
    dcTasks = [];
    dcItems.innerHTML = '';
    dcImages = [];
    dcSelected.clear();
    dcSaveSel.disabled = true;
    updateDcMeta();
    persistDc();
    dcResultCard.hidden = true;
    showToast('已清空全部合成结果');
  });
}

// ============================================================
//  音乐翻唱（声音生成 · RunningHub 音频工作流 · 2 段音频 #2/#3）
// ============================================================
const mcAudio1Input = document.getElementById('mcAudio1Input');
const mcAudio1Up = document.getElementById('mcAudio1Up');
const mcAudio1Wrap = document.getElementById('mcAudio1Wrap');
const mcAudio1Prev = document.getElementById('mcAudio1Prev');
const mcAudio1Name = document.getElementById('mcAudio1Name');
const mcAudio1RePick = document.getElementById('mcAudio1RePick');
const mcAudio2Input = document.getElementById('mcAudio2Input');
const mcAudio2Up = document.getElementById('mcAudio2Up');
const mcAudio2Wrap = document.getElementById('mcAudio2Wrap');
const mcAudio2Prev = document.getElementById('mcAudio2Prev');
const mcAudio2Name = document.getElementById('mcAudio2Name');
const mcAudio2RePick = document.getElementById('mcAudio2RePick');
const mcBtn = document.getElementById('mcBtn');
const mcResultCard = document.getElementById('mcResultCard');
const mcMeta = document.getElementById('mcMeta');
const mcItems = document.getElementById('mcItems');
const mcSaveSel = document.getElementById('mcSaveSel');
const mcPickDir = document.getElementById('mcPickDir');
const mcClear = document.getElementById('mcClear');

let mcAudio1 = null;          // 原唱 / 原声 File
let mcAudio2 = null;          // 翻唱 / 参考音色 File
let mcTasks = [];             // 结果模型（newest-first，本地持久化）
let mcSelected = new Set();   // 勾选集合
let mcImages = [];            // 音频 URL 聚合（批量下载用）
const MC_STORE_KEY = 'musiccover_history_v1';

function setMcAudio(slot, f) {
  if (!f) return;
  if (!f.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|webm|amr|sil|aif|aiff)$/i.test(f.name)) {
    showToast('请选择音频文件（MP3 / WAV / M4A 等）', 'error');
    return;
  }
  if (slot === 1) mcAudio1 = f; else mcAudio2 = f;
  const prev = slot === 1 ? mcAudio1Prev : mcAudio2Prev;
  const wrap = slot === 1 ? mcAudio1Wrap : mcAudio2Wrap;
  const up = slot === 1 ? mcAudio1Up : mcAudio2Up;
  const name = slot === 1 ? mcAudio1Name : mcAudio2Name;
  if (prev.src) URL.revokeObjectURL(prev.src);
  prev.src = URL.createObjectURL(f);
  prev.load();
  wrap.hidden = false;
  up.hidden = true;
  name.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
}
function bindMcUpload(up, input, slot) {
  if (!up) return;
  up.addEventListener('click', () => input.click());
  up.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  up.addEventListener('dragover', (e) => { e.preventDefault(); up.classList.add('drag'); });
  up.addEventListener('dragleave', () => up.classList.remove('drag'));
  up.addEventListener('drop', (e) => {
    e.preventDefault(); up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setMcAudio(slot, f);
  });
  input.addEventListener('change', () => { if (input.files && input.files[0]) setMcAudio(slot, input.files[0]); });
}
bindMcUpload(mcAudio1Up, mcAudio1Input, 1);
bindMcUpload(mcAudio2Up, mcAudio2Input, 2);
if (mcAudio1RePick) mcAudio1RePick.addEventListener('click', () => mcAudio1Input.click());
if (mcAudio2RePick) mcAudio2RePick.addEventListener('click', () => mcAudio2Input.click());

mcBtn.addEventListener('click', async () => {
  if (!mcAudio1) { showToast('请先上传原唱 / 原声音频（节点 2）', 'error'); if (mcAudio1Up) mcAudio1Up.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!mcAudio2) { showToast('请先上传翻唱 / 参考原声音频（节点 3）', 'error'); if (mcAudio2Up) mcAudio2Up.scrollIntoView({ behavior: 'smooth' }); return; }
  if (!hasRh) { rhNotice.hidden = false; rhNotice.scrollIntoView({ behavior: 'smooth' }); openSettings(); return; }
  const task = addMcItem((mcAudio1.name || '原声') + ' × ' + (mcAudio2.name || '参考音色'));
  const fd = new FormData();
  fd.append('audio1', mcAudio1);
  fd.append('audio2', mcAudio2);
  try {
    const r = await fetch('/api/rh-music-cover-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setMcStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistMc(); openSettings(); return;
    }
    if (d.error) { setMcStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误')); persistMc(); return; }
    task.taskId = d.taskId;
    pollMcTask(task);
  } catch (e) {
    setMcStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistMc();
  }
});

function addMcItem(name) {
  mcResultCard.hidden = false;
  const task = {
    id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, name, items: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, listEl: null
  };
  mcTasks.unshift(task);
  mcItems.prepend(createMcItemEl(task));
  updateMcMeta();
  persistMc();
  return task;
}
function createMcItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt">' + escapeHtml(task.name) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="vc-audio-list"></div>';
  task.el = item;
  task._kind = 'mc';
  task._remove = mcRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.listEl = item.querySelector('.vc-audio-list');
  item.querySelector('.t2i-del').addEventListener('click', () => mcRemove(task));
  if (task.status === 'done') {
    setMcStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.items ? task.items.length : 0) + ' 个音频'));
    if (task.items && task.items.length) renderMcList(task, task.items);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setMcStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setMcStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}
function setMcStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function mcRemove(task) {
  cancelRhTask(task);
  const i = mcTasks.indexOf(task);
  if (i >= 0) mcTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateMcMeta();
  rebuildMcImages();
  persistMc();
  if (!mcTasks.length) mcResultCard.hidden = true;
}
function updateMcMeta() {
  const n = mcItems ? mcItems.children.length : 0;
  mcMeta.textContent = n ? ('共 ' + n + ' 组音频') : '';
}
function rebuildMcImages() {
  mcImages = Array.from(mcItems.querySelectorAll('.vc-audio-item')).map(b => b.dataset.url);
}
function persistMc() {
  const data = mcTasks
    .filter(t => (t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled')) && Date.now() - (t.ts || 0) < EXPIRY_MS)
    .map(t => ({ id: t.id, taskId: t.taskId, name: t.name, items: t.items,
                status: t.status, statusText: t.statusText, ts: t.ts, rhTaskId: t.rhTaskId }));
  saveList(MC_STORE_KEY, data);
}
function restoreMc() {
  if (mcTasks.length) return;
  const now = Date.now();
  const data = loadList(MC_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
  if (!data.length) { saveList(MC_STORE_KEY, []); return; }
  mcTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, listEl: null }));
  mcResultCard.hidden = false;
  mcItems.innerHTML = '';
  mcTasks.forEach(task => mcItems.appendChild(createMcItemEl(task)));
  updateMcMeta();
  rebuildMcImages();
}
function renderMcList(task, items) {
  if (!task.listEl) return;
  task.listEl.innerHTML = '';
  if (!items.length) {
    task.listEl.innerHTML = '<div class="dis-error">未返回音频，请稍后重试。</div>';
    return;
  }
  items.forEach((item, i) => {
    const url = item.url;
    const row = document.createElement('div');
    row.className = 'vc-audio-item';
    row.dataset.url = url;
    const icon = document.createElement('div');
    icon.className = 'vc-audio-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M5 14V10a7 7 0 0 1 14 0v4M5 14a2 2 0 1 0 4 0M15 14a2 2 0 1 0 4 0M5 14v3a2 2 0 0 0 2 2h1M19 14v3a2 2 0 0 1-2 2h-1" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    row.appendChild(icon);
    const info = document.createElement('div');
    info.className = 'vc-audio-info';
    const name = document.createElement('div');
    name.className = 'vc-audio-name';
    name.title = url;
    name.textContent = item.name || extractFilename(url) || ('音频 ' + (i + 1));
    info.appendChild(name);
    const meta = document.createElement('div');
    meta.className = 'vc-audio-meta';
    meta.textContent = '音频 #' + (i + 1);
    info.appendChild(meta);
    row.appendChild(info);
    const player = document.createElement('audio');
    player.src = url; player.preload = 'metadata'; player.controls = true;
    player.style.maxWidth = '280px';
    player.addEventListener('click', (e) => e.stopPropagation());
    row.appendChild(player);
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'vc-audio-action'; dl.setAttribute('aria-label', '下载');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadMcOne(url); });
    row.appendChild(dl);
    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'vc-audio-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = row.classList.toggle('sel');
      if (on) mcSelected.add(url); else mcSelected.delete(url);
      mcSaveSel.disabled = mcSelected.size === 0;
    });
    row.appendChild(pick);
    row.addEventListener('click', (e) => {
      const on = row.classList.toggle('sel');
      if (on) mcSelected.add(url); else mcSelected.delete(url);
      mcSaveSel.disabled = mcSelected.size === 0;
    });
    task.listEl.appendChild(row);
  });
  rebuildMcImages();
}
async function downloadMcOne(url) {
  try {
    await ensureDirHandle();
    const res = await fetch(url);
    if (!res.ok) throw new Error('http ' + res.status);
    const blob = await res.blob();
    const name = audioFileName('mc', 1, url, blob.type);
    if (await saveBlobToDir(blob, name)) { showToast('已下载：' + name); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('已开始下载音频');
  } catch (e) { showToast('下载失败：' + escapeHtml(e.message || '未知错误'), 'error'); }
}
mcSaveSel.addEventListener('click', async () => {
  if (!mcSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of mcSelected) {
    i++;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const name = audioFileName('mc', i, url, blob.type);
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个音频` + (t2iDirHandle ? '（已选择目录，已保存）' : '（浏览器下载）'));
    mcSelected.clear();
    mcItems.querySelectorAll('.vc-audio-item.sel').forEach(el => el.classList.remove('sel'));
    mcSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});
if (mcClear) {
  mcClear.addEventListener('click', () => {
    mcTasks = [];
    mcItems.innerHTML = '';
    mcImages = [];
    mcSelected.clear();
    mcSaveSel.disabled = true;
    updateMcMeta();
    persistMc();
    mcResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}
bindPickDirBtn(mcPickDir);
async function pollMcTask(task) {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
    } catch (e) { continue; }
    if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    const em = st.error || '';
    if (em.includes('取消')) { mcRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
    if (st.status === 'queued') {
      setMcStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setMcStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      setMcStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistMc();
      return;
    } else if (st.status === 'done') {
      const urls = (st.images || []).slice();
      task.items = urls.map(u => ({ url: u, name: extractFilename(u) || '音乐翻唱结果' }));
      setMcStatus(task, 'ok', `生成完成 · ${urls.length} 个音频`);
      renderMcList(task, task.items);
      persistMc();
      return;
    }
  }
  setMcStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistMc();
}

// ---------- 灯箱：放大查看 + 方向键无限循环（>2 张时） ----------
let lbImages = [];  // 当前灯箱使用的图片列表（文生图 / 修脸磨皮 / 高清放大 / 多视图 / 参考图生图共用同一灯箱）
function openLightbox(url, list) {
  lbImages = (list && list.length) ? list : t2iImages;
  let idx = lbImages.indexOf(url);
  // 传入的列表可能因后续渲染被重建（引用过期），回退到全局列表再找一次
  if (idx < 0 && list && list !== t2iImages) {
    lbImages = t2iImages;
    idx = lbImages.indexOf(url);
  }
  if (idx < 0) return;
  lightbox.hidden = false;
  // 所有生成结果图片点开均支持方向箭头切换（单张时箭头可见、循环原地；多张正常切换）
  lbPrev.hidden = false;
  lbNext.hidden = false;
  lbTip.style.display = lbImages.length > 1 ? '' : 'none';
  showLightboxImage(idx);
}
function closeLightbox() {
  lightbox.hidden = true;
  lbImg.src = '';
}
function showLightboxImage(idx) {
  const n = lbImages.length;
  if (!n) return;
  idx = ((idx % n) + n) % n;  // 无限循环：首尾环绕
  lbIndex = idx;
  lbImg.src = lbImages[idx];
  lbCount.textContent = (idx + 1) + ' / ' + n;
}
if (lbClose) lbClose.addEventListener('click', closeLightbox);
if (lightbox) {
  const lbOv = lightbox.querySelector('.lb-overlay');
  if (lbOv) lbOv.addEventListener('click', closeLightbox);
}
if (lbPrev) lbPrev.addEventListener('click', () => showLightboxImage(lbIndex - 1));
if (lbNext) lbNext.addEventListener('click', () => showLightboxImage(lbIndex + 1));

// 键盘：打开灯箱后 ← → 始终可无限循环切换；Esc 关闭
document.addEventListener('keydown', (e) => {
  if (!lightbox.hidden) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showLightboxImage(lbIndex - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); showLightboxImage(lbIndex + 1); return; }
    if (e.key === 'Escape') { closeLightbox(); return; }
  }
  if (mvLightbox && !mvLightbox.hidden && e.key === 'Escape') { closeMvLightbox(); }
});

// 时长格式化：秒 → "X 分 X 秒"
function fmtDur(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  if (s < 60) return s + ' 秒';
  return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
}

// 通用：从 RunningHub 后台恢复已生成的任务结果（用于"任务丢失"卡片）
function setNotFoundRecovery(task, removeFn) {
  if (!task.statusEl) return;
  task.status = 'err';
  task.statusText = '任务丢失 · 可从 RunningHub 后台恢复';
  task.statusEl.className = 't2i-queue err';
  task.statusEl.innerHTML = '';
  const txt = document.createElement('span');
  txt.textContent = '任务丢失 · 可从 RunningHub 后台恢复';
  task.statusEl.appendChild(txt);
  const acts = document.createElement('span');
  acts.className = 'rh-recover-actions';
  const btnR = document.createElement('button');
  btnR.type = 'button'; btnR.className = 'btn-ghost sm'; btnR.textContent = '从后台恢复';
  btnR.onclick = () => doRecover(task);
  const btnD = document.createElement('button');
  btnD.type = 'button'; btnD.className = 'btn-ghost sm danger'; btnD.textContent = '删除该条';
  btnD.onclick = () => removeFn(task);
  acts.appendChild(btnR); acts.appendChild(btnD);
  task.statusEl.appendChild(acts);
}
async function doRecover(task) {
  if (!task.statusEl || !task.taskId) return;
  task.statusEl.className = 't2i-queue';
  task.statusEl.textContent = '正在从 RunningHub 后台恢复…';
  try {
    const r = await fetch('/api/rh-recover', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({taskId: task.taskId, rhTaskId: task.rhTaskId || ''}) });
    const d = await r.json();
    if (d.error) {
      setNotFoundRecovery(task, task._remove);
      const noun = ['mv','ff','lf','bf','mr'].includes(task._kind) ? '视频'
                 : ['dc','mc','vc','td','pd'].includes(task._kind) ? '音频'
                 : '图片';
      const msg = d.error === 'NOT_FOUND' ? 'RunningHub 后台无此任务或已被取消'
              : d.error === 'NO_IMAGES' ? `后台任务尚未产出${noun}（可能仍在执行）`
              : '恢复失败：' + (d.message || d.error);
      showToast(msg, 'error'); return;
    }
    applyRecovered(task, d, false);
  } catch (e) {
    setNotFoundRecovery(task, task._remove);
    showToast('恢复请求失败：' + (e.message || e), 'error');
  }
}

// 把后台查询结果渲染到结果卡片并写入本地历史（doRecover 单条恢复 与 recoverFailed 批量恢复共用）
function applyRecovered(task, d, silent) {
  task.images = d.images;
  const kind = task._kind, n = d.images ? d.images.length : 0;
  if (kind === 't2i')  { renderT2iGrid(task, d.images);  setItemStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistT2i(); }
  else if (kind === 'face') { renderFaceGrid(task, d.images); setFaceStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistFace(); }
  else if (kind === 'hd')   { renderHdGrid(task, d.images);   setHdStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistHd(); }
  else if (kind === 'mv')   { renderMvGrid(task, d.images);   setMvStatus(task, 'ok', '从后台恢复 · ' + n + ' 个视频'); persistMv(); }
  else if (kind === 'ff')   { renderFfGrid(task, d.images);   setFfStatus(task, 'ok', '从后台恢复 · ' + n + ' 个视频'); persistFf(); }
  else if (kind === 'lf')   { renderLfGrid(task, d.images);   setLfStatus(task, 'ok', '从后台恢复 · ' + n + ' 个视频'); persistLf(); }
  else if (kind === 'bf')   { renderBfGrid(task, d.images);   setBfStatus(task, 'ok', '从后台恢复 · ' + n + ' 个视频'); persistBf(); }
  else if (kind === 'mr')   { renderMrGrid(task, d.images);   setMrStatus(task, 'ok', '从后台恢复 · ' + n + ' 个视频'); persistMr(); }
  else if (kind === 'ref')  { renderRefGrid(task, d.images);  setRefStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistRef(); }
  else if (kind === 'pose') { renderPoseGrid(task, d.images); setPoseStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistPose(); }
  else if (kind === 'fs') { renderFsGrid(task, d.images); setFsStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistFs(); }
  else if (kind === 'dc') { renderVcList(task, (d.images || []).map(u => ({ url: u, name: extractFilename(u) || '克隆结果' }))); setDcStatus(task, 'ok', '从后台恢复 · ' + (d.images || []).length + ' 个音频'); persistDc(); if (!silent) showToast('已从 RunningHub 后台恢复 ' + (d.images || []).length + ' 个音频'); return; }
  else if (kind === 'mc') { renderMcList(task, (d.images || []).map(u => ({ url: u, name: extractFilename(u) || '音乐翻唱结果' }))); setMcStatus(task, 'ok', '从后台恢复 · ' + (d.images || []).length + ' 个音频'); persistMc(); if (!silent) showToast('已从 RunningHub 后台恢复 ' + (d.images || []).length + ' 个音频'); return; }
  else if (kind === 'ie') { renderIeGrid(task, d.images); setIeStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistIe(); }
  else if (kind === 'ir' || kind === 'pr') { renderT2iGrid(task, d.images); setItemStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); if (kind === 'ir') persistIr(); else persistPr(); }
  else if (kind === 'a2r') { renderT2iGrid(task, d.images); setItemStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistA2r(); }
  else if (kind === 'ex') { renderExGrid(task, d.images); setExStatus(task, 'ok', '从后台恢复 · ' + n + ' 张'); persistEx(); }
  else if (kind === 'vc') { task.items = (d.images || []).map(u => ({ url: u, name: extractFilename(u) || '克隆结果' })); setVcStatus(task, 'ok', '从后台恢复 · ' + n + ' 个音频'); renderVcList(task, task.items); persistVc(); }
  else if (kind === 'td') { task.items = (d.images || []).map(u => ({ url: u, name: extractFilename(u) || '对话结果' })); setTdStatus(task, 'ok', '从后台恢复 · ' + n + ' 个音频'); renderVcList(task, task.items); persistTd(); }
  else if (kind === 'pd') { task.items = (d.images || []).map(u => ({ url: u, name: extractFilename(u) || '对话结果' })); setPdStatus(task, 'ok', '从后台恢复 · ' + n + ' 个音频'); renderVcList(task, task.items); persistPd(); }
  else if (kind === 'revimg' || kind === 'revvideo') {
    const text = (d.text && d.text.length) ? d.text.join('\n\n') : '';
    if (task._renderText) task._renderText(task, text);
    if (task._setStatus) task._setStatus(task, 'ok', '从后台恢复 · ' + (d.text ? d.text.length : 0) + ' 段');
    if (task._persist) task._persist();
    if (!silent) showToast('已从 RunningHub 后台恢复 ' + (d.text ? d.text.length : 0) + ' 段提示词');
    return;
  }
  if (!silent) showToast('已从 RunningHub 后台恢复 ' + n + ' 张');
}

// ---------- 从后台恢复「失败记录」（按模块本地失败记录 + 当前工作流精确筛选）----------
// 各模块工作流 ID（与 server.py 常量一致）：后端按此精确筛选，只恢复本工作流的产出
const RECOVER_WORKFLOW = {
  t2i: '2091149048991535105', a2r: '2091929488073510913', ir: '2092246175167635458',
  pr: '2092266903032131585', face: '2091148461554094081', hd: '2091150179964641282',
  mv: '2085959960034369537', ref: '2091287667165192193', ex: '2091453572989935617',
  pose: '2091474803222990849', fs: '2091497289591377922', ie: '2091606640134017026',
  revimg: '2092163863813906434', revvideo: '2092180296031625218',
  vc: '2091508862775025666', mc: '2091508595526553601', td: '2091511273379950594',
  pd: '2091537765040218113', dc: '2091535562455994370',
  ff: '2085960023406104577', lf: '2085960023406104577', bf: '2092329310479798273',
  mr: '2090375516497997826'
};
// 图片类工作流出图节点（SaveImage）；为空则不按节点过滤，仅按 workflowId 精确筛选
const RECOVER_OUTPUT_NODE = { ir: '256', pr: '256' };
const MODULE_LABEL = {
  t2i: '文生图', a2r: '动漫转真人', ir: '图片洗稿', pr: '人像摄影', face: '修脸磨皮',
  hd: '高清放大', mv: '姿势迁移', ref: '参考重绘', ex: '扩图', pose: '姿势生成',
  fs: '面部同步', ie: '单图指令编辑', revimg: '图片反推', revvideo: '视频反推',
  vc: '声音克隆', mc: '音乐翻唱', td: '语音对话', pd: '照片数字人', dc: '数字人克隆',
  ff: '首帧生视频', lf: '尾帧生视频', bf: '首尾帧生视频',
  mr: '全能参考双模双采生视频'
};

// 动态取各模块任务数组（let 变量在调用时解析，兼容 restoreXxx 的重新赋值）
function getModuleTasks(kind) {
  if (kind === 'revimg' || kind === 'revvideo') {
    const reg = RECOVER_REGISTRY[kind];
    return reg ? reg.getTasks() : [];
  }
  switch (kind) {
    case 't2i': return t2iTasks;
    case 'a2r': return a2rTasks;
    case 'ir': return irTasks;
    case 'pr': return prTasks;
    case 'face': return faceTasks;
    case 'hd': return hdTasks;
    case 'ex': return exTasks;
    case 'pose': return poseTasks;
    case 'fs': return fsTasks;
    case 'vc': return vcTasks;
    case 'td': return tdTasks;
    case 'pd': return pdTasks;
    case 'dc': return dcTasks;
    case 'mv': return mvTasks;
    case 'ref': return refTasks;
    case 'ie': return ieTasks;
    case 'mc': return mcTasks;
    case 'ff': return ffTasks;
    case 'lf': return lfTasks;
    case 'bf': return bfTasks;
    case 'mr': return mrTasks;
    default: return [];
  }
}

// 从后台恢复：本模块本地「生成失败」且带 RunningHub 任务 ID 的记录 → 按当前工作流精确查询后台 → 渲染并落盘
async function recoverFailed(kind) {
  const tasks = getModuleTasks(kind);
  if (!tasks || !tasks.length) { showToast('暂无本地记录', 'error'); return; }
  const failed = tasks.filter(t => t.status === 'err' && (t.rhTaskId || t.taskId));
  if (!failed.length) { showToast('没有需要恢复的失败记录', 'error'); return; }
  if (!confirm('将恢复「' + (MODULE_LABEL[kind] || kind) + '」本地记录中 ' + failed.length
             + ' 条生成失败的记录（仅限本工作流），是否继续？')) return;
  const payload = {
    workflowId: RECOVER_WORKFLOW[kind] || '',
    outputNode: RECOVER_OUTPUT_NODE[kind] || '',
    tasks: failed.map(t => ({ rhTaskId: t.rhTaskId || '', localId: t.id }))
  };
  failed.forEach(t => { if (t.statusEl) { t.statusEl.className = 't2i-queue'; t.statusEl.textContent = '恢复中…'; } });
  try {
    const r = await fetch('/api/rh-recover-batch', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    if (d.error) { showToast('恢复失败：' + (d.message || d.error), 'error'); return; }
    const recovered = d.items || [];
    const recMap = {};
    recovered.forEach(it => { if (it.localId) recMap[it.localId] = it; });
    let ok = 0, skip = 0;
    for (const t of failed) {
      const item = recMap[t.id];
      if (!item || ((!item.images || !item.images.length) && !item.text)) { skip++; continue; }
      applyRecovered(t, item, true);
      ok++;
    }
    const msg = '已从 RunningHub 后台恢复 ' + ok + ' 条失败记录'
              + (skip ? '；' + skip + ' 条仍无产出（可能仍在后台运行或已过期）' : '');
    showToast(msg, ok ? undefined : 'error');
  } catch (e) {
    showToast('恢复请求失败：' + (e.message || e), 'error');
  }
}

// 为每个 RunningHub 生成结果模块注入「从后台恢复历史」按钮（位于其「清空生成结果」按钮之前）
function setupRecoverButtons() {
  const defs = [
    { kind: 't2i',  clearId: 't2iClear' },
    { kind: 'a2r',  clearId: 'a2rClear' },
    { kind: 'face', clearId: 'faceClear' },
    { kind: 'hd',   clearId: 'hdClear' },
    { kind: 'mv',   clearId: 'mvClear' },
    { kind: 'ref',  clearId: 'refClear' },
    { kind: 'ex',   clearId: 'exClear' },
    { kind: 'pose', clearId: 'poseClear' },
    { kind: 'fs',   clearId: 'fsClear' },
    { kind: 'ie',   clearId: 'ieClear' },
    { kind: 'revimg',  clearId: 'revImgClear' },
    { kind: 'revvideo', clearId: 'revVideoClear' },
    { kind: 'vc',   clearId: 'vcClear' },
    { kind: 'mc',   clearId: 'mcClear' },
    { kind: 'td',   clearId: 'tdClear' },
    { kind: 'pd',   clearId: 'pdClear' },
    { kind: 'dc',   clearId: 'dcClear' },
    { kind: 'ff',   clearId: 'ffClear' },
    { kind: 'lf',   clearId: 'lfClear' },
    { kind: 'bf',   clearId: 'bfClear' },
    { kind: 'mr',   clearId: 'mrClear' }
  ];
  for (const def of defs) {
    const clear = document.getElementById(def.clearId);
    if (!clear || clear.parentElement.querySelector('.btn-recover-hist')) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost sm btn-recover-hist';
    btn.textContent = '从后台恢复历史';
    btn.title = '仅恢复本模块本地「生成失败」且匹配当前工作流的记录（从 RunningHub 后台拉取结果）';
    btn.addEventListener('click', () => recoverFailed(def.kind));
    clear.parentElement.insertBefore(btn, clear);
  }
}

// RunningHub 生成图片/视频链接有效期 14 天：记录同步保留 14 天，过期自动清除
const EXPIRY_MS = 14 * 24 * 3600 * 1000;
function expiryText(ts) {
  const exp = (ts || Date.now()) + EXPIRY_MS;
  const remain = Math.ceil((exp - Date.now()) / (24 * 3600 * 1000));
  if (remain <= 0) return '<span class="exp-badge exp-dead">链接已过期</span>';
  if (remain <= 7) return '<span class="exp-badge exp-warn">链接剩 ' + remain + ' 天</span>';
  return '<span class="exp-badge">链接有效期 14 天</span>';
}

// ---------- 全局轻提示 toast ----------
let toastTimer = null;
function showToast(msg, type) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('error');
  if (type === 'error') toast.classList.add('error');
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

checkRh();
// 为每个 RunningHub 生成结果模块注入「从后台恢复历史」按钮（恢复本模块失败记录）
setupRecoverButtons();

// ============================================================
//  首帧生视频（RunningHub 工作流 2085960023406104577 ·
//   首帧图 #4 · 提示词/比例/缩放 #38 · 时长 #42 · Plus 队列）
//  右侧 UI 与文生视频一致，仅在提示词上方增加「上传首帧参考图片」。
// ============================================================
const ffPrompt = document.getElementById('ffPrompt');
const ffDuration = document.getElementById('ffDuration');
const ffRatio = document.getElementById('ffRatio');
const ffScale = document.getElementById('ffScale');
const ffBtn = document.getElementById('ffBtn');
const ffResultCard = document.getElementById('ffResultCard');
const ffMeta = document.getElementById('ffMeta');
const ffItems = document.getElementById('ffItems');
const ffSaveSel = document.getElementById('ffSaveSel');
const ffClear = document.getElementById('ffClear');
const ffUpload = document.getElementById('ffUpload');
const ffFileInput = document.getElementById('ffFileInput');
const ffPreviewWrap = document.getElementById('ffPreviewWrap');
const ffPreview = document.getElementById('ffPreview');
const ffFileName = document.getElementById('ffFileName');
const ffRePick = document.getElementById('ffRePick');
let ffImageFile = null;

// 生成时长：只能输入数字；失焦时自动纠到 [4,15]
if (ffDuration) {
  ffDuration.addEventListener('input', () => { ffDuration.value = ffDuration.value.replace(/[^0-9]/g, ''); });
  ffDuration.addEventListener('blur', () => {
    let v = parseInt(ffDuration.value, 10);
    if (isNaN(v)) v = 4;
    if (v < 4) v = 4;
    if (v > 15) v = 15;
    ffDuration.value = String(v);
  });
}

function setFfFile(f) {
  if (!f || !f.type || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  ffImageFile = f;
  ffUpload.style.borderColor = '';
  const reader = new FileReader();
  reader.onload = (e) => { ffPreview.src = e.target.result; };
  reader.readAsDataURL(f);
  ffFileName.textContent = f.name;
  ffUpload.hidden = true;
  ffPreviewWrap.hidden = false;
}
if (ffFileInput) ffFileInput.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) setFfFile(e.target.files[0]); });
if (ffUpload) {
  ffUpload.addEventListener('click', () => { if (ffFileInput) ffFileInput.click(); });
  ffUpload.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (ffFileInput) ffFileInput.click(); } });
  ['dragover', 'dragenter'].forEach(ev => ffUpload.addEventListener(ev, (e) => { e.preventDefault(); ffUpload.style.borderColor = '#0052D9'; }));
  ['dragleave', 'drop'].forEach(ev => ffUpload.addEventListener(ev, (e) => { e.preventDefault(); ffUpload.style.borderColor = ''; }));
  ffUpload.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setFfFile(f); });
}
if (ffRePick) ffRePick.addEventListener('click', () => { if (ffFileInput) ffFileInput.click(); });

ffBtn.addEventListener('click', async () => {
  const prompt = ffPrompt.value.trim();
  if (!ffImageFile) { ffUpload.style.borderColor = '#d93025'; showToast('请先上传首帧参考图片（节点 4）', 'error'); return; }
  if (!prompt) { ffPrompt.focus(); ffPrompt.style.borderColor = '#d93025'; return; }
  ffPrompt.style.borderColor = '';
  ffUpload.style.borderColor = '';
  const duration = Math.max(4, Math.min(15, parseInt(ffDuration.value, 10) || 5));
  ffDuration.value = duration;
  const ratio = ffRatio.value;
  const scale = Math.max(0.2, Math.min(2.0, parseFloat(ffScale.value) || 0.5));
  ffScale.value = scale;
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const task = addFfItem(prompt, duration, ratio, scale, ffImageFile.name);
  try {
    const fd = new FormData();
    fd.append('image', ffImageFile, ffImageFile.name);
    fd.append('prompt', prompt);
    fd.append('duration', String(duration));
    fd.append('ratio', ratio);
    fd.append('scale', String(scale));
    const r = await fetch('/api/rh-firstframe-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setFfStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistFf();
      openSettings();
      return;
    }
    if (d.error) {
      setFfStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistFf();
      return;
    }
    task.taskId = d.taskId;
    persistFf();
    pollFfTask(task);
  } catch (e) {
    setFfStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistFf();
  }
});

function addFfItem(prompt, duration, ratio, scale, imageName) {
  ffResultCard.hidden = false;
  const task = {
    id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, prompt, duration, ratio, scale, imageName: imageName || '', videos: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  ffTasks.unshift(task);
  ffItems.prepend(createFfItemEl(task));
  updateFfMeta();
  persistFf();
  task._kind = 'ff';
  task._remove = ffRemove;
  return task;
}
function createFfItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const paramText = [
    task.imageName ? '首帧:' + task.imageName : '',
    task.duration ? task.duration + ' 秒' : '',
    task.ratio,
    task.scale ? 'x' + task.scale : ''
  ].filter(Boolean).join(' · ');
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt" title="' + escapeHtml(task.prompt || '') + '">' + escapeHtml(truncateText(task.prompt, 30)) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + paramText + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'ff';
  task._remove = ffRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => ffRemove(task));
  if (task.status === 'done') {
    setFfStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.videos ? task.videos.length : 0) + ' 个视频'));
    if (task.videos && task.videos.length) renderFfGrid(task, task.videos);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setFfStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setFfStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setFfStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function ffRemove(task) {
  cancelRhTask(task);
  const i = ffTasks.indexOf(task);
  if (i >= 0) ffTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateFfMeta();
  rebuildFfVideos();
  persistFf();
  if (!ffTasks.length) ffResultCard.hidden = true;
}
function updateFfMeta() {
  const n = ffItems ? ffItems.children.length : 0;
  ffMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildFfVideos() {
  ffVideos = Array.from(ffItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistFf() {
  const data = ffTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, duration: t.duration, ratio: t.ratio, scale: t.scale, imageName: t.imageName, videos: t.videos, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(FF_STORE_KEY, data);
}
function restoreFf() {
  const now = Date.now();
  const fresh = ffTasks.length === 0;
  if (fresh) {
    if (!localStorage.getItem('ff_cleared_20260826')) {
      localStorage.removeItem(FF_STORE_KEY);
      localStorage.setItem('ff_cleared_20260826', '1');
    }
    const data = loadList(FF_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(FF_STORE_KEY, []); return; }
    ffTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    ffResultCard.hidden = false;
    ffItems.innerHTML = '';
    ffTasks.forEach(task => ffItems.appendChild(createFfItemEl(task)));
    updateFfMeta();
    rebuildFfVideos();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(ffTasks, { setStatus: setFfStatus, renderGrid: renderFfGrid, noun: '个视频', remove: ffRemove, poll: pollFfTask });
}

async function pollFfTask(task) {
  if (task._polling) return; task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setFfStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setFfStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { ffRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setFfStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistFf();
      return;
    } else if (st.status === 'done') {
      const videos = st.images || [];
      setFfStatus(task, 'ok', `生成完成 · ${videos.length} 个视频`);
      renderFfGrid(task, videos);
      persistFf();
      return;
    }
  }
  setFfStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistFf();
  } finally {
    task._polling = false;
  }
}

function renderFfGrid(task, videos) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.videos = videos.slice();
  if (!videos.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回视频，请稍后重试。</div>';
    return;
  }
  videos.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item video-item';
    box.dataset.url = url;

    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = false;
    video.setAttribute('playsinline', '');
    video.addEventListener('click', () => openMvLightbox(url));
    box.appendChild(video);

    const play = document.createElement('button');
    play.type = 'button'; play.className = 'mv-play'; play.setAttribute('aria-label', '放大预览');
    play.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.55)"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>';
    play.addEventListener('click', (e) => { e.stopPropagation(); openMvLightbox(url); });
    box.appendChild(play);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) ffSelected.add(url); else ffSelected.delete(url);
      ffSaveSel.disabled = ffSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单个视频');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url, '视频'); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildFfVideos();
}

ffSaveSel.addEventListener('click', async () => {
  if (!ffSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of ffSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'ff_' + Date.now() + '_' + i + '.mp4';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个视频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    ffSelected.clear();
    ffItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    ffSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (ffClear) {
  ffClear.addEventListener('click', () => {
    ffTasks = [];
    ffItems.innerHTML = '';
    ffVideos = [];
    ffSelected.clear();
    ffSaveSel.disabled = true;
    updateFfMeta();
    persistFf();
    ffResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

const ffPickDir = document.getElementById('ffPickDir');
if (ffPickDir) {
  if (!window.showDirectoryPicker) ffPickDir.hidden = true;
  else ffPickDir.addEventListener('click', async () => { if (await pickDir()) { ffPickDir.textContent = '已选目录'; } });
}

// ---- 尾帧生视频（lf）：UI/功能与首帧完全一致，仅向节点 56 传值 2（首帧为 1）----
let lfTasks = [];
let lfSelected = new Set();
let lfVideos = [];
const LF_STORE_KEY = 'lf_history_v1';

const lfBtn = document.getElementById('lfBtn');
const lfResultCard = document.getElementById('lfResultCard');
const lfMeta = document.getElementById('lfMeta');
const lfItems = document.getElementById('lfItems');
const lfSaveSel = document.getElementById('lfSaveSel');
const lfClear = document.getElementById('lfClear');
const lfUpload = document.getElementById('lfUpload');
const lfFileInput = document.getElementById('lfFileInput');
const lfPreviewWrap = document.getElementById('lfPreviewWrap');
const lfPreview = document.getElementById('lfPreview');
const lfFileName = document.getElementById('lfFileName');
const lfRePick = document.getElementById('lfRePick');
const lfPrompt = document.getElementById('lfPrompt');
const lfDuration = document.getElementById('lfDuration');
const lfRatio = document.getElementById('lfRatio');
const lfScale = document.getElementById('lfScale');
let lfImageFile = null;

// 生成时长：只能输入数字；失焦时自动纠到 [4,15]
if (lfDuration) {
  lfDuration.addEventListener('input', () => { lfDuration.value = lfDuration.value.replace(/[^0-9]/g, ''); });
  lfDuration.addEventListener('blur', () => {
    let v = parseInt(lfDuration.value, 10);
    if (isNaN(v)) v = 4;
    if (v < 4) v = 4;
    if (v > 15) v = 15;
    lfDuration.value = String(v);
  });
}

function setLfFile(f) {
  if (!f || !f.type || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  lfImageFile = f;
  lfUpload.style.borderColor = '';
  const reader = new FileReader();
  reader.onload = (e) => { lfPreview.src = e.target.result; };
  reader.readAsDataURL(f);
  lfFileName.textContent = f.name;
  lfUpload.hidden = true;
  lfPreviewWrap.hidden = false;
}
if (lfFileInput) lfFileInput.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) setLfFile(e.target.files[0]); });
if (lfUpload) {
  lfUpload.addEventListener('click', () => { if (lfFileInput) lfFileInput.click(); });
  lfUpload.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (lfFileInput) lfFileInput.click(); } });
  ['dragover', 'dragenter'].forEach(ev => lfUpload.addEventListener(ev, (e) => { e.preventDefault(); lfUpload.style.borderColor = '#0052D9'; }));
  ['dragleave', 'drop'].forEach(ev => lfUpload.addEventListener(ev, (e) => { e.preventDefault(); lfUpload.style.borderColor = ''; }));
  lfUpload.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setLfFile(f); });
}
if (lfRePick) lfRePick.addEventListener('click', () => { if (lfFileInput) lfFileInput.click(); });

lfBtn.addEventListener('click', async () => {
  const prompt = lfPrompt.value.trim();
  if (!lfImageFile) { lfUpload.style.borderColor = '#d93025'; showToast('请先上传尾帧参考图片（节点 4）', 'error'); return; }
  if (!prompt) { lfPrompt.focus(); lfPrompt.style.borderColor = '#d93025'; return; }
  lfPrompt.style.borderColor = '';
  lfUpload.style.borderColor = '';
  const duration = Math.max(4, Math.min(15, parseInt(lfDuration.value, 10) || 5));
  lfDuration.value = duration;
  const ratio = lfRatio.value;
  const scale = Math.max(0.2, Math.min(2.0, parseFloat(lfScale.value) || 0.5));
  lfScale.value = scale;
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const task = addLfItem(prompt, duration, ratio, scale, lfImageFile.name);
  try {
    const fd = new FormData();
    fd.append('image', lfImageFile, lfImageFile.name);
    fd.append('prompt', prompt);
    fd.append('duration', String(duration));
    fd.append('ratio', ratio);
    fd.append('scale', String(scale));
    const r = await fetch('/api/rh-lastframe-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setLfStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistLf();
      openSettings();
      return;
    }
    if (d.error) {
      setLfStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistLf();
      return;
    }
    task.taskId = d.taskId;
    persistLf();
    pollLfTask(task);
  } catch (e) {
    setLfStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistLf();
  }
});

function addLfItem(prompt, duration, ratio, scale, imageName) {
  lfResultCard.hidden = false;
  const task = {
    id: 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, prompt, duration, ratio, scale, imageName: imageName || '', videos: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  lfTasks.unshift(task);
  lfItems.prepend(createLfItemEl(task));
  updateLfMeta();
  persistLf();
  task._kind = 'lf';
  task._remove = lfRemove;
  return task;
}
function createLfItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const paramText = [
    task.imageName ? '尾帧:' + task.imageName : '',
    task.duration ? task.duration + ' 秒' : '',
    task.ratio,
    task.scale ? 'x' + task.scale : ''
  ].filter(Boolean).join(' · ');
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt" title="' + escapeHtml(task.prompt || '') + '">' + escapeHtml(truncateText(task.prompt, 30)) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + paramText + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'lf';
  task._remove = lfRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => lfRemove(task));
  if (task.status === 'done') {
    setLfStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.videos ? task.videos.length : 0) + ' 个视频'));
    if (task.videos && task.videos.length) renderLfGrid(task, task.videos);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setLfStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setLfStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setLfStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function lfRemove(task) {
  cancelRhTask(task);
  const i = lfTasks.indexOf(task);
  if (i >= 0) lfTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateLfMeta();
  rebuildLfVideos();
  persistLf();
  if (!lfTasks.length) lfResultCard.hidden = true;
}
function updateLfMeta() {
  const n = lfItems ? lfItems.children.length : 0;
  lfMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildLfVideos() {
  lfVideos = Array.from(lfItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistLf() {
  const data = lfTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, duration: t.duration, ratio: t.ratio, scale: t.scale, imageName: t.imageName, videos: t.videos, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(LF_STORE_KEY, data);
}
function restoreLf() {
  const now = Date.now();
  const fresh = lfTasks.length === 0;
  if (fresh) {
    if (!localStorage.getItem('lf_cleared_20260826')) {
      localStorage.removeItem(LF_STORE_KEY);
      localStorage.setItem('lf_cleared_20260826', '1');
    }
    const data = loadList(LF_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(LF_STORE_KEY, []); return; }
    lfTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    lfResultCard.hidden = false;
    lfItems.innerHTML = '';
    lfTasks.forEach(task => lfItems.appendChild(createLfItemEl(task)));
    updateLfMeta();
    rebuildLfVideos();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(lfTasks, { setStatus: setLfStatus, renderGrid: renderLfGrid, noun: '个视频', remove: lfRemove, poll: pollLfTask });
}

async function pollLfTask(task) {
  if (task._polling) return; task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setLfStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setLfStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { lfRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setLfStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistLf();
      return;
    } else if (st.status === 'done') {
      const videos = st.images || [];
      setLfStatus(task, 'ok', `生成完成 · ${videos.length} 个视频`);
      renderLfGrid(task, videos);
      persistLf();
      return;
    }
  }
  setLfStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistLf();
  } finally {
    task._polling = false;
  }
}

function renderLfGrid(task, videos) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.videos = videos.slice();
  if (!videos.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回视频，请稍后重试。</div>';
    return;
  }
  videos.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item video-item';
    box.dataset.url = url;

    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = false;
    video.setAttribute('playsinline', '');
    video.addEventListener('click', () => openMvLightbox(url));
    box.appendChild(video);

    const play = document.createElement('button');
    play.type = 'button'; play.className = 'mv-play'; play.setAttribute('aria-label', '放大预览');
    play.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.55)"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>';
    play.addEventListener('click', (e) => { e.stopPropagation(); openMvLightbox(url); });
    box.appendChild(play);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) lfSelected.add(url); else lfSelected.delete(url);
      lfSaveSel.disabled = lfSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单个视频');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url, '视频'); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildLfVideos();
}

lfSaveSel.addEventListener('click', async () => {
  if (!lfSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of lfSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'lf_' + Date.now() + '_' + i + '.mp4';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个视频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    lfSelected.clear();
    lfItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    lfSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (lfClear) {
  lfClear.addEventListener('click', () => {
    lfTasks = [];
    lfItems.innerHTML = '';
    lfVideos = [];
    lfSelected.clear();
    lfSaveSel.disabled = true;
    updateLfMeta();
    persistLf();
    lfResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

const lfPickDir = document.getElementById('lfPickDir');
if (lfPickDir) {
  if (!window.showDirectoryPicker) lfPickDir.hidden = true;
  else lfPickDir.addEventListener('click', async () => { if (await pickDir()) { lfPickDir.textContent = '已选目录'; } });
}

// ---- 首尾帧生视频（bf）：首帧图(node4) + 尾帧图(node59) + 提示词 + 参数；不传帧模式节点56 ----
let bfTasks = [];
let bfSelected = new Set();
let bfVideos = [];
const BF_STORE_KEY = 'bf_history_v1';

const bfBtn = document.getElementById('bfBtn');
const bfResultCard = document.getElementById('bfResultCard');
const bfMeta = document.getElementById('bfMeta');
const bfItems = document.getElementById('bfItems');
const bfSaveSel = document.getElementById('bfSaveSel');
const bfClear = document.getElementById('bfClear');
const bfFirstUpload = document.getElementById('bfFirstUpload');
const bfFirstFileInput = document.getElementById('bfFirstFileInput');
const bfFirstPreviewWrap = document.getElementById('bfFirstPreviewWrap');
const bfFirstPreview = document.getElementById('bfFirstPreview');
const bfFirstFileName = document.getElementById('bfFirstFileName');
const bfFirstRePick = document.getElementById('bfFirstRePick');
const bfLastUpload = document.getElementById('bfLastUpload');
const bfLastFileInput = document.getElementById('bfLastFileInput');
const bfLastPreviewWrap = document.getElementById('bfLastPreviewWrap');
const bfLastPreview = document.getElementById('bfLastPreview');
const bfLastFileName = document.getElementById('bfLastFileName');
const bfLastRePick = document.getElementById('bfLastRePick');
const bfPrompt = document.getElementById('bfPrompt');
const bfDuration = document.getElementById('bfDuration');
const bfRatio = document.getElementById('bfRatio');
const bfScale = document.getElementById('bfScale');
let bfFirstImageFile = null;
let bfLastImageFile = null;

// 生成时长：只能输入数字；失焦时自动纠到 [4,15]
if (bfDuration) {
  bfDuration.addEventListener('input', () => { bfDuration.value = bfDuration.value.replace(/[^0-9]/g, ''); });
  bfDuration.addEventListener('blur', () => {
    let v = parseInt(bfDuration.value, 10);
    if (isNaN(v)) v = 4;
    if (v < 4) v = 4;
    if (v > 15) v = 15;
    bfDuration.value = String(v);
  });
}

function setBfFirstFile(f) {
  if (!f || !f.type || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  bfFirstImageFile = f;
  bfFirstUpload.style.borderColor = '';
  const reader = new FileReader();
  reader.onload = (e) => { bfFirstPreview.src = e.target.result; };
  reader.readAsDataURL(f);
  bfFirstFileName.textContent = f.name;
  bfFirstUpload.hidden = true;
  bfFirstPreviewWrap.hidden = false;
}
function setBfLastFile(f) {
  if (!f || !f.type || !f.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
  bfLastImageFile = f;
  bfLastUpload.style.borderColor = '';
  const reader = new FileReader();
  reader.onload = (e) => { bfLastPreview.src = e.target.result; };
  reader.readAsDataURL(f);
  bfLastFileName.textContent = f.name;
  bfLastUpload.hidden = true;
  bfLastPreviewWrap.hidden = false;
}
if (bfFirstFileInput) bfFirstFileInput.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) setBfFirstFile(e.target.files[0]); });
if (bfLastFileInput) bfLastFileInput.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) setBfLastFile(e.target.files[0]); });
[['bfFirstUpload', setBfFirstFile], ['bfLastUpload', setBfLastFile]].forEach(([id, fn]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => { const inp = id === 'bfFirstUpload' ? bfFirstFileInput : bfLastFileInput; if (inp) inp.click(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const inp = id === 'bfFirstUpload' ? bfFirstFileInput : bfLastFileInput; if (inp) inp.click(); } });
  ['dragover', 'dragenter'].forEach(ev => el.addEventListener(ev, (e) => { e.preventDefault(); el.style.borderColor = '#0052D9'; }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, (e) => { e.preventDefault(); el.style.borderColor = ''; }));
  el.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) fn(f); });
});
if (bfFirstRePick) bfFirstRePick.addEventListener('click', () => { if (bfFirstFileInput) bfFirstFileInput.click(); });
if (bfLastRePick) bfLastRePick.addEventListener('click', () => { if (bfLastFileInput) bfLastFileInput.click(); });

bfBtn.addEventListener('click', async () => {
  const prompt = bfPrompt.value.trim();
  if (!bfFirstImageFile) { bfFirstUpload.style.borderColor = '#d93025'; showToast('请先上传首帧参考图片（节点 4）', 'error'); return; }
  if (!bfLastImageFile) { bfLastUpload.style.borderColor = '#d93025'; showToast('请先上传尾帧参考图片（节点 59）', 'error'); return; }
  if (!prompt) { bfPrompt.focus(); bfPrompt.style.borderColor = '#d93025'; return; }
  bfPrompt.style.borderColor = '';
  bfFirstUpload.style.borderColor = '';
  bfLastUpload.style.borderColor = '';
  const duration = Math.max(4, Math.min(15, parseInt(bfDuration.value, 10) || 5));
  bfDuration.value = duration;
  const ratio = bfRatio.value;
  const scale = Math.max(0.2, Math.min(2.0, parseFloat(bfScale.value) || 0.5));
  bfScale.value = scale;
  if (!hasRh) {
    rhNotice.hidden = false;
    rhNotice.scrollIntoView({ behavior: 'smooth' });
    openSettings();
    return;
  }
  const task = addBfItem(prompt, duration, ratio, scale, bfFirstImageFile.name, bfLastImageFile.name);
  try {
    const fd = new FormData();
    fd.append('firstframe', bfFirstImageFile, bfFirstImageFile.name);
    fd.append('lastframe', bfLastImageFile, bfLastImageFile.name);
    fd.append('prompt', prompt);
    fd.append('duration', String(duration));
    fd.append('ratio', ratio);
    fd.append('scale', String(scale));
    const r = await fetch('/api/rh-bothframe-generate', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error === 'NO_RH_KEY') {
      hasRh = false; renderRhStatus();
      setBfStatus(task, 'err', '尚未配置 RunningHub API Key，请到设置中填写');
      persistBf();
      openSettings();
      return;
    }
    if (d.error) {
      setBfStatus(task, 'err', '提交失败：' + escapeHtml(d.message || '未知错误'));
      persistBf();
      return;
    }
    task.taskId = d.taskId;
    persistBf();
    pollBfTask(task);
  } catch (e) {
    setBfStatus(task, 'err', '请求出错：' + escapeHtml(e.message));
    persistBf();
  }
});

function addBfItem(prompt, duration, ratio, scale, firstImageName, lastImageName) {
  bfResultCard.hidden = false;
  const task = {
    id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    taskId: null, prompt, duration, ratio, scale, firstImageName: firstImageName || '', lastImageName: lastImageName || '', videos: [], status: 'queued', statusText: '提交中…', ts: Date.now(),
    el: null, statusEl: null, gridEl: null
  };
  bfTasks.unshift(task);
  bfItems.prepend(createBfItemEl(task));
  updateBfMeta();
  persistBf();
  task._kind = 'bf';
  task._remove = bfRemove;
  return task;
}
function createBfItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const paramText = [
    task.firstImageName ? '首帧:' + task.firstImageName : '',
    task.lastImageName ? '尾帧:' + task.lastImageName : '',
    task.duration ? task.duration + ' 秒' : '',
    task.ratio,
    task.scale ? 'x' + task.scale : ''
  ].filter(Boolean).join(' · ');
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt" title="' + escapeHtml(task.prompt || '') + '">' + escapeHtml(truncateText(task.prompt, 30)) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + paramText + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'bf';
  task._remove = bfRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => bfRemove(task));
  if (task.status === 'done') {
    setBfStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.videos ? task.videos.length : 0) + ' 个视频'));
    if (task.videos && task.videos.length) renderBfGrid(task, task.videos);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setBfStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    setBfStatus(task, '', task.statusText || '提交中…');
  }
  return item;
}
function setBfStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}
function bfRemove(task) {
  cancelRhTask(task);
  const i = bfTasks.indexOf(task);
  if (i >= 0) bfTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateBfMeta();
  rebuildBfVideos();
  persistBf();
  if (!bfTasks.length) bfResultCard.hidden = true;
}
function updateBfMeta() {
  const n = bfItems ? bfItems.children.length : 0;
  bfMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}
function rebuildBfVideos() {
  bfVideos = Array.from(bfItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}
function persistBf() {
  const data = bfTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, duration: t.duration, ratio: t.ratio, scale: t.scale, firstImageName: t.firstImageName, lastImageName: t.lastImageName, videos: t.videos, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(BF_STORE_KEY, data);
}
function restoreBf() {
  const now = Date.now();
  const fresh = bfTasks.length === 0;
  if (fresh) {
    if (!localStorage.getItem('bf_cleared_20260826')) {
      localStorage.removeItem(BF_STORE_KEY);
      localStorage.setItem('bf_cleared_20260826', '1');
    }
    const data = loadList(BF_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(BF_STORE_KEY, []); return; }
    bfTasks = data.map(d => Object.assign({}, d, { el: null, statusEl: null, gridEl: null }));
    bfResultCard.hidden = false;
    bfItems.innerHTML = '';
    bfTasks.forEach(task => bfItems.appendChild(createBfItemEl(task)));
    updateBfMeta();
    rebuildBfVideos();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(bfTasks, { setStatus: setBfStatus, renderGrid: renderBfGrid, noun: '个视频', remove: bfRemove, poll: pollBfTask });
}

async function pollBfTask(task) {
  if (task._polling) return; task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setBfStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setBfStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { bfRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setBfStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistBf();
      return;
    } else if (st.status === 'done') {
      const videos = st.images || [];
      setBfStatus(task, 'ok', `生成完成 · ${videos.length} 个视频`);
      renderBfGrid(task, videos);
      persistBf();
      return;
    }
  }
  setBfStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistBf();
  } finally {
    task._polling = false;
  }
}

function renderBfGrid(task, videos) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.videos = videos.slice();
  if (!videos.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回视频，请稍后重试。</div>';
    return;
  }
  videos.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item video-item';
    box.dataset.url = url;

    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = false;
    video.setAttribute('playsinline', '');
    video.addEventListener('click', () => openMvLightbox(url));
    box.appendChild(video);

    const play = document.createElement('button');
    play.type = 'button'; play.className = 'mv-play'; play.setAttribute('aria-label', '放大预览');
    play.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.55)"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>';
    play.addEventListener('click', (e) => { e.stopPropagation(); openMvLightbox(url); });
    box.appendChild(play);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) bfSelected.add(url); else bfSelected.delete(url);
      bfSaveSel.disabled = bfSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单个视频');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url, '视频'); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildBfVideos();
}

bfSaveSel.addEventListener('click', async () => {
  if (!bfSelected.size) return;
  await ensureDirHandle();
  let i = 0; let ok = 0;
  for (const url of bfSelected) {
    i++;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = 'bf_' + Date.now() + '_' + i + '.mp4';
      if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ok++;
    } catch (e) { /* 单个失败跳过 */ }
  }
  if (ok > 0) {
    showToast(`已下载 ${ok} 个视频` + (t2iDirHandle ? '（已保存到所选目录）' : '（浏览器下载）'));
    bfSelected.clear();
    bfItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    bfSaveSel.disabled = true;
  } else {
    showToast('下载失败，请重试', 'error');
  }
});

if (bfClear) {
  bfClear.addEventListener('click', () => {
    bfTasks = [];
    bfItems.innerHTML = '';
    bfVideos = [];
    bfSelected.clear();
    bfSaveSel.disabled = true;
    updateBfMeta();
    persistBf();
    bfResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

const bfPickDir = document.getElementById('bfPickDir');
if (bfPickDir) {
  if (!window.showDirectoryPicker) bfPickDir.hidden = true;
  else bfPickDir.addEventListener('click', async () => { if (await pickDir()) { bfPickDir.textContent = '已选目录'; } });
}

// ========================================
// ---- 多图参考生视频 (MultiRef) ----
// ========================================
const mrGrid = document.getElementById('mrGrid');
const mrFileInput = document.getElementById('mrFileInput');
const mrDuration = document.getElementById('mrDuration');
const mrRatio = document.getElementById('mrRatio');
const mrScale = document.getElementById('mrScale');
const mrPrompt = document.getElementById('mrPrompt');
const mrBtn = document.getElementById('mrBtn');
const mrResultCard = document.getElementById('mrResultCard');
const mrItems = document.getElementById('mrItems');
const mrMeta = document.getElementById('mrMeta');
const mrSaveSel = document.getElementById('mrSaveSel');
const mrClear = document.getElementById('mrClear');
let mrFiles = [];    // 已选参考图 File（最多 3 张）
let mrTasks = [];
let mrSelected = new Set();
let mrVideos = [];
const MR_STORE_KEY = 'mr_history_v1';

function renderMrRefGrid() {
  if (!mrGrid) return;
  mrGrid.innerHTML = '';
  mrFiles.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'mr-thumb';
    const img = document.createElement('img');
    img.src = f._url || (f._url = URL.createObjectURL(f));
    img.alt = '参考图 ' + (i + 1);
    card.appendChild(img);
    const tag = document.createElement('div');
    tag.className = 'mr-thumb-tag';
    tag.textContent = '参考' + (i + 1);
    card.appendChild(tag);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'mr-thumb-del'; del.textContent = '×';
    del.addEventListener('click', () => {
      mrFiles.splice(i, 1);
      renderMrRefGrid();
    });
    card.appendChild(del);
    mrGrid.appendChild(card);
  });
  if (mrFiles.length < 3) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'mr-add'; add.setAttribute('aria-label', '添加参考图');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M12 6v12M6 12h12" stroke="#0052D9" stroke-width="1.8" stroke-linecap="round"/></svg><span>添加参考图</span>';
    add.addEventListener('click', () => mrFileInput.click());
    mrGrid.appendChild(add);
  }
}

function mrHandleFiles(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    if (mrFiles.length >= 3) break;
    if (!f.type.startsWith('image/')) { showToast('请选择图片文件'); continue; }
    mrFiles.push(f);
  }
  mrFileInput.value = '';
  renderMrRefGrid();
}

if (mrFileInput) {
  mrFileInput.addEventListener('change', () => { mrHandleFiles(mrFileInput.files); });
}

if (mrDuration) {
  mrDuration.addEventListener('input', () => { mrDuration.value = mrDuration.value.replace(/[^0-9]/g, ''); });
  mrDuration.addEventListener('blur', () => {
    let v = parseInt(mrDuration.value, 10);
    if (isNaN(v)) v = 4;
    if (v < 4) v = 4;
    if (v > 15) v = 15;
    mrDuration.value = v;
  });
}

if (mrBtn) {
  mrBtn.addEventListener('click', async () => {
    const loader = window.mrLoader;
    if (!loader) { showToast('组件未初始化'); return; }
    const check = loader.validateMedia();
    if (!check.ok) { showToast(check.message); return; }
    const prompt = loader._getPromptText ? loader._getPromptText() : '';
    document.getElementById('mrPrompt').value = prompt;
    if (!prompt) { showToast('请输入提示词'); return; }
    let duration = parseInt(mrDuration.value, 10);
    if (isNaN(duration) || duration < 4) duration = 4;
    if (duration > 15) duration = 15;
    mrDuration.value = duration;
    const ratio = mrRatio.value;
    const scale = Math.max(0.2, Math.min(2.0, parseFloat(mrScale.value) || 0.5));

    mrBtn.disabled = true;
    const oldLabel = mrBtn.querySelector('.btn-label') ? mrBtn.querySelector('.btn-label').textContent : '开始生成';
    if (mrBtn.querySelector('.btn-label')) mrBtn.querySelector('.btn-label').textContent = '上传媒体中…';
    try {
      const up = await loader.uploadMedia();
      if (up.failed) { showToast('媒体上传失败：' + up.errors.join('；'), 'error'); return; }
      if (mrBtn.querySelector('.btn-label')) mrBtn.querySelector('.btn-label').textContent = '提交中…';
      const files = loader.getFiles();
      const mediaItems = [];
      const kindMap = { images: 'picture', videos: 'video', audios: 'audio' };
      ['images', 'videos', 'audios'].forEach((kind) => {
        (files[kind] || []).forEach((s) => {
          if (!s) return;
          const raw = s.duration;
          const duration = (raw === undefined || raw === null || raw === '' || isNaN(Number(raw))) ? null : Number(Number(raw).toFixed(2));
          mediaItems.push({
            kind: kindMap[kind],
            file: s.uploadedName || '',
            name: (s.file && s.file.name) || '',
            duration: duration,
            width: s.width || null,
            height: s.height || null,
            has_audio: false,
            audio_mode: 'off'
          });
        });
      });
      const formData = new FormData();
      formData.append('media_state', JSON.stringify(mediaItems));
      formData.append('duration', duration);
      formData.append('ratio', ratio);
      formData.append('scale', scale);
      formData.append('prompt', prompt);

      const task = { id: 'mr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), kind: 'mr', prompt, ratio, scale, duration, imgCount: mediaItems.length, status: 'pending', videos: [] };
      mrTasks.unshift(task);
      addMrItem(task);
      setMrStatus(task, '', '提交中…');
      mrResultCard.hidden = false;

      const res = await fetch('/api/rh-mr-generate', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error === 'NO_RH_KEY') { setMrStatus(task, 'err', '尚未配置 RunningHub API Key，请在设置中填写'); return; }
      if (data.error) { setMrStatus(task, 'err', data.message || '提交失败'); return; }
      task.taskId = data.taskId;
      persistMr();
      pollMrTask(task);
    } catch (e) {
      showToast('提交失败：' + e.message, 'error');
    } finally {
      mrBtn.disabled = false;
      if (mrBtn.querySelector('.btn-label')) mrBtn.querySelector('.btn-label').textContent = oldLabel;
    }
  });
}

function addMrItem(task) {
  const el = createMrItemEl(task);
  mrItems.prepend(el);
  updateMrMeta();
}

function createMrItemEl(task) {
  const item = document.createElement('div');
  item.className = 't2i-result';
  const time = formatTime(task.ts || Date.now());
  const paramText = [
    task.duration ? task.duration + ' 秒' : '',
    task.ratio,
    task.scale ? 'x' + task.scale : '',
    task.imgCount ? task.imgCount + ' 个媒体资源' : ''
  ].filter(Boolean).join(' · ');
  item.innerHTML =
    '<div class="t2i-result-head">' +
      '<div class="t2i-result-info">' +
        '<div class="t2i-result-prompt" title="' + escapeHtml(task.prompt || '') + '">' + escapeHtml(truncateText(task.prompt, 30)) + '</div>' +
        '<div class="t2i-result-sub">' + time + ' · ' + paramText + ' · ' + expiryText(task.ts) + '</div>' +
      '</div>' +
      '<button class="t2i-del" type="button" title="删除该结果">×</button>' +
    '</div>' +
    '<div class="t2i-queue">提交中…</div>' +
    '<div class="t2i-grid"></div>';
  task.el = item;
  task._kind = 'mr';
  task._remove = mrRemove;
  task.statusEl = item.querySelector('.t2i-queue');
  task.gridEl = item.querySelector('.t2i-grid');
  item.querySelector('.t2i-del').addEventListener('click', () => mrRemove(task));
  if (task.status === 'done') {
    setMrStatus(task, 'ok', task.statusText || ('生成完成 · ' + (task.videos ? task.videos.length : 0) + ' 个视频'));
    if (task.videos && task.videos.length) renderMrGrid(task, task.videos);
  } else if (task.status === 'err') {
    if (task.taskId && task.statusText && task.statusText.includes('任务丢失')) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setMrStatus(task, 'err', task.statusText || '生成失败');
    }
  } else {
    if (task.taskId && !task.cancelled) {
      setNotFoundRecovery(task, task._remove);
    } else {
      setMrStatus(task, '', task.statusText || '提交中…');
    }
  }
  return item;
}

function setMrStatus(task, cls, text) {
  if (!task.statusEl) return;
  task.statusEl.className = 't2i-queue' + (cls ? ' ' + cls : '');
  task.statusEl.textContent = text;
  task.statusText = text;
  task.status = cls === 'ok' ? 'done' : (cls === 'err' ? 'err' : 'queued');
}

function mrRemove(task) {
  cancelRhTask(task);
  const i = mrTasks.indexOf(task);
  if (i >= 0) mrTasks.splice(i, 1);
  if (task.el) task.el.remove();
  updateMrMeta();
  rebuildMrVideos();
  persistMr();
  if (!mrTasks.length) mrResultCard.hidden = true;
}

function updateMrMeta() {
  const n = mrItems ? mrItems.children.length : 0;
  mrMeta.textContent = n ? ('共 ' + n + ' 组结果') : '';
}

function rebuildMrVideos() {
  mrVideos = Array.from(mrItems.querySelectorAll('.t2i-item')).map(b => b.dataset.url);
}

function persistMr() {
  const data = mrTasks
    .filter(t => t.status === 'done' || t.status === 'err' || (t.taskId && t.status !== 'cancelled'))
    .map(t => ({ id: t.id, taskId: t.taskId, rhTaskId: t.rhTaskId, prompt: t.prompt, duration: t.duration, ratio: t.ratio, scale: t.scale, maxside: t.maxside, videos: t.videos, status: t.status, statusText: t.statusText, ts: t.ts }));
  saveList(MR_STORE_KEY, data);
}

function restoreMr() {
  const now = Date.now();
  const fresh = mrTasks.length === 0;
  if (fresh) {
    const data = loadList(MR_STORE_KEY).filter(t => now - (t.ts || now) < EXPIRY_MS);
    if (!data.length) { saveList(MR_STORE_KEY, []); return; }
    mrTasks = data.map(d => {
      const videos = d.videos || d.items || [];
      const status = d.status === 'ok' ? 'done' : (d.status || 'pending');
      return Object.assign({}, d, { videos, status, el: null, statusEl: null, gridEl: null });
    });
    mrResultCard.hidden = false;
    mrItems.innerHTML = '';
    mrTasks.forEach(task => mrItems.appendChild(createMrItemEl(task)));
    updateMrMeta();
    rebuildMrVideos();
  }
  // 进行中 / 近期失败（带 taskId 且未取消）重新连接 RunningHub 轮询，切回页面 / 刷新后也能找回结果
  reconnectRhTasks(mrTasks, { setStatus: setMrStatus, renderGrid: renderMrGrid, noun: '个视频', remove: mrRemove, poll: pollMrTask });
}

async function pollMrTask(task) {
  if (task._polling) return; task._polling = true;
  try {
  const deadline = Date.now() + Math.max(20, rhTimeoutMin || 60) * 60 * 1000;
  while (Date.now() < deadline) {
    if (task.cancelled) return;
    await new Promise(res => setTimeout(res, 1000));
    if (!task.taskId) continue;
    let st;
    try {
      const r = await fetch('/api/rh-task/' + task.taskId);
      st = await r.json();
      if (st.rhTaskId) task.rhTaskId = st.rhTaskId;
    } catch (e) { continue; }
    if (st.error === 'NOT_FOUND') { setNotFoundRecovery(task, task._remove); return; }
    if (st.status === 'queued') {
      setMrStatus(task, '', `排队中 · 第 ${st.position + 1} / 共 ${st.total} 个任务 · 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'running') {
      setMrStatus(task, '', `生成中…（云端已 ${fmtDur(st.elapsed)}）· 运行中 ${st.running}/${st.concurrency}`);
    } else if (st.status === 'error') {
      const em = st.error || '';
      if (em.includes('取消')) { mrRemove(task); showToast('任务已在 RunningHub 控制台取消，已移除'); return; }
      setMrStatus(task, 'err', '生成失败：' + escapeHtml(em));
      persistMr();
      return;
    } else if (st.status === 'done') {
      const videos = st.images || [];
      setMrStatus(task, 'ok', `生成完成 · ${videos.length} 个视频`);
      renderMrGrid(task, videos);
      persistMr();
      return;
    }
  }
  setMrStatus(task, 'err', '任务超时（约 ' + rhTimeoutMin + ' 分钟），请稍后在 RunningHub 控制台查看');
  persistMr();
  } finally {
    task._polling = false;
  }
}

function renderMrGrid(task, videos) {
  if (!task.gridEl) return;
  task.gridEl.innerHTML = '';
  task.videos = videos.slice();
  if (!videos.length) {
    task.gridEl.innerHTML = '<div class="dis-error">未返回视频，请稍后重试。</div>';
    return;
  }
  videos.forEach((url) => {
    const box = document.createElement('div');
    box.className = 't2i-item video-item';
    box.dataset.url = url;

    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = false;
    video.setAttribute('playsinline', '');
    video.addEventListener('click', () => openMvLightbox(url));
    box.appendChild(video);

    const play = document.createElement('button');
    play.type = 'button'; play.className = 'mv-play'; play.setAttribute('aria-label', '放大预览');
    play.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.55)"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>';
    play.addEventListener('click', (e) => { e.stopPropagation(); openMvLightbox(url); });
    box.appendChild(play);

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 't2i-pick'; pick.setAttribute('aria-label', '选择');
    pick.innerHTML = '<svg class="t2i-check" viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = box.classList.toggle('sel');
      if (on) mrSelected.add(url); else mrSelected.delete(url);
      mrSaveSel.disabled = mrSelected.size === 0;
    });
    box.appendChild(pick);

    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 't2i-dl'; dl.setAttribute('aria-label', '下载单个视频');
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(url, '视频'); });
    box.appendChild(dl);

    task.gridEl.appendChild(box);
  });
  rebuildMrVideos();
}

if (mrSaveSel) {
  mrSaveSel.addEventListener('click', async () => {
    if (!mrSelected.size) return;
    await ensureDirHandle();
    let i = 0; let ok = 0;
    for (const url of mrSelected) {
      i++;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const name = 'mr_' + Date.now() + '_' + i + '.mp4';
        if (t2iDirHandle && await saveBlobToDir(blob, name)) { ok++; continue; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        ok++;
      } catch (e) { /* 单个失败跳过 */ }
    }
    showToast('已保存 ' + ok + ' 个视频');
    mrSelected.clear();
    mrItems.querySelectorAll('.t2i-item.sel').forEach(el => el.classList.remove('sel'));
    mrSaveSel.disabled = true;
  });
}

if (mrClear) {
  mrClear.addEventListener('click', () => {
    if (!mrTasks.length) return;
    if (!confirm('确定清空全部生成结果？本地缓存也会被删除。')) return;
    mrTasks = [];
    mrSelected.clear();
    mrSaveSel.disabled = true;
    mrVideos = [];
    mrItems.innerHTML = '';
    updateMrMeta();
    persistMr();
    mrResultCard.hidden = true;
    showToast('已清空全部生成结果');
  });
}

const mrPickDir = document.getElementById('mrPickDir');
if (mrPickDir) {
  if (!window.showDirectoryPicker) mrPickDir.hidden = true;
  else mrPickDir.addEventListener('click', async () => { if (await pickDir()) { mrPickDir.textContent = '已选目录'; } });
}

// ===== MiniMaxH3 Director 节点风格 UI（暂未对接 API） =====
(function initMiniMaxDirector() {
  const page = document.getElementById('pageDirector');
  if (!page) return;

  // --- 工具函数 ---
  const $ = (id) => document.getElementById(id);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const randSeed = () => Math.floor(Math.random() * 1e15);

  // --- 公共参数面板折叠 ---
  page.querySelectorAll('.pp-header[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const group = el.closest('.public-params');
      group.classList.toggle('collapsed');
      const body = group.querySelector('.pp-body');
      if (body) body.classList.toggle('collapsed', group.classList.contains('collapsed'));
    });
  });

  // --- 素材组状态 ---
  let groups = [
    {
      id: 0,
      refSize: 'match',
      seconds: 10,
      prompt: '',
      files: { publicImages: [], groupImages: [], videos: [], audios: [] }
    }
  ];
  let selectedGroupId = 0;
  const TASK_LABELS = {
    t2v: '文生视频', i2v: '图生视频', fl2v: '首尾帧生视频',
    r2v: '参考主体生视频', v2v: '视频转视频', rv2v: '参考素材改视频'
  };

  // --- 渲染单个素材组 ---
  function renderGroup(g, idx) {
    const type = $('mmxTaskType').value;
    const totalFrames = Math.max(1, Math.round(num($('mmxOutFps').value, 24) * g.seconds));
    const startFrame = idx === 0 ? 1 : (groups.slice(0, idx).reduce((s, x) => s + Math.max(1, Math.round(num($('mmxOutFps').value, 24) * x.seconds)), 0) + 1);
    const endFrame = startFrame + totalFrames - 1;

    const el = document.createElement('div');
    el.className = 'material-group' + (g.id === selectedGroupId ? ' selected' : '');
    el.dataset.groupId = g.id;
    el.innerHTML = `
      <div class="group-header">
        <div class="group-title">素材组 ${idx + 1}</div>
        <div class="group-meta">
          <select class="group-refsize" title="参考图尺寸">
            <option value="match" ${g.refSize === 'match' ? 'selected' : ''}>match</option>
            <option value="512" ${g.refSize === '512' ? 'selected' : ''}>512</option>
            <option value="768" ${g.refSize === '768' ? 'selected' : ''}>768</option>
            <option value="1024" ${g.refSize === '1024' ? 'selected' : ''}>1024</option>
          </select>
          <input type="number" class="group-seconds" value="${g.seconds}" min="1" max="60" step="0.1" title="秒数" />
          <button type="button" class="group-del" title="删除本组">×</button>
        </div>
      </div>
      <div class="group-body ${type === 't2v' ? 'fullwidth' : ''}">
        ${type !== 't2v' ? `
        <div class="media-section">
          <div class="media-section-title"><span>公共图片（只读预览）</span><span class="count">${g.files.publicImages.length}</span></div>
          <div class="media-grid col-2" data-kind="publicImages">
            ${[0, 1].map(i => renderMediaCell(g, 'publicImages', i, '图片', 'image/*')).join('')}
          </div>
        </div>
        ` : ''}
        ${type !== 't2v' ? `
        <div class="media-section">
          <div class="media-section-title"><span>本组图片（从图片3起）</span><span class="count">${Math.max(0, g.files.groupImages.length - 2)}/7</span></div>
          <div class="media-grid" data-kind="groupImages">
            ${[0, 1, 2].map(i => renderMediaCell(g, 'groupImages', i + 2, `图片 ${i + 3}`, 'image/*')).join('')}
          </div>
        </div>
        ` : ''}
        ${['v2v', 'rv2v'].includes(type) ? `
        <div class="media-section">
          <div class="media-section-title"><span>参考视频</span><span class="count">${g.files.videos.length}</span></div>
          <div class="media-grid" data-kind="videos">
            ${[0, 1, 2].map(i => renderMediaCell(g, 'videos', i, `视频 ${i + 1}`, 'video/*')).join('')}
          </div>
        </div>
        ` : ''}
        ${['r2v', 'v2v', 'rv2v'].includes(type) ? `
        <div class="media-section">
          <div class="media-section-title"><span>本组音频（从音频2起）</span><span class="count">${Math.max(0, g.files.audios.length - 1)}/2</span></div>
          <div class="media-grid col-2" data-kind="audios">
            ${[0, 1].map(i => renderMediaCell(g, 'audios', i + 1, `音频 ${i + 2}`, 'audio/*')).join('')}
          </div>
        </div>
        ` : ''}
        <div class="group-prompt">
          <label>提示词（${startFrame}-${endFrame}）</label>
          <textarea class="group-prompt-text" placeholder="0-${g.seconds}s：描述该段时间的画面、动作、镜头..."></textarea>
        </div>
      </div>
    `;

    // 绑定事件
    el.addEventListener('click', (e) => {
      if (e.target.closest('.group-del') || e.target.closest('.media-cell') || e.target.closest('.group-meta')) return;
      selectedGroupId = g.id;
      refreshGroups();
    });

    const refSize = el.querySelector('.group-refsize');
    if (refSize) refSize.addEventListener('change', () => { g.refSize = refSize.value; });

    const seconds = el.querySelector('.group-seconds');
    if (seconds) seconds.addEventListener('change', () => {
      g.seconds = Math.max(0.1, Math.min(60, num(seconds.value, 1)));
      seconds.value = g.seconds;
      refreshGroups();
      updateTimeline();
    });

    const delBtn = el.querySelector('.group-del');
    if (delBtn) delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (groups.length <= 1) { if (window.showToast) showToast('至少保留一个素材组', 'error'); return; }
      groups = groups.filter(x => x.id !== g.id);
      if (selectedGroupId === g.id) selectedGroupId = groups[0]?.id ?? 0;
      refreshGroups();
      updateTimeline();
    });

    const promptTa = el.querySelector('.group-prompt-text');
    if (promptTa) {
      promptTa.value = g.prompt || '';
      promptTa.addEventListener('input', () => { g.prompt = promptTa.value; });
    }

    bindMediaCells(el, g);
    return el;
  }

  function renderMediaCell(g, kind, idx, label, accept) {
    const file = g.files[kind][idx];
    const filled = file ? ' filled' : '';
    const preview = file ? (file.type.startsWith('video/') ? `<video src="${file.url}" muted></video>` : file.type.startsWith('audio/') ? `<audio src="${file.url}" controls></audio>` : `<img src="${file.url}" alt="">`) : '';
    return `<div class="media-cell${filled}" data-kind="${kind}" data-idx="${idx}" data-accept="${accept}" title="点击选择/替换 ${label}">
      ${file ? '' : '<svg class="plus" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}
      ${file ? '' : `<span class="label">${label}</span>`}
      ${preview}
      <button type="button" class="remove" title="移除">×</button>
    </div>`;
  }

  function bindMediaCells(el, g) {
    el.querySelectorAll('.media-cell').forEach(cell => {
      const kind = cell.dataset.kind;
      const idx = parseInt(cell.dataset.idx, 10);
      const input = document.createElement('input');
      input.type = 'file'; input.accept = cell.dataset.accept; input.hidden = true;
      cell.appendChild(input);

      cell.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove')) {
          e.stopPropagation();
          delete g.files[kind][idx];
          refreshGroups();
          return;
        }
        input.click();
      });

      input.addEventListener('change', () => {
        const f = input.files[0];
        if (!f) return;
        g.files[kind][idx] = { file: f, url: URL.createObjectURL(f), type: f.type, name: f.name };
        refreshGroups();
      });
    });
  }

  function refreshGroups() {
    const container = $('mmxGroups');
    if (!container) return;
    container.innerHTML = '';
    groups.forEach((g, idx) => container.appendChild(renderGroup(g, idx)));
    updateGroupInfo();
  }

  // --- 时间轴 ---
  function updateTimeline() {
    const fps = Math.max(1, num($('mmxOutFps').value, 24));
    const track = $('mmxTimelineTrack');
    const ruler = $('mmxTimelineRuler');
    if (!track) return;

    let totalSeconds = 0;
    groups.forEach(g => totalSeconds += g.seconds);
    const totalFrames = Math.max(1, Math.round(totalSeconds * fps));

    // 刻度
    const tickCount = 11;
    let ticks = '';
    for (let i = 0; i < tickCount; i++) {
      const t = (totalSeconds * i / (tickCount - 1)).toFixed(1);
      ticks += `<span>${t}</span>`;
    }
    if (ruler) ruler.innerHTML = ticks;

    // 段落
    let html = '';
    let start = 0;
    groups.forEach((g, idx) => {
      const frames = Math.max(1, Math.round(g.seconds * fps));
      const width = (frames / totalFrames * 100).toFixed(2);
      html += `<div class="timeline-segment${g.id === selectedGroupId ? ' active' : ''}" data-group-id="${g.id}" style="width:${width}%">${start + 1}-${start + frames}</div>`;
      start += frames;
    });
    track.innerHTML = html;

    track.querySelectorAll('.timeline-segment').forEach(seg => {
      seg.addEventListener('click', () => {
        selectedGroupId = parseInt(seg.dataset.groupId, 10);
        refreshGroups();
      });
    });

    updateGroupInfo();
  }

  function updateGroupInfo() {
    const fps = Math.max(1, num($('mmxOutFps').value, 24));
    const type = $('mmxTaskType').value;
    const totalSeconds = groups.reduce((s, g) => s + g.seconds, 0);
    const totalFrames = Math.round(totalSeconds * fps);
    const info = $('mmxGroupInfo');
    if (info) info.textContent = `${type} — ${TASK_LABELS[type]} · ${groups.length} 组提示词 · ${totalSeconds.toFixed(1)}s → ${totalFrames}f（约 ${(totalSeconds + 0.03).toFixed(2)}s）`;
  }

  // --- 输出规格计算 ---
  function calcOutSpec() {
    const ratio = $('mmxOutRatio').value;
    const mp = Math.max(0.1, Math.min(3, num($('mmxOutMegapixels').value, 0.9)));
    const fps = Math.max(1, num($('mmxOutFps').value, 24));
    const totalSeconds = groups.reduce((s, g) => s + g.seconds, 0);

    let w, h;
    if (ratio === '16:9') { h = Math.round(Math.sqrt(mp * 1e6 / (16/9) / 16) * 16); w = Math.round(h * 16 / 9); }
    else if (ratio === '9:16') { w = Math.round(Math.sqrt(mp * 1e6 / (9/16) / 9) * 9); h = Math.round(w * 16 / 9); }
    else if (ratio === '1:1') { w = h = Math.round(Math.sqrt(mp * 1e6)); }
    else if (ratio === '4:3') { h = Math.round(Math.sqrt(mp * 1e6 / (4/3) / 4) * 4); w = Math.round(h * 4 / 3); }
    else { w = Math.round(Math.sqrt(mp * 1e6 / (3/4) / 3) * 3); h = Math.round(w * 4 / 3); }

    // 对齐到 8
    w = Math.round(w / 8) * 8; h = Math.round(h / 8) * 8;

    const spec = $('mmxOutSpec');
    if (spec) spec.textContent = `→ ${w}×${h} · ${ratio} · ${mp.toFixed(1)}MP · ${totalSeconds.toFixed(2)}s @ ${fps}fps`;
  }

  // --- 添加素材组 ---
  const addGroupBtn = $('mmxAddGroup');
  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', () => {
      const newId = groups.length ? Math.max(...groups.map(g => g.id)) + 1 : 0;
      groups.push({ id: newId, refSize: 'match', seconds: 5, prompt: '', files: { publicImages: [], groupImages: [], videos: [], audios: [] } });
      selectedGroupId = newId;
      refreshGroups();
      updateTimeline();
    });
  }

  // --- 删除选中组 ---
  const delGroupBtn = $('mmxDelGroup');
  if (delGroupBtn) {
    delGroupBtn.addEventListener('click', () => {
      if (groups.length <= 1) { if (window.showToast) showToast('至少保留一个素材组', 'error'); return; }
      groups = groups.filter(g => g.id !== selectedGroupId);
      selectedGroupId = groups[0].id;
      refreshGroups();
      updateTimeline();
    });
  }

  // --- task_type / 帧率 / 分辨率 / 像素 联动 ---
  const mmxTaskType = $('mmxTaskType');
  if (mmxTaskType) mmxTaskType.addEventListener('change', () => { refreshGroups(); updateGroupInfo(); calcOutSpec(); });

  ['mmxOutRatio', 'mmxOutMegapixels', 'mmxOutFps'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => { calcOutSpec(); updateTimeline(); });
  });

  // --- 公共参数 ---
  const expandPublic = $('mmxExpandPublic');
  const disablePublic = $('mmxDisablePublic');
  const publicPanel = $('mmxPublicPanel');
  if (expandPublic) expandPublic.addEventListener('click', () => publicPanel && publicPanel.classList.remove('collapsed'));
  if (disablePublic) disablePublic.addEventListener('click', () => {
    const status = publicPanel?.querySelector('.pp-status');
    if (status) status.textContent = '已禁用';
    if (window.showToast) showToast('公共参数已禁用（UI 示意）');
  });

  // --- 导出参数 JSON ---
  function exportMiniMaxParams() {
    const params = {
      task_type: $('mmxTaskType').value,
      // 以下字段已从 UI 中移除，导出时保留原节点默认值，便于后续 API 直接透传
      seed: 222816682858746,
      pre_post_custom: 'randomize',
      steps: 8,
      sampler: 'euler',
      scheduler: 'beta',
      shift_video: 12.0,
      shift_audio: 3.0,
      clear_vram_between_segments: false,
      export_source_images: false,
      output_ratio: $('mmxOutRatio').value,
      output_megapixels: num($('mmxOutMegapixels').value, 0.9),
      output_fps: num($('mmxOutFps').value, 24),
      export_mode: $('mmxExportMode').value,
      public_prompt: $('mmxPublicPrompt').value,
      groups: groups.map(g => ({
        ref_size: g.refSize,
        seconds: g.seconds,
        prompt: g.prompt,
        files: {
          public_images: g.files.publicImages.filter(Boolean).map(f => f.name),
          group_images: g.files.groupImages.filter(Boolean).map(f => f.name),
          videos: g.files.videos.filter(Boolean).map(f => f.name),
          audios: g.files.audios.filter(Boolean).map(f => f.name),
        }
      })),
      // 连接端口占位
      model: null, video_vae: null, audio_vae: null, clip: null,
      i2v_groups: null, r2v_groups: null, refine: null,
    };
    try {
      const blob = new Blob([JSON.stringify(params, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'minimaxh3_director_params.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      if (window.showToast) showToast('已导出参数 JSON（本地，未发起 API 请求）');
    } catch (e) {
      if (window.showToast) showToast('导出失败：' + e.message, 'error');
    }
  }

  const mmxExportBtn = $('mmxExportBtn');
  if (mmxExportBtn) mmxExportBtn.addEventListener('click', exportMiniMaxParams);

  // --- 初始化 ---
  refreshGroups();
  updateTimeline();
  calcOutSpec();

  // --- 缩放系数输入统一校验（图片生成 / 视频生成）---
  function clampScaleInput(e) {
    const input = e.target;
    let v = input.value.trim();
    if (v === '' || v === '.') { input.value = '0.2'; return; }
    let n = parseFloat(v);
    if (isNaN(n)) { input.value = '0.2'; return; }
    if (n < 0.2) input.value = '0.2';
    else if (n > 2) input.value = '2';
    else input.value = String(Math.round(n * 10) / 10);
  }
  document.querySelectorAll('.scale-input').forEach(input => {
    input.addEventListener('input', () => {
      let v = input.value;
      v = v.replace(/[^0-9.]/g, '');
      const parts = v.split('.');
      if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
      input.value = v;
    });
    input.addEventListener('blur', clampScaleInput);
    input.addEventListener('change', clampScaleInput);
  });
// ========== 通用媒体加载组件 MediaLoader ==========
(function () {
  const PRESETS_KEY = 'media_loader_presets';
  const BLOB_DB_NAME = 'MediaLoaderBlobsDB';
  const BLOB_DB_STORE = 'blobs';
  const BLOB_DB_VERSION = 1;
  let uidCounter = 0;

  const KIND_META = {
    images: { label: '图片', accept: 'image/*', type: 'image', render: '_renderImageSlot' },
    videos: { label: '视频', accept: 'video/*', type: 'video', render: '_renderVideoSlot' },
    audios: { label: '音频', accept: 'audio/*', type: 'audio', render: '_renderAudioSlot' }
  };

  function openBlobDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(BLOB_DB_NAME, BLOB_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BLOB_DB_STORE)) db.createObjectStore(BLOB_DB_STORE, { keyPath: 'key' });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
  }

  async function saveBlob(db, key, blob) {
    if (!db) return;
    const tx = db.transaction(BLOB_DB_STORE, 'readwrite');
    tx.objectStore(BLOB_DB_STORE).put({ key, blob });
    return new Promise((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
  }

  async function getBlob(db, key) {
    if (!db) return null;
    const tx = db.transaction(BLOB_DB_STORE, 'readonly');
    const req = tx.objectStore(BLOB_DB_STORE).get(key);
    return new Promise((resolve) => { req.onsuccess = (e) => resolve(e.target.result && e.target.result.blob); req.onerror = () => resolve(null); });
  }

  async function deleteBlob(db, key) {
    if (!db) return;
    const tx = db.transaction(BLOB_DB_STORE, 'readwrite');
    tx.objectStore(BLOB_DB_STORE).delete(key);
    return new Promise((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
  }

  async function deletePresetBlobs(preset) {
    const db = await openBlobDB();
    if (!db) return;
    for (const kind of ['images', 'videos', 'audios']) {
      const list = (preset.files && preset.files[kind]) || (preset[kind] || []);
      list.forEach((m) => { if (m && m.blobKey) deleteBlob(db, m.blobKey); });
    }
  }

  function classifyFile(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'ico'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(ext)) return 'audio';
    return null;
  }

  function formatDuration(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function aspectRatio(w, h) {
    if (!w || !h) return '';
    const g = gcd(w, h);
    return (w / g) + ':' + (h / g);
  }

  function readImageSize(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(img.src); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = URL.createObjectURL(file);
    });
  }

  function readVideoMeta(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      };
      video.onerror = () => resolve({ width: 0, height: 0, duration: 0 });
      video.src = URL.createObjectURL(file);
    });
  }

  class MediaLoader {
    constructor(container, options) {
      if (!container) throw new Error('MediaLoader: container is required');
      this.container = container;
      this.options = Object.assign({ imageMax: 9, videoMax: 3, audioMax: 3, storageKey: 'media_loader_default' }, options || {});
      this.uid = ++uidCounter;
      this.images = new Array(this.options.imageMax).fill(null);
      this.videos = new Array(this.options.videoMax).fill(null);
      this.audios = new Array(this.options.audioMax).fill(null);
      this.presetName = '';
      this.render();
      this.bind();
      this.refresh();
      this._refreshPresetSelect();
    }

    _id(name) { return 'ml_' + name + '_' + this.uid; }
    _$(name) { return document.getElementById(this._id(name)); }

    render() {
      this.container.innerHTML = `
        <div class="media-loader" id="${this._id('root')}">
          <div class="ml-toolbar">
            <div class="ml-toolbar-left">
              <button class="btn-primary" type="button" id="${this._id('loadBtn')}">加载文件...</button>
              <span class="ml-drag-hint">或将文件拖到任意槽位</span>
              <input type="file" id="${this._id('fileInput')}" multiple accept="image/*,video/*,audio/*" hidden>
            </div>
            <div class="ml-toolbar-right">
              <button class="btn-ghost sm" type="button" id="${this._id('clearBtn')}">清空媒体</button>
              <span class="ml-count" id="${this._id('count')}">0 / ${this.options.imageMax + this.options.videoMax + this.options.audioMax}</span>
            </div>
          </div>
          <div class="ml-clear-confirm" id="${this._id('clearConfirm')}" hidden>
            <span class="ml-clear-text">确定清空全部 <b id="${this._id('clearCount')}">0</b> 个素材？</span>
            <div class="ml-clear-actions">
              <button class="btn-ghost sm" type="button" id="${this._id('clearCancelBtn')}">取消</button>
              <button class="btn-primary sm" type="button" id="${this._id('clearOkBtn')}">确定</button>
            </div>
          </div>
          <div class="ml-preset-bar">
            <span class="ml-preset-label">预设</span>
            <select id="${this._id('presetSelect')}">
              <option value="">加载预设...</option>
            </select>
            <button class="btn-primary sm" type="button" id="${this._id('savePresetBtn')}">保存</button>
            <button class="btn-ghost sm danger" type="button" id="${this._id('delPresetBtn')}">删除</button>
          </div>
          <div class="ml-body">
            <div class="ml-section ml-section-wide">
              <div class="ml-section-head">
                <span class="ml-section-title">图片</span>
                <span class="ml-section-count" id="${this._id('imgCount')}">0/${this.options.imageMax}</span>
              </div>
              <div class="ml-grid" id="${this._id('imgGrid')}"></div>
            </div>
            <div class="ml-section ml-section-side">
              <div class="ml-section-head">
                <span class="ml-section-title">视频</span>
                <span class="ml-section-count" id="${this._id('vidCount')}">0/${this.options.videoMax}</span>
              </div>
              <div class="ml-list" id="${this._id('vidList')}"></div>
              <div class="ml-section-head">
                <span class="ml-section-title">音频</span>
                <span class="ml-section-count" id="${this._id('audCount')}">0/${this.options.audioMax}</span>
              </div>
              <div class="ml-list" id="${this._id('audList')}"></div>
            </div>
          </div>
          <div class="ml-label-order" id="${this._id('labelOrder')}">
            <div class="ml-label-order-title">发送给模型的标签顺序</div>
            <div class="ml-label-order-body">尚未加载</div>
          </div>
          <div class="ml-prompt-area" id="${this._id('promptArea')}">
            <div class="ml-prompt-head">
              <span class="ml-prompt-title">提示词（点击上方素材插入标签）</span>
              <button class="btn-ghost sm" type="button" id="${this._id('promptCopyBtn')}">复制提示词</button>
            </div>
            <div class="ml-prompt-input" id="${this._id('promptInput')}" contenteditable="true" spellcheck="false"></div>
          </div>
        </div>
      `;
    }

    bind() {
      const root = this._$('root');
      this._$('loadBtn').addEventListener('click', () => this._$('fileInput').click());
      this._$('fileInput').addEventListener('change', () => this._handleFiles(this._$('fileInput').files));
      this._$('clearBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        const total = this.images.filter(x => x && x.active).length + this.videos.filter(x => x && x.active).length + this.audios.filter(x => x && x.active).length;
        this._$('clearCount').textContent = total;
        this._$('clearConfirm').hidden = false;
      });
      this._$('clearOkBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        this._$('clearConfirm').hidden = true;
        this.clear();
      });
      this._$('clearCancelBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        this._$('clearConfirm').hidden = true;
      });
      document.addEventListener('click', (e) => {
        const confirm = this._$('clearConfirm');
        const btn = this._$('clearBtn');
        if (!confirm || confirm.hidden) return;
        if (confirm.contains(e.target) || (btn && btn.contains(e.target))) return;
        confirm.hidden = true;
      });
      this._$('savePresetBtn').addEventListener('click', () => this._savePreset());
      this._$('delPresetBtn').addEventListener('click', () => this._deletePreset());
      this._$('presetSelect').addEventListener('change', () => this._loadPreset());
      this._$('promptCopyBtn').addEventListener('click', () => this._copyPrompt());
      root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drag'); });
      root.addEventListener('dragleave', () => root.classList.remove('drag'));
      root.addEventListener('drop', (e) => {
        e.preventDefault();
        root.classList.remove('drag');
        this._handleFiles(e.dataTransfer.files);
      });
    }

    async _handleFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const classified = { image: [], video: [], audio: [] };
      for (const f of files) {
        const kind = classifyFile(f);
        if (kind) classified[kind].push(f);
      }
      const warnings = [];
      ['image', 'video', 'audio'].forEach((kind) => {
        const max = this.options[kind + 'Max'];
        const arrName = kind + 's';
        const queue = classified[kind];
        for (let i = 0; i < max && queue.length; i++) {
          if (this[arrName][i]) continue;
          this[arrName][i] = { file: queue.shift(), active: true };
        }
        if (queue.length) {
          warnings.push((kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频') + '超出上限 ' + max + '，已忽略 ' + queue.length + ' 个');
        }
      });
      await this.refresh();
      if (warnings.length && window.showToast) showToast(warnings.join('；'), 'warning');
      if (this.options.onChange) this.options.onChange(this.getFiles());
    }

    async _uploadToSlot(kind, idx, file) {
      const meta = KIND_META[kind];
      if (classifyFile(file) !== meta.type) {
        if (window.showToast) showToast('该槽位仅支持' + meta.label + '文件', 'warning');
        return false;
      }
      const arr = this[kind];
      const firstEmpty = arr.findIndex(s => !s || !s.active);
      const target = firstEmpty === -1 ? idx : firstEmpty;
      arr[target] = { file: file, active: true };
      await this._refreshKind(kind);
      this._renderCounts();
      if (this.options.onChange) this.options.onChange(this.getFiles());
      return true;
    }

    async refresh() {
      await this._refreshKind('images');
      await this._refreshKind('videos');
      await this._refreshKind('audios');
      this._renderCounts();
      this._renderLabelOrder();
      requestAnimationFrame(() => this._setPromptHeight());
    }

    async _refreshKind(kind) {
      const max = kind === 'images' ? this.options.imageMax : kind === 'videos' ? this.options.videoMax : this.options.audioMax;
      for (let i = 0; i < max; i++) {
        await this[KIND_META[kind].render](i);
      }
    }

    _replaceSlot(parent, idx, className) {
      const old = parent.children[idx];
      const el = document.createElement('div');
      el.className = className;
      if (old) parent.replaceChild(el, old); else parent.appendChild(el);
      return el;
    }

    async _renderImageSlot(i) {
      const grid = this._$('imgGrid');
      if (!grid) return;
      const slot = this.images[i];
      const cell = this._replaceSlot(grid, i, 'ml-cell' + (slot && slot.active ? ' filled' : ''));
      if (slot && slot.active) {
        const size = await readImageSize(slot.file);
        slot.width = size.width;
        slot.height = size.height;
        slot.duration = null;
        const ratio = aspectRatio(size.width, size.height);
        const url = URL.createObjectURL(slot.file);
        cell.innerHTML = `
          <div class="ml-thumb"><img src="${url}" alt=""></div>
          <div class="ml-meta">
            <span class="ml-res">${size.width}×${size.height}</span>
            <span class="ml-ratio">${ratio}</span>
          </div>
          <div class="ml-name">Picture ${i + 1}</div>
          <button class="ml-remove" type="button" title="删除">×</button>
        `;
        cell.querySelector('.ml-remove').addEventListener('click', (e) => { e.stopPropagation(); this._removeAt('images', i); });
        cell.addEventListener('click', (e) => { if (e.target.closest('.ml-remove, .ml-mute')) return; this._appendPromptTag('images', i); });
      } else {
        cell.innerHTML = `<div class="ml-empty-wrap"><span class="ml-empty-label">图片 ${i + 1}</span><span class="ml-empty-tip">点击或拖入文件</span></div>`;
        cell.addEventListener('click', (e) => { if (e.target.closest('.ml-remove, .ml-mute')) return; this._openSlotPicker('images', i); });
        cell.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); cell.classList.add('drag-slot'); });
        cell.addEventListener('dragleave', (e) => { e.stopPropagation(); cell.classList.remove('drag-slot'); });
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cell.classList.remove('drag-slot');
          const f = (e.dataTransfer.files || [null])[0];
          if (!f) return;
          this._uploadToSlot('images', i, f);
        });
      }
    }

    async _renderVideoSlot(i) {
      const list = this._$('vidList');
      if (!list) return;
      const slot = this.videos[i];
      const row = this._replaceSlot(list, i, 'ml-row' + (slot && slot.active ? ' filled' : ''));
      if (slot && slot.active) {
        const meta = await readVideoMeta(slot.file);
        slot.width = meta.width;
        slot.height = meta.height;
        slot.duration = meta.duration;
        const url = URL.createObjectURL(slot.file);
        row.innerHTML = `
          <div class="ml-thumb"><video src="${url}" muted></video></div>
          <div class="ml-row-info">
            <div class="ml-row-title">Video ${i + 1}</div>
            <div class="ml-row-sub">${slot.file.name}</div>
          </div>
          <button class="ml-remove" type="button" title="删除">×</button>
        `;
        row.querySelector('.ml-remove').addEventListener('click', (e) => { e.stopPropagation(); this._removeAt('videos', i); });
        row.addEventListener('click', (e) => { if (e.target.closest('.ml-remove, .ml-mute, .ml-play')) return; this._appendPromptTag('videos', i); });
      } else {
        row.innerHTML = `<div class="ml-empty-wrap"><span class="ml-empty-label">视频 ${i + 1}</span><span class="ml-empty-tip">点击或拖入文件</span></div>`;
        row.addEventListener('click', (e) => { if (e.target.closest('.ml-remove, .ml-mute')) return; this._openSlotPicker('videos', i); });
        row.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.add('drag-slot'); });
        row.addEventListener('dragleave', (e) => { e.stopPropagation(); row.classList.remove('drag-slot'); });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          row.classList.remove('drag-slot');
          const f = (e.dataTransfer.files || [null])[0];
          if (!f) return;
          this._uploadToSlot('videos', i, f);
        });
      }
    }

    async _renderAudioSlot(i) {
      const list = this._$('audList');
      if (!list) return;
      const slot = this.audios[i];
      const row = this._replaceSlot(list, i, 'ml-row' + (slot && slot.active ? ' filled' : ''));
      if (slot && slot.active) {
        const url = URL.createObjectURL(slot.file);
        row.innerHTML = `
          <button class="ml-play" type="button" title="播放">▶</button>
          <div class="ml-row-info">
            <div class="ml-row-title">Audio ${i + 1}</div>
            <div class="ml-row-sub">${slot.file.name}</div>
          </div>
          <div class="ml-audio-dur">0:00</div>
          <button class="ml-remove" type="button" title="删除">×</button>
        `;
        const audio = new Audio(url);
        const playBtn = row.querySelector('.ml-play');
        const durEl = row.querySelector('.ml-audio-dur');
        slot.width = null;
        slot.height = null;
        slot.duration = null;
        audio.addEventListener('loadedmetadata', () => { durEl.textContent = formatDuration(audio.duration); slot.duration = audio.duration; });
        playBtn.addEventListener('click', () => { if (audio.paused) { audio.play(); playBtn.textContent = '⏸'; } else { audio.pause(); playBtn.textContent = '▶'; } });
        audio.addEventListener('ended', () => { playBtn.textContent = '▶'; });
        audio.addEventListener('pause', () => { playBtn.textContent = '▶'; });
        row.querySelector('.ml-remove').addEventListener('click', (e) => { e.stopPropagation(); this._removeAt('audios', i); });
        row.addEventListener('click', (e) => { if (e.target.closest('.ml-remove, .ml-mute, .ml-play')) return; this._appendPromptTag('audios', i); });
      } else {
        row.innerHTML = `<div class="ml-empty-wrap"><span class="ml-empty-label">音频 ${i + 1}</span><span class="ml-empty-tip">点击或拖入文件</span></div>`;
        row.addEventListener('click', (e) => { if (e.target.closest('.ml-remove, .ml-mute')) return; this._openSlotPicker('audios', i); });
        row.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.add('drag-slot'); });
        row.addEventListener('dragleave', (e) => { e.stopPropagation(); row.classList.remove('drag-slot'); });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          row.classList.remove('drag-slot');
          const f = (e.dataTransfer.files || [null])[0];
          if (!f) return;
          this._uploadToSlot('audios', i, f);
        });
      }
    }

    _openSlotPicker(kind, idx) {
      const meta = KIND_META[kind];
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = meta.accept;
      input.hidden = true;
      input.addEventListener('change', () => {
        const f = input.files[0];
        if (f) this._uploadToSlot(kind, idx, f);
      });
      input.click();
    }

    _renderCounts() {
      const imgActive = this.images.filter(x => x && x.active).length;
      const vidActive = this.videos.filter(x => x && x.active).length;
      const audActive = this.audios.filter(x => x && x.active).length;
      const total = imgActive + vidActive + audActive;
      const max = this.options.imageMax + this.options.videoMax + this.options.audioMax;
      this._$('imgCount').textContent = imgActive + '/' + this.options.imageMax;
      this._$('vidCount').textContent = vidActive + '/' + this.options.videoMax;
      this._$('audCount').textContent = audActive + '/' + this.options.audioMax;
      this._$('count').textContent = total + ' / ' + max;
      this._renderLabelOrder();
      this._emitPreview();
    }

    _emitPreview() {
      if (typeof this.options.onPreview === 'function') {
        this.options.onPreview(this.getFiles());
      }
    }

    _renderLabelOrder() {
      const labelOrder = this._$('labelOrder');
      if (!labelOrder) return;
      const labels = [];
      this.images.forEach((s, i) => { if (s && s.active) labels.push('Picture ' + (i + 1)); });
      this.videos.forEach((s, i) => { if (s && s.active) labels.push('Video ' + (i + 1)); });
      this.audios.forEach((s, i) => { if (s && s.active) labels.push('Audio ' + (i + 1)); });
      const body = labelOrder.querySelector('.ml-label-order-body');
      if (body) body.textContent = labels.length ? labels.join(' · ') : '尚未加载';
    }

    async _removeAt(kind, idx) {
      const arr = this[kind];
      arr.splice(idx, 1);
      arr.push(null);
      await this._refreshKind(kind);
      this._renderCounts();
      this._renderLabelOrder();
      if (this.options.onChange) this.options.onChange(this.getFiles());
    }

    _toggleActive(kind, idx) {
      const s = this[kind][idx];
      if (!s) return;
      s.active = !s.active;
      const meta = KIND_META[kind];
      this[meta.render](idx);
      this._renderCounts();
      this._renderLabelOrder();
      if (this.options.onChange) this.options.onChange(this.getFiles());
    }

    clear() {
      this.images = new Array(this.options.imageMax).fill(null);
      this.videos = new Array(this.options.videoMax).fill(null);
      this.audios = new Array(this.options.audioMax).fill(null);
      this.presetName = '';
      this._$('presetSelect').value = '';
      this._clearPrompt();
      this.refresh();
      if (this.options.onChange) this.options.onChange(this.getFiles());
    }

    getFiles() {
      return {
        images: this.images.map((s, i) => s && s.active ? Object.assign({ _slot: i }, s) : null).filter(Boolean),
        videos: this.videos.map((s, i) => s && s.active ? Object.assign({ _slot: i }, s) : null).filter(Boolean),
        audios: this.audios.map((s, i) => s && s.active ? Object.assign({ _slot: i }, s) : null).filter(Boolean)
      };
    }

    // 总资源数量 = 图片 + 视频 + 音频
    getTotalCount() {
      return this.images.filter(s => s && s.active).length
        + this.videos.filter(s => s && s.active).length
        + this.audios.filter(s => s && s.active).length;
    }

    // 提交前统一校验：图片 + 视频 + 音频 的总资源数量必须 >= 1
    validateMedia() {
      const total = this.getTotalCount();
      if (total < 1) {
        return { ok: false, total: 0, message: '图片 + 视频 + 音频 的总资源数量至少为 1' };
      }
      return { ok: true, total: total };
    }

    // 把所有已加载素材上传到 RunningHub，拿回真实 fileName 写回 slot.uploadedName。
    // 组件移植到任意分类时，提交工作流前 await 一次即可，file 字段不再是占位值。
    async uploadMedia(options) {
      const opts = options || {};
      const endpoint = opts.endpoint || '/api/rh-media-upload';
      const check = this.validateMedia();
      if (!check.ok) throw new Error(check.message);
      const all = [];
      ['images', 'videos', 'audios'].forEach((kind) => {
        this[kind].forEach((s, i) => { if (s && s.active) all.push({ kind: kind, index: i, slot: s }); });
      });
      if (opts.onProgress) opts.onProgress(0, all.length);
      let ok = 0;
      const errors = [];
      for (let n = 0; n < all.length; n++) {
        const item = all[n];
        const slot = item.slot;
        try {
          const fd = new FormData();
          fd.append('file', slot.file, slot.file.name);
          const resp = await fetch(endpoint, { method: 'POST', body: fd });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          if (data.error) throw new Error(data.message || data.error);
          if (!data.fileName) throw new Error('上传未返回 fileName');
          slot.uploadedName = data.fileName;
          ok += 1;
        } catch (e) {
          errors.push(slot.file.name + '：' + (e && e.message ? e.message : String(e)));
        }
        if (opts.onProgress) opts.onProgress(n + 1, all.length);
      }
      this._renderCounts();
      return { uploaded: ok, failed: errors.length, errors: errors };
    }

    getLabelOrder() {
      return this._$('labelOrder').querySelector('.ml-label-order-body').textContent;
    }

    _slotLabel(kind, idx) {
      if (kind === 'images') return 'Picture ' + (idx + 1);
      if (kind === 'videos') return 'Video ' + (idx + 1);
      if (kind === 'audios') return 'Audio ' + (idx + 1);
      return '';
    }

    _appendPromptTag(kind, idx) {
      const slot = this[kind][idx];
      if (!slot || !slot.active) return;
      const input = this._$('promptInput');
      if (!input) return;
      const label = this._slotLabel(kind, idx);
      if (!label) return;

      const thumb = document.createElement(kind === 'images' ? 'img' : 'span');
      thumb.className = 'ml-prompt-thumb' + (kind !== 'images' ? ' ml-prompt-thumb-ph' : '');
      thumb.contentEditable = 'false';
      if (kind === 'images') {
        thumb.src = URL.createObjectURL(slot.file);
        thumb.alt = '';
      } else if (kind === 'videos') {
        thumb.textContent = '▶';
      } else {
        thumb.textContent = '♪';
      }

      const tag = document.createElement('span');
      tag.className = 'ml-prompt-tag';
      tag.contentEditable = 'false';
      tag.textContent = '<' + label + '>';

      input.appendChild(thumb);
      input.appendChild(tag);
      input.appendChild(document.createTextNode(' '));
      this._focusPromptEnd(input);
    }

    _focusPromptEnd(input) {
      const el = input || this._$('promptInput');
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    _clearPrompt() {
      const input = this._$('promptInput');
      if (input) input.innerHTML = '';
    }

    _getPromptText() {
      const input = this._$('promptInput');
      if (!input) return '';
      let text = '';
      input.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
        else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('ml-prompt-thumb')) text += node.textContent;
      });
      return text.replace(/\s+/g, ' ').trim();
    }

    _copyPrompt() {
      const text = this._getPromptText();
      if (!text) {
        if (window.showToast) showToast('提示词为空', 'warning');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) showToast('已复制提示词');
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (window.showToast) showToast('已复制提示词');
      });
    }

    _setPromptHeight() {
      const input = this._$('promptInput');
      if (!input) return;
      const grid = this._$('imgGrid');
      let h = 92;
      if (grid && grid.firstElementChild) {
        const cellH = grid.firstElementChild.offsetHeight;
        if (cellH > 0) h = Math.round(cellH * 2);
      }
      input.style.height = h + 'px';
      input.style.minHeight = h + 'px';
    }

    _listPresets() {
      try {
        const list = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    }

    _savePresetList(list) {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
    }

    _refreshPresetSelect() {
      const select = this._$('presetSelect');
      const presets = this._listPresets();
      select.innerHTML = '<option value="">加载预设...</option>';
      presets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    }

    async _savePreset() {
      const name = prompt('请输入预设名称：');
      if (!name) return;
      const presets = this._listPresets();
      const existing = presets.find((p) => p.name === name);
      if (existing) await deletePresetBlobs(existing);
      const db = await openBlobDB();
      const filesMeta = { images: [], videos: [], audios: [] };
      for (const kind of ['images', 'videos', 'audios']) {
        const max = kind === 'images' ? this.options.imageMax : kind === 'videos' ? this.options.videoMax : this.options.audioMax;
        const arr = this[kind];
        for (let i = 0; i < max; i++) {
          const s = arr[i];
          if (!s) { filesMeta[kind].push(null); continue; }
          const key = `${name}::${kind}::${i}`;
          const blob = s.file.slice(0, s.file.size, s.file.type);
          await saveBlob(db, key, blob);
          filesMeta[kind].push({
            name: s.file.name,
            path: s.file.webkitRelativePath || s.file.name,
            size: s.file.size,
            type: s.file.type,
            active: s.active,
            blobKey: key
          });
        }
      }
      const record = { name: name, createdAt: Date.now(), files: filesMeta };
      const idx = presets.findIndex((p) => p.name === name);
      if (idx >= 0) presets[idx] = record; else presets.push(record);
      this._savePresetList(presets);
      this._refreshPresetSelect();
      this._$('presetSelect').value = name;
      if (window.showToast) showToast('已保存预设：' + name);
    }

    async _loadPreset() {
      const name = this._$('presetSelect').value;
      if (!name) return;
      const preset = this._listPresets().find((p) => p.name === name);
      if (!preset) return;
      const db = await openBlobDB();
      this.images = new Array(this.options.imageMax).fill(null);
      this.videos = new Array(this.options.videoMax).fill(null);
      this.audios = new Array(this.options.audioMax).fill(null);
      const unmatched = [];
      for (const kind of ['images', 'videos', 'audios']) {
        const max = kind === 'images' ? this.options.imageMax : kind === 'videos' ? this.options.videoMax : this.options.audioMax;
        const metaList = (preset.files && preset.files[kind]) || (preset[kind] || []);
        for (let i = 0; i < max && i < metaList.length; i++) {
          const m = metaList[i];
          if (!m || !m.active) continue;
          const blob = await getBlob(db, m.blobKey || `${name}::${kind}::${i}`);
          if (blob) {
            const file = new File([blob], m.name, { type: m.type || 'application/octet-stream', lastModified: Date.now() });
            this[kind][i] = { file: file, active: true };
          } else {
            unmatched.push(m.name);
          }
        }
      }
      await this.refresh();
      if (unmatched.length && window.showToast) showToast('未恢复文件：' + unmatched.join('、'), 'warning');
      if (this.options.onChange) this.options.onChange(this.getFiles());
    }

    async _deletePreset() {
      const name = this._$('presetSelect').value;
      if (!name) return;
      if (!confirm('删除“' + name + '”？媒体文件不会被删除。')) return;
      const preset = this._listPresets().find((p) => p.name === name);
      if (preset) await deletePresetBlobs(preset);
      const presets = this._listPresets().filter((p) => p.name !== name);
      this._savePresetList(presets);
      this._refreshPresetSelect();
      this._$('presetSelect').value = '';
      if (window.showToast) showToast('已删除预设：' + name);
    }
  }

  window.MediaLoader = MediaLoader;

  // 测试UI：根据 MediaLoader 当前文件生成节点 300（MiniMaxH3MediaLoaderFantastic）的 media_state 上传数据
  function renderTestUiNodePreview(files) {
    const jsonEl = document.getElementById('testUiNodeJson');
    const countEl = document.getElementById('testUiNodeCount');
    if (!jsonEl) return;
    const items = [];
    const kindMap = { images: 'picture', videos: 'video', audios: 'audio' };
    let pending = 0;
    ['images', 'videos', 'audios'].forEach((kind) => {
      (files && files[kind] || []).forEach((s) => {
        if (!s) return;
        const fname = (s.file && s.file.name) || '';
        // file 必须是 rh_upload 返回的 RunningHub fileName；未上传时留空，绝不用占位文本
        const rhName = s.uploadedName || '';
        if (!rhName) pending += 1;
        const raw = s.duration;
        const duration = (raw === undefined || raw === null || raw === '' || isNaN(Number(raw))) ? null : Number(Number(raw).toFixed(2));
        items.push({
          kind: kindMap[kind],
          file: rhName,
          name: fname,
          duration: duration,
          width: s.width || null,
          height: s.height || null,
          has_audio: false,
          audio_mode: 'off'
        });
      });
    });
    const nodeInfo = {
      nodeId: '300',
      fieldName: 'media_state',
      fieldValue: JSON.stringify(items)
    };
    window.__testUiNodeInfo = nodeInfo;
    if (countEl) {
      if (!items.length) {
        countEl.textContent = '0（图片+视频+音频 总数需 ≥ 1）';
      } else {
        countEl.textContent = pending ? String(items.length) + '（' + pending + ' 个待上传）' : String(items.length);
      }
    }
    jsonEl.textContent = JSON.stringify(nodeInfo, null, 2);
  }

  // 资源总数 < 1 时禁用上传按钮，满足校验后才可用
  function updateTestUiUploadBtn() {
    const btn = document.getElementById('testUiUploadBtn');
    const loader = window.testUiLoader;
    if (!btn || !loader) return;
    const check = loader.validateMedia();
    btn.disabled = !check.ok;
    btn.title = check.ok ? '' : check.message;
  }

  function bindTestUiNodeCopy() {
    const btn = document.getElementById('testUiNodeCopy');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const info = window.__testUiNodeInfo;
      if (!info) { if (window.showToast) showToast('暂无数据'); return; }
      const text = JSON.stringify(info, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          if (window.showToast) showToast('已复制 nodeInfoList');
        }).catch(() => {
          if (window.showToast) showToast('复制失败', 'error');
        });
      } else if (window.showToast) {
        showToast('当前环境不支持剪贴板', 'error');
      }
    });
  }

  // 测试UI：把 MediaLoader 里的素材批量上传到 RunningHub，拿回真实 fileName 后刷新 JSON
  function bindTestUiUpload() {
    const btn = document.getElementById('testUiUploadBtn');
    const tip = document.getElementById('testUiUploadTip');
    if (!btn) return;
    updateTestUiUploadBtn();
    btn.addEventListener('click', async () => {
      const loader = window.testUiLoader;
      if (!loader) return;
      const check = loader.validateMedia();
      if (!check.ok) {
        if (tip) { tip.hidden = false; tip.textContent = check.message; }
        if (window.showToast) showToast(check.message, 'warning');
        return;
      }
      const total = check.total;
      btn.disabled = true;
      const oldText = btn.textContent;
      if (tip) { tip.hidden = false; tip.textContent = '正在上传 0 / ' + total + ' ...'; }
      try {
        const res = await loader.uploadMedia({
          onProgress: function(done, all) {
            btn.textContent = '上传中 ' + done + '/' + all;
            if (tip) tip.textContent = '正在上传 ' + done + ' / ' + all + ' ...';
          }
        });
        if (res.failed) {
          if (tip) tip.textContent = '成功 ' + res.uploaded + ' 个，失败 ' + res.failed + ' 个：' + res.errors.join('；');
          if (window.showToast) showToast('部分素材上传失败', 'error');
        } else {
          if (tip) tip.textContent = '全部上传完成（' + res.uploaded + ' 个），file 已是 RunningHub 真实 fileName';
          if (window.showToast) showToast('已上传 ' + res.uploaded + ' 个素材');
        }
        renderTestUiNodePreview(loader.getFiles());
      } catch (e) {
        if (tip) tip.textContent = '上传出错：' + (e && e.message ? e.message : String(e));
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });
  }

  // showPage 位于全局作用域（IIFE 之外），必须显式挂到 window 才能被测试UI 初始化代码调用，
  // 否则调用时抛 ReferenceError，导致右侧节点 JSON 永远不刷新。
  window.renderTestUiNodePreview = renderTestUiNodePreview;
  window.bindTestUiNodeCopy = bindTestUiNodeCopy;
  window.bindTestUiUpload = bindTestUiUpload;
  window.updateTestUiUploadBtn = updateTestUiUploadBtn;
})();




















})();
