# 短剧助手 (Short Drama Assistant)

本地运行的 Web 应用，面向**短剧 / AI 视频创作**工作流。纯前端 + 标准库后端，无第三方 Web 框架依赖；集成 RunningHub 工作流做 AI 视频生成，并内置抖音 / 小红书无水印下载器。

## 界面预览

> 以下截图用于快速了解界面与功能（缩放以看清文字为准，在线可继续调整）。

**去水印下载**

<img src="images/去水印.png" width="900" alt="去水印下载界面">

**设置**

<img src="images/设置.png" width="900" alt="设置界面">

**MiniMax H3 生视频（1）**

<img src="images/h3_1.png" width="900" alt="H3 生视频界面 1">

**MiniMax H3 生视频（2）**

<img src="images/h3_2.png" width="900" alt="H3 生视频界面 2">

## 功能特性

- **AI 视频生成**（RunningHub 工作流）：文生视频、图生视频、首帧 / 尾帧 / 首尾帧生视频、全能参考双模双采（MiniMax H3 资源面板）等。
- **MiniMax H3 资源面板**：可视化拼装多图 / 视频 / 音频素材，自动上传并组装 `media_state` JSON 提交。
- **无水印下载器**：粘贴抖音 / 小红书链接 → 解析无水印直链 → 选目录 + 分类批量下载（独立子项目）。
- **配置中心**：RunningHub Key、并发数、超时等在网页「设置」里填写，存于本地 `config.json`。

## 目录结构

```
短剧助手/                        # 仓库根目录（即 server.py 所在目录；本副本为 idea_lanyan/）
├── index.html                   # 主页面
├── app.js                       # 前端逻辑（原生 JS）
├── styles.css                   # 样式
├── server.py                    # 后端（Python 标准库 http.server，无框架、零第三方依赖）
├── dl.js                        # 下载器前端
├── data/
│   └── minimax_h3_guide.json    # MiniMax H3 使用指南（静态参考内容）
├── pages/
│   └── prompt_guide.html        # 提示词指南页（iframe 加载）
├── config.example.json          # config.json 的脱敏模板（复制为 config.json 后填值）
├── .gitignore
├── README.md
└── downloader/                  # 无水印下载器（本副本已作为普通文件夹包含；上游仓库可用 git submodule 引入）
```

> 不上传的内容见 `.gitignore`：`config.json`（含 API Key）、`rh_tasks.json`（任务记录）、`_recovered/`（生成产物）、各 `*.log`、`.broken-backups/`、`__pycache__/` 等。

## 环境要求

- **主服务（server.py）**：Python 3.10+ 即可，**仅需标准库，零第三方依赖**，无需 `pip install`。
- **下载器（downloader/，可选）**：额外需要 `fastapi` / `uvicorn[standard]` / `httpx` / `gmssl` / `Pillow`（见下方安装）。
- 操作系统：macOS / Linux（下载器用到原生目录选择框，macOS 体验最佳）。

## 快速开始

```bash
# 0. 进入仓库根目录（即 server.py 所在目录；本副本为 idea_lanyan/）
cd /path/to/短剧助手

# 1. 准备配置
cp config.example.json config.json
#   编辑 config.json，至少填入 rhKey（RunningHub API Key）
#   可选：需要去水印下载时，填 dlDir / dlVenvPy，或设置环境变量 DL_DIR / DL_VENV_PY

# 2. 安装下载器依赖（仅在使用“去水印下载”时需要；不影响 AI 视频生成）
pip install -r downloader/requirements.txt
#   注：本副本的 downloader/ 已是普通文件夹，无需执行 git submodule add

# 3. 启动主服务（仅依赖 Python 3.10+ 标准库）
python3 server.py
#   浏览器打开 http://127.0.0.1:8777
```

主服务默认监听 `127.0.0.1:8777`。下载器（如启用）默认 `127.0.0.1:8899`，由主服务按需自动拉起。

## 下载器依赖（可选，独立子项目）

去水印下载器位于独立仓库 `douyin-xhs-downloader`。

- **本副本（idea_lanyan/）**：`downloader/` 已是普通文件夹，直接 `pip install -r downloader/requirements.txt` 即可，**无需** `git submodule add`。
- **上游 GitHub 仓库**（若要单独管理下载器）：可改为 `git submodule add <downloader-repo-url> downloader`，并在 `.gitmodules` 中登记。

其依赖（`downloader/requirements.txt`）：`fastapi`、`uvicorn[standard]`、`httpx`、`gmssl`、`Pillow`。

安装方式二选一：
- **A. 用当前 Python 直接跑**（最简单）：`pip install -r downloader/requirements.txt`，无需额外配置，`server.py` 会自动用当前 Python 拉起下载器。
- **B. 独立虚拟环境**：自行创建 venv 并安装依赖，然后把该 venv 的 python 路径填进 `config.json` 的 `dlVenvPy`（或设置环境变量 `DL_VENV_PY`）。

## 配置说明

配置存于 `config.json`（**不入库**，请基于 `config.example.json` 创建）。字段：

| 字段 | 说明 |
|---|---|
| `rhKey` | RunningHub API Key（必填，用于提交工作流） |
| `rhWorkflowId` | 默认工作流 ID |
| `rhConcurrency` | 并发数（≥1） |
| `rhTimeout` | 任务超时（秒，≥20） |
| `model` / `key` | 历史遗留字段，当前未使用，可留空 |
| `dlDir` | 下载器目录；**优先级低于环境变量 `DL_DIR`**，低于则回退到同目录 `downloader/` |
| `dlVenvPy` | 下载器专用 Python 路径；**优先级低于环境变量 `DL_VENV_PY`**，低于则用当前 Python |

### 路径解析优先级（已做开源适配，不再硬编码本机路径）

下载器目录 `DL_DIR`：
```
环境变量 DL_DIR  >  config.json 的 dlDir  >  同目录 downloader/
```
下载器 Python `DL_VENV_PY`：
```
环境变量 DL_VENV_PY  >  config.json 的 dlVenvPy  >  当前 Python（sys.executable）
```

示例（仅本机生效，不要提交）：
```json
{ "dlDir": "/abs/path/to/douyin-xhs-downloader",
  "dlVenvPy": "/abs/path/to/venv/bin/python" }
```
或启动前：
```bash
export DL_DIR=/abs/path/to/douyin-xhs-downloader
export DL_VENV_PY=/abs/path/to/venv/bin/python
python3 server.py
```

## 主要 API

| 端点 | 说明 |
|---|---|
| `GET/POST /api/config` | 读取 / 保存本地配置 |
| `POST /api/rh-mr-generate` | 全能参考双模双采视频生成（MiniMax H3 资源面板） |
| `POST /api/rh-bothframe-generate` | 首尾帧生视频 |
| `/api/dl/*` | 去水印下载器代理（需下载器子项目） |

## 许可证

本项目以 MIT 许可证开源（详见 `LICENSE`）。下载器子项目遵循其自身许可证。
