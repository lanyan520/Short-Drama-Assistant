/* 提示词自动化：舞蹈换人换装提示词生成器（依赖 app.js 全局 $ / $$ / api / toast） */
(function () {
  const pf = { img: "", vid: "" };

  async function pick(kind) {
    const prompt = kind === "img" ? "选择人物A参考图片" : "选择人物B舞蹈视频";
    try {
      const r = await api("/api/pick-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, default: (kind === "img" ? pf.img : pf.vid) || "" }),
      });
      if (r.cancelled) return;
      if (kind === "img") {
        pf.img = r.path;
        $("#pf-img").textContent = r.path.split("/").pop();
      } else {
        pf.vid = r.path;
        $("#pf-vid").textContent = r.path.split("/").pop();
      }
    } catch (e) { toast("选择文件失败：" + (e.message || e)); }
  }

  $("#pf-pick-img").onclick = () => pick("img");
  $("#pf-pick-vid").onclick = () => pick("vid");

  $("#pf-gen").onclick = () => {
    const aDesc = ($("#pf-a-desc").value || "").trim();
    const cloth = ($("#pf-cloth").value || "").trim();
    const out = ($("#pf-out").value || "").trim();
    const extra = ($("#pf-extra").value || "").trim();
    const keeps = $$(".pf-keep:checked").map(c => c.value);

    if (!pf.img) toast("请先选择人物A参考图片");
    if (!pf.vid) toast("请先选择人物B舞蹈视频");
    if (!pf.img || !pf.vid) return;

    const keepLine = keeps.length
      ? keeps.join("、")
      : "（无）";

    const imgName = pf.img.split("/").pop();
    const vidName = pf.vid.split("/").pop();

    const prompt =
`使用「全能参考」功能生成一段舞蹈视频。

【身份主体 · 参考图片】${imgName}
${aDesc || "以参考图片中的人物A为准：面部五官、脸型、肤色、年龄感、妆容风格、发型与发色、身材比例与体型均严格保持人物A，不得改动。"}

【动作参考 · 参考视频】${vidName}
完整克隆该视频中人物B的肢体动作、舞蹈编排、姿态、节奏与镜头运动，作为最终视频的动作来源。

【换人与换装规则】
将参考视频中的人物B替换为人物A；${cloth || "让人物A换上参考视频中人物B所穿的服装，款式、颜色、图案、材质与B保持一致。"}

【一致性要求】
保持以下要素一致：${keepLine}；画面稳定自然，避免穿帮与边缘抖动、避免面部扭曲。

【输出要求】
${out || "1080p，横屏，连贯舞蹈，时长与原视频一致。"}${extra ? "\n\n【附加指令】\n" + extra : ""}

参考图片：${pf.img}
参考视频：${pf.vid}`;

    $("#pf-result").value = prompt;
    $("#pf-copy").disabled = false;
  };

  $("#pf-copy").onclick = async () => {
    const text = $("#pf-result").value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("提示词已复制");
    } catch (e) {
      const ta = $("#pf-result");
      ta.select();
      document.execCommand && document.execCommand("copy");
      toast("提示词已复制");
    }
  };
})();
