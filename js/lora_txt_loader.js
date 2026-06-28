import { app } from "../../scripts/app.js";

// ════════════════════════════════════════════════════════
//  级联菜单核心（已针对上万个 LoRA 优化）
// ════════════════════════════════════════════════════════
const CASCADE_STYLE = `
.ltl-cascade-root {
    position: fixed;
    z-index: 99999;
    display: flex;
    align-items: flex-start;
    pointer-events: none;
}
.ltl-col {
    pointer-events: all;
    background: #1e1e2e;
    border: 1px solid #444;
    border-radius: 6px;
    min-width: 220px;
    max-width: 300px;
    max-height: 420px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    margin-right: 2px;
    font-size: 13px;
    color: #cdd6f4;
    flex-shrink: 0;
}
.ltl-col-search {
    padding: 6px 8px 4px;
    flex-shrink: 0;
    border-bottom: 1px solid #333;
}
.ltl-col-search input {
    width: 100%;
    box-sizing: border-box;
    background: #2a2a3e;
    border: 1px solid #555;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 12px;
    padding: 4px 8px;
    outline: none;
}
.ltl-col-search input::placeholder { color: #666; }
.ltl-col-list {
    overflow-y: auto;
    flex: 1;
}
.ltl-col-list::-webkit-scrollbar { width: 5px; }
.ltl-col-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
.ltl-item {
    padding: 6px 10px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 4px;
    margin: 2px 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
}
.ltl-item:hover, .ltl-item.active {
    background: #313244;
}
.ltl-folder::before { content: "📁"; font-size: 12px; }
.ltl-file::before   { content: "🎨"; font-size: 12px; }
.ltl-folder-arrow { margin-left: auto; opacity: 0.5; font-size: 10px; }
.ltl-meta { padding: 5px 10px; font-size: 11px; opacity: 0.45; }
`;

const RENDER_CHUNK = 120;
const SEARCH_LIMIT = 1000;

// ════════════════════════════════════════════════════════
//  全局共享 LoRA 数据（所有节点实例共用）
// ════════════════════════════════════════════════════════
const LoraStore = {
    flat: null,
    tree: null,
    _loading: null,

    invalidate() {
        this.flat = null;
        this.tree = null;
        this._loading = null;
    },

    async ensure() {
        if (this.tree) return;
        if (this._loading) return this._loading;
        this._loading = (async () => {
            let files = [];
            try {
                const res  = await fetch(`/lora_txt_loader/browse_loras?subpath=__all__`);
                const data = await res.json();
                files = data.files || [];
            } catch (e) {
                console.warn("[LoRATxtLoader] 加载全量 LoRA 失败", e);
            }
            if (files.length > 0) {
                this.flat = files;
                this.tree = this._buildTree(files);
            }
            // 修复：失败时在 IIFE resolve 后再重置 _loading，消除并发数据竞争
            if (!this.tree) this._loading = null;
        })();
        return this._loading;
    },

    _buildTree(flat) {
        const root = { folders: new Map(), files: [], _sorted: null };
        for (const f of flat) {
            const norm  = f.rel.replace(/\\/g, "/");
            const parts = norm.split("/");
            let cur = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const p = parts[i];
                let next = cur.folders.get(p);
                if (!next) { next = { folders: new Map(), files: [], _sorted: null }; cur.folders.set(p, next); }
                cur = next;
            }
            cur.files.push({ name: parts[parts.length - 1], rel: f.rel });
        }
        return root;
    },

    listOf(node) {
        if (node._sorted) return node._sorted;
        const folders = [...node.folders.entries()]
            .map(([name, child]) => ({ name, node: child }))
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        const files = [...node.files]
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        node._sorted = { folders, files };
        return node._sorted;
    },
};

// ── 刷新：同时清后端缓存 + 前端 LoraStore ───────────────────────────────────
async function refreshLoraStore() {
    try {
        await fetch("/lora_txt_loader/refresh");
    } catch (e) {
        console.warn("[LoRATxtLoader] 后端 refresh 失败", e);
    }
    LoraStore.invalidate();
}

function applyLabelButtonDraw(widget, align = "left") {
    widget.draw = function(ctx, node, widget_width, y, H) {
        const margin = 6;
        const x = margin;
        const w = widget_width - margin * 2;
        ctx.fillStyle = "#3a3a4e";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, H, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#cdd6f4";
        ctx.font = `${Math.min(H * 0.55, 13)}px sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 8, y, w - 16, H);
        ctx.clip();
        const tx = align === "center" ? x + w / 2 : x + 8;
        ctx.fillText(this.name, tx, y + H / 2);
        ctx.restore();
    };
}

function injectStyle() {
    if (document.getElementById("ltl-cascade-style")) return;
    const s = document.createElement("style");
    s.id = "ltl-cascade-style";
    s.textContent = CASCADE_STYLE;
    document.head.appendChild(s);
}

class CascadeMenu {
    constructor(onSelect, onCancel) {
        injectStyle();
        this.onSelect    = onSelect;
        this.onCancel    = onCancel;
        this.root        = null;
        this.overlay     = null;
        this.cols        = [];
        this.hoverTimers = [];
    }

    async open(anchorEl) {
        this.close(false);

        this.overlay = document.createElement("div");
        this.overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:transparent;";
        this.overlay.addEventListener("mousedown", () => this.close(true));
        document.body.appendChild(this.overlay);

        const rect = anchorEl.getBoundingClientRect();
        this.root = document.createElement("div");
        this.root.className = "ltl-cascade-root";
        this.root.style.top  = rect.bottom + 4 + "px";
        this.root.style.left = rect.left + "px";
        document.body.appendChild(this.root);

        await LoraStore.ensure();
        // 修复：ensure() 失败时 tree 为 null，显示错误提示后退出，避免 _buildCol(0, null) 崩溃
        if (!LoraStore.tree) {
            const errEl = document.createElement("div");
            errEl.className = "ltl-col";
            errEl.style.padding = "12px 16px";
            errEl.style.color = "#f38ba8";
            errEl.textContent = "LoRA 列表加载失败，请重试";
            this.root.appendChild(errEl);
            return;
        }
        this._buildCol(0, LoraStore.tree);
    }

    close(cancelled) {
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        if (this.root)    { this.root.remove();    this.root    = null; }
        this.cols = [];
        this.hoverTimers.forEach(clearTimeout);
        this.hoverTimers = [];
        if (cancelled && this.onCancel) this.onCancel();
    }

    _trimCols(depth) {
        while (this.cols.length > depth) {
            const c = this.cols.pop();
            c.el.remove();
        }
    }

    _renderEntries(list, entries) {
        list.innerHTML = "";
        if (entries.length === 0) {
            const empty = document.createElement("div");
            empty.className = "ltl-item";
            empty.style.opacity = "0.4";
            empty.textContent = "（空）";
            list.appendChild(empty);
            return;
        }
        let idx = 0;
        const more = () => {
            const frag = document.createDocumentFragment();
            const end  = Math.min(idx + RENDER_CHUNK, entries.length);
            for (; idx < end; idx++) frag.appendChild(entries[idx]());
            list.appendChild(frag);
        };
        more();
        list.onscroll = () => {
            if (idx < entries.length &&
                list.scrollTop + list.clientHeight >= list.scrollHeight - 60) {
                more();
            }
        };
    }

    _buildCol(depth, node) {
        this._trimCols(depth);

        const col = document.createElement("div");
        col.className = "ltl-col";
        this.cols.push({ el: col, node });
        this.root.appendChild(col);

        const { folders, files } = LoraStore.listOf(node);

        if (depth === 0) {
            const searchWrap = document.createElement("div");
            searchWrap.className = "ltl-col-search";
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = "🔍 搜索 LoRA...";
            searchWrap.appendChild(input);
            col.appendChild(searchWrap);
            searchWrap.addEventListener("mousedown", e => e.stopPropagation());

            const list = document.createElement("div");
            list.className = "ltl-col-list";
            col.appendChild(list);

            let timer = null;
            input.addEventListener("input", () => {
                clearTimeout(timer);
                timer = setTimeout(() => this._runSearch(input.value, list), 120);
            });

            this._fillNormal(list, folders, files, depth);
            return;
        }

        const list = document.createElement("div");
        list.className = "ltl-col-list";
        col.appendChild(list);
        this._fillNormal(list, folders, files, depth);
    }

    _fillNormal(list, folders, files, depth) {
        const entries = [];
        // 修复：用对象包装 activeItem，使所有闭包共享同一个可变引用，替换值快照传参 bug
        const activeRef = { current: null, _isBrowse: true };

        for (const folder of folders) {
            entries.push(() => {
                const item = document.createElement("div");
                item.className = "ltl-item ltl-folder";
                // 修复：改用 DOM 操作代替 innerHTML，防止文件夹名含特殊字符时 XSS
                const nameSpan = document.createElement("span");
                nameSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
                nameSpan.textContent = folder.name;
                const arrow = document.createElement("span");
                arrow.className = "ltl-folder-arrow";
                arrow.textContent = "▶";
                item.appendChild(nameSpan);
                item.appendChild(arrow);
                item.addEventListener("mouseenter", () => {
                    if (activeRef.current) activeRef.current.classList.remove("active");
                    activeRef.current = item;
                    item.classList.add("active");
                    clearTimeout(this.hoverTimers[depth]);
                    this.hoverTimers[depth] = setTimeout(
                        () => this._buildCol(depth + 1, folder.node), 120);
                });
                return item;
            });
        }

        if (folders.length > 0 && files.length > 0) {
            entries.push(() => {
                const sep = document.createElement("div");
                sep.style.cssText = "border-top:1px solid #333;margin:3px 8px;";
                return sep;
            });
        }

        for (const file of files) {
            entries.push(() => this._fileItem(list, file, depth, activeRef));
        }

        this._renderEntries(list, entries);
    }

    _runSearch(rawQuery, list) {
        const q = rawQuery.trim().toLowerCase();
        this._trimCols(1);

        if (q === "") {
            const { folders, files } = LoraStore.listOf(LoraStore.tree);
            this._fillNormal(list, folders, files, 0);
            return;
        }

        const flat = LoraStore.flat || [];
        const matched = [];
        for (let i = 0; i < flat.length && matched.length < SEARCH_LIMIT; i++) {
            const f = flat[i];
            if (f.rel.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)) {
                matched.push(f);
            }
        }

        if (matched.length === 0) {
            list.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "ltl-item";
            empty.style.opacity = "0.4";
            empty.textContent = "无匹配结果";
            list.appendChild(empty);
            return;
        }

        // 修复：搜索列表也用对象包装 activeRef，所有闭包共享同一个可变引用
        const activeRef = { current: null };
        const entries = matched.map(file => () =>
            this._fileItem(list, file, 0, activeRef)
        );
        this._renderEntries(list, entries);

        if (matched.length >= SEARCH_LIMIT) {
            const meta = document.createElement("div");
            meta.className = "ltl-meta";
            meta.textContent = `结果过多，仅显示前 ${SEARCH_LIMIT} 条，请输入更精确的关键词`;
            list.appendChild(meta);
        }
    }

    // activeRef: { current } 对象，由 _fillNormal / _runSearch 传入；
    // 搜索模式（showFullPath）时 activeRef 仍传入，通过 depth===0 区分显示方式
    _fileItem(list, file, depth, activeRef) {
        const item = document.createElement("div");
        item.className = "ltl-item ltl-file";
        // depth===0 且从搜索调用时显示完整路径；正常浏览时只显示文件名
        const showFullPath = (depth === 0 && !activeRef._isBrowse);
        const display = showFullPath
            ? (file.rel.includes("/") || file.rel.includes("\\") ? file.rel : file.name)
            : file.name;
        // 修复：改用 DOM 操作代替 innerHTML，防止文件名含 " 或 > 时 XSS
        const span = document.createElement("span");
        span.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
        span.textContent = display;
        span.title = file.rel;
        item.appendChild(span);
        item.addEventListener("mouseenter", () => {
            if (activeRef.current) activeRef.current.classList.remove("active");
            activeRef.current = item;
            item.classList.add("active");
            this._trimCols(depth + 1);
        });
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            this.onSelect(file.rel, file.name);
            this.close(false);
        });
        return item;
    }
}

// ════════════════════════════════════════════════════════
//  节点 1：LoRA Txt Loader（级联菜单）
// ════════════════════════════════════════════════════════
app.registerExtension({
    name: "LoRATxtLoader.AutoFill",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LoRATxtLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            const loraWidget   = this.widgets.find(w => w.name === "lora_name");
            const promptWidget = this.widgets.find(w => w.name === "positive_prompt");
            if (!loraWidget || !promptWidget) return;

            const fitSize = () => {
                const computed = this.computeSize();
                const w = Math.max(this.size[0], computed[0]);
                const h = Math.max(this.size[1], computed[1]);
                if (w !== this.size[0] || h !== this.size[1]) this.setSize([w, h]);
                app.graph.setDirtyCanvas(true);
            };

            const fetchTxt = async (loraName) => {
                try {
                    const res  = await fetch(`/lora_txt_loader/get_txt?lora_name=${encodeURIComponent(loraName)}`);
                    const data = await res.json();
                    return data.txt ?? "";
                } catch (e) {
                    console.warn("[LoRATxtLoader] 获取 txt 失败", e);
                    return "";
                }
            };

            // ---- 隐藏原始下拉 combo ----
            loraWidget.computeSize = () => [0, -4];
            loraWidget.draw = () => {};
            loraWidget.mouse = () => {};

            // ---- 选中 LoRA 的显示按钮 ----
            const initName = loraWidget.value
                ? loraWidget.value.split(/[\/\\]/).pop()
                : "( 点击选择 LoRA )";
            const displayWidget = this.addWidget("button", initName, null, () => openMenu());
            displayWidget.serialize = false;
            displayWidget.computeSize = function(width) { return [width, LiteGraph.NODE_WIDGET_HEIGHT ?? 20]; };

            displayWidget.draw = function(ctx, node, widget_width, y, H) {
                const margin = 6, x = margin, w = widget_width - margin * 2;
                ctx.fillStyle = "#3a3a4e"; ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(x, y, w, H, 4); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#cdd6f4";
                ctx.font = `${Math.min(H * 0.55, 13)}px sans-serif`;
                ctx.textBaseline = "middle";
                ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y, w - 16, H); ctx.clip();
                const availW = w - 16;
                const textW = ctx.measureText(this.name).width;
                if (textW <= availW) {
                    ctx.textAlign = "center";
                    ctx.fillText(this.name, x + w / 2, y + H / 2);
                } else {
                    ctx.textAlign = "left";
                    ctx.fillText(this.name, x + 8, y + H / 2);
                }
                ctx.restore();
            };

            // ---- 级联菜单 ----
            const menu = new CascadeMenu(
                async (loraRel, filename) => {
                    loraWidget.value   = loraRel;
                    displayWidget.name = filename;
                    loraWidget.callback?.(loraRel);
                    promptWidget.value = await fetchTxt(loraRel);
                    fitSize();
                    app.graph.setDirtyCanvas(true);
                },
                () => {}
            );

            const openMenu = () => {
                let anchor = document.getElementById("ltl-browse-anchor");
                if (!anchor) {
                    anchor = document.createElement("div");
                    anchor.id = "ltl-browse-anchor";
                    anchor.style.cssText = "position:fixed;width:0;height:0;pointer-events:none;";
                    document.body.appendChild(anchor);
                }
                const canvasEl   = app.canvas.canvas;
                const canvasRect = canvasEl.getBoundingClientRect();
                const mp     = app.canvas.graph_mouse;
                const scale  = app.canvas.ds?.scale  ?? 1;
                const offset = app.canvas.ds?.offset ?? [0, 0];
                // 修复：正确的坐标公式 screen = canvas_pos * scale + offset
                anchor.style.left = mp[0] * scale + offset[0] + canvasRect.left + "px";
                anchor.style.top  = mp[1] * scale + offset[1] + canvasRect.top  + "px";
                menu.open(anchor);
            };

            // ---- Reset 按钮 ----
            const resetBtn = this.addWidget("button", "↺ Reset from .txt", null, async () => {
                promptWidget.value = await fetchTxt(loraWidget.value);
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            // ---- 刷新列表按钮（同时清后端缓存 + 前端 LoraStore）----
            const refreshBtn = this.addWidget("button", "⟳ 刷新 LoRA 列表", null, async () => {
                refreshBtn.name = "⟳ 刷新中...";
                app.graph.setDirtyCanvas(true);
                await refreshLoraStore();
                refreshBtn.name = "⟳ 刷新 LoRA 列表";
                app.graph.setDirtyCanvas(true);
            });
            refreshBtn.serialize = false;
            applyLabelButtonDraw(refreshBtn, "center");

            // ---- 首次加载 ----
            setTimeout(async () => {
                if (loraWidget.value) {
                    displayWidget.name = loraWidget.value.split(/[\/\\]/).pop();
                    if (promptWidget.value === "") {
                        promptWidget.value = await fetchTxt(loraWidget.value);
                        fitSize();
                    }
                }
            }, 100);
        };
    },
});

// ════════════════════════════════════════════════════════
//  节点 4：LoRA Txt Loader (Dropdown)
// ════════════════════════════════════════════════════════
app.registerExtension({
    name: "LoRATxtLoaderDropdown.AutoFill",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LoRATxtLoaderDropdown") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            const loraWidget   = this.widgets.find(w => w.name === "lora_name");
            const promptWidget = this.widgets.find(w => w.name === "positive_prompt");
            if (!loraWidget || !promptWidget) return;

            const fitSize = () => {
                const computed = this.computeSize();
                const w = Math.max(this.size[0], computed[0]);
                const h = Math.max(this.size[1], computed[1]);
                if (w !== this.size[0] || h !== this.size[1]) this.setSize([w, h]);
                app.graph.setDirtyCanvas(true);
            };

            const fetchTxt = async (loraName) => {
                try {
                    const res  = await fetch(`/lora_txt_loader/get_txt?lora_name=${encodeURIComponent(loraName)}`);
                    const data = await res.json();
                    return data.txt ?? "";
                } catch (e) {
                    console.warn("[LoRATxtLoaderDropdown] 获取 txt 失败", e);
                    return "";
                }
            };

            const resetBtn = this.addWidget("button", "↺ Reset from .txt", null, async () => {
                promptWidget.value = await fetchTxt(loraWidget.value);
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            let lastLoraName = null;
            const origCallback = loraWidget.callback;
            loraWidget.callback = async (value) => {
                origCallback?.call(loraWidget, value);
                if (value === lastLoraName) return;
                lastLoraName = value;
                promptWidget.value = await fetchTxt(value);
                fitSize();
            };

            setTimeout(async () => {
                if (promptWidget.value === "" && loraWidget.value) {
                    lastLoraName = loraWidget.value;
                    promptWidget.value = await fetchTxt(loraWidget.value);
                    fitSize();
                }
            }, 100);
        };
    },
});

// ════════════════════════════════════════════════════════
//  节点 3：Txt File Loader
//  修复：defineProperty 不再放在 setTimeout 里，消除竞态
// ════════════════════════════════════════════════════════
app.registerExtension({
    name: "TxtFileLoader.AutoFill",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "TxtFileLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            const nameWidget = this.widgets.find(w => w.name === "txt_name");
            const textWidget = this.widgets.find(w => w.name === "text");
            if (!nameWidget || !textWidget) return;

            const fitSize = () => {
                const computed = this.computeSize();
                const w = Math.max(this.size[0], computed[0]);
                const h = Math.max(this.size[1], computed[1]);
                if (w !== this.size[0] || h !== this.size[1]) this.setSize([w, h]);
                app.graph.setDirtyCanvas(true);
            };

            const fetchTxtFile = async (txtName) => {
                try {
                    const res  = await fetch(`/lora_txt_loader/get_txt_file?txt_name=${encodeURIComponent(txtName)}`);
                    const data = await res.json();
                    return data.txt ?? "";
                } catch (e) {
                    console.warn("[TxtFileLoader] 获取 txt 失败", e);
                    return "";
                }
            };

            const resetBtn = this.addWidget("button", "↺ Reset from file", null, async () => {
                textWidget.value = await fetchTxtFile(nameWidget.value);
                fitSize();
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            // 修复竞态：立刻劫持 setter，不等 setTimeout
            let _val = nameWidget.value;
            Object.defineProperty(nameWidget, "value", {
                configurable: true,
                get() { return _val; },
                set(v) {
                    const prev = _val;
                    _val = v;
                    if (v !== prev) {
                        fetchTxtFile(v).then(txt => {
                            textWidget.value = txt;
                            fitSize();
                        });
                    }
                }
            });

            // 首次加载
            if (textWidget.value === "" && nameWidget.value) {
                fetchTxtFile(nameWidget.value).then(txt => {
                    textWidget.value = txt;
                    fitSize();
                });
            }
        };
    },
});
