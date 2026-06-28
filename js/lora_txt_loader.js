import { app } from "../../scripts/app.js";

// ════════════════════════════════════════════════════════
//  树形面板核心（已针对上万个 LoRA 优化）
// ════════════════════════════════════════════════════════
const CASCADE_STYLE = `
.ltl-panel {
    position: fixed;
    z-index: 99999;
    pointer-events: all;
    background: #1e1e2e;
    border: 1px solid #444;
    border-radius: 6px;
    width: 300px;
    max-height: 480px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    font-size: 13px;
    color: #cdd6f4;
}
.ltl-panel-search {
    padding: 6px 8px 4px;
    flex-shrink: 0;
    border-bottom: 1px solid #333;
}
.ltl-panel-search input {
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
.ltl-panel-search input::placeholder { color: #666; }
.ltl-panel-list {
    overflow-y: auto;
    flex: 1;
    padding: 4px 0;
}
.ltl-panel-list::-webkit-scrollbar { width: 5px; }
.ltl-panel-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
.ltl-item {
    padding: 5px 8px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 4px;
    margin: 1px 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    user-select: none;
    line-height: 1.4;
}
.ltl-item:hover {
    background: #313244;
}
.ltl-item-icon {
    flex-shrink: 0;
    font-size: 12px;
    width: 16px;
    text-align: center;
}
.ltl-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ltl-folder-toggle {
    flex-shrink: 0;
    opacity: 0.4;
    font-size: 10px;
    width: 12px;
    text-align: center;
    transition: transform 0.1s;
}
.ltl-folder-toggle.open {
    transform: rotate(90deg);
}
.ltl-children {
    overflow: hidden;
}
.ltl-meta { padding: 4px 10px; font-size: 11px; opacity: 0.45; }
`;

const SEARCH_LIMIT = 1000;

// ── 缓存最后一次 pointerdown 的真实屏幕坐标 ──────────────────────────────────
let _ltlLastMouseX = 0;
let _ltlLastMouseY = 0;
document.addEventListener("pointerdown", e => {
    _ltlLastMouseX = e.clientX;
    _ltlLastMouseY = e.clientY;
}, true);

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
        this.onSelect   = onSelect;
        this.onCancel   = onCancel;
        this.panel      = null;
        this.overlay    = null;
        // 跨次保持展开状态
        this._openState = new WeakMap();
        this._currentRel = null; // 当前选中的 lora rel 路径
    }

    async open(anchorEl, currentRel) {
        this._currentRel = currentRel || null;
        this.close(false);

        this.overlay = document.createElement("div");
        this.overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:transparent;";
        this.overlay.addEventListener("mousedown", () => this.close(true));
        document.body.appendChild(this.overlay);

        const originX = _ltlLastMouseX;
        const originY = _ltlLastMouseY;

        this.panel = document.createElement("div");
        this.panel.className = "ltl-panel";
        this.panel.addEventListener("mousedown", e => e.stopPropagation());
        document.body.appendChild(this.panel);

        await LoraStore.ensure();
        if (!LoraStore.tree) {
            this.panel.style.cssText = `left:${originX}px;top:${originY+4}px;padding:12px 16px;color:#f38ba8;`;
            this.panel.textContent = "LoRA 列表加载失败，请重试";
            return;
        }

        // ── 搜索框 ──
        const searchWrap = document.createElement("div");
        searchWrap.className = "ltl-panel-search";
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "🔍 搜索 LoRA...";
        searchWrap.appendChild(input);
        this.panel.appendChild(searchWrap);

        // ── 列表容器 ──
        const list = document.createElement("div");
        list.className = "ltl-panel-list";
        this.panel.appendChild(list);

        // 若有当前选中路径，预先展开对应文件夹层级
        if (this._currentRel) {
            const parts = this._currentRel.replace(/\\/g, "/").split("/");
            let node = LoraStore.tree;
            for (let i = 0; i < parts.length - 1; i++) {
                const child = node.folders.get(parts[i]);
                if (!child) break;
                this._openState.set(child, true);
                node = child;
            }
        }

        this._renderTree(list, LoraStore.tree, 0);

        // 渲染完成后滚动到当前选中项
        if (this._currentRel) {
            requestAnimationFrame(() => {
                if (!this.panel) return;
                const target = list.querySelector(`[data-rel="${CSS.escape(this._currentRel)}"]`);
                if (target) {
                    const listTop  = list.getBoundingClientRect().top;
                    const itemTop  = target.getBoundingClientRect().top;
                    list.scrollTop += (itemTop - listTop) - list.clientHeight / 3;
                }
            });
        }

        let timer = null;
        input.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => this._runSearch(input.value, list), 120);
        });

        // ── 定位：先放视口外量尺寸，再修正 ──
        this.panel.style.left = "-9999px";
        this.panel.style.top  = "-9999px";
        requestAnimationFrame(() => {
            if (!this.panel) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const pw = this.panel.offsetWidth  || 300;
            const ph = this.panel.offsetHeight || 480;
            let left = originX;
            let top  = originY + 4;
            if (left + pw > vw) left = Math.max(0, vw - pw - 4);
            if (top  + ph > vh) top  = Math.max(0, originY - ph - 4);
            this.panel.style.left = left + "px";
            this.panel.style.top  = top  + "px";
        });
    }

    close(cancelled) {
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        if (this.panel)   { this.panel.remove();   this.panel   = null; }
        // 不重置 _openState，保持展开状态供下次使用
        if (cancelled && this.onCancel) this.onCancel();
    }

    // 移除挂在 scroller 上的所有懒加载监听器
    _clearScrollListeners(scroller) {
        if (!scroller || !scroller._ltlScrollListeners) return;
        for (const fn of scroller._ltlScrollListeners) {
            scroller.removeEventListener("scroll", fn);
        }
        scroller._ltlScrollListeners = [];
    }

    // 递归清除一个 treeNode 及其所有后代的展开状态
    _clearOpenStateDeep(treeNode) {
        if (!treeNode || !treeNode.folders) return;
        for (const [, child] of treeNode.folders) {
            this._openState.set(child, false);
            this._clearOpenStateDeep(child);
        }
    }

    // 递归渲染树，支持懒加载
    _renderTree(container, node, depth) {
        const { folders, files } = LoraStore.listOf(node);
        const INDENT = 14;
        const CHUNK  = 200;

        const frag = document.createDocumentFragment();

        for (const folder of folders) {
            const isOpen = this._openState.get(folder.node) || false;

            const wrapper = document.createElement("div");

            const row = document.createElement("div");
            row.className = "ltl-item";
            row.style.paddingLeft = (8 + depth * INDENT) + "px";

            const toggle = document.createElement("span");
            toggle.className = "ltl-folder-toggle" + (isOpen ? " open" : "");
            toggle.textContent = "▶";

            const icon = document.createElement("span");
            icon.className = "ltl-item-icon";
            icon.textContent = "📁";

            const name = document.createElement("span");
            name.className = "ltl-item-name";
            name.textContent = folder.name;
            name.title = folder.name;

            row.appendChild(toggle);
            row.appendChild(icon);
            row.appendChild(name);
            wrapper.appendChild(row);

            const children = document.createElement("div");
            children.className = "ltl-children";
            children.style.display = isOpen ? "" : "none";
            wrapper.appendChild(children);

            if (isOpen) {
                this._renderTree(children, folder.node, depth + 1);
            }

            // 保存引用供手风琴逻辑使用
            wrapper._folderNode   = folder.node;
            wrapper._childrenEl   = children;
            wrapper._toggleEl     = toggle;

            row.addEventListener("click", () => {
                const nowOpen = children.style.display === "none";

                // 手风琴：关闭同级其他文件夹，并递归清除其子状态
                if (nowOpen) {
                    const parent = wrapper.parentElement;
                    if (parent) {
                        parent.childNodes.forEach(sibling => {
                            if (sibling !== wrapper && sibling._folderNode) {
                                this._openState.set(sibling._folderNode, false);
                                this._clearOpenStateDeep(sibling._folderNode); // 递归清除子层级
                                sibling._childrenEl.style.display = "none";
                                sibling._childrenEl.innerHTML = "";            // 清空 DOM，下次展开重新渲染
                                sibling._toggleEl.className = "ltl-folder-toggle";
                            }
                        });
                    }
                }

                this._openState.set(folder.node, nowOpen);
                children.style.display = nowOpen ? "" : "none";
                toggle.className = "ltl-folder-toggle" + (nowOpen ? " open" : "");
                if (nowOpen) {
                    if (children.childElementCount === 0) {
                        this._renderTree(children, folder.node, depth + 1);
                    }
                    // 展开后自动滚动：把文件夹行贴近列表顶部
                    requestAnimationFrame(() => {
                        const scroller = row.closest(".ltl-panel-list");
                        if (scroller) {
                            const rowTop  = row.getBoundingClientRect().top;
                            const listTop = scroller.getBoundingClientRect().top;
                            scroller.scrollTop += (rowTop - listTop) - 8;
                        }
                    });
                }
            });

            frag.appendChild(wrapper);
        }

        let fileIdx = 0;
        const renderNextChunk = () => {
            const end = Math.min(fileIdx + CHUNK, files.length);
            for (; fileIdx < end; fileIdx++) {
                const file = files[fileIdx];
                const item = document.createElement("div");
                item.className = "ltl-item";
                item.style.paddingLeft = (8 + depth * INDENT) + "px";

                const icon = document.createElement("span");
                icon.className = "ltl-item-icon";
                icon.textContent = "🎨";

                const span = document.createElement("span");
                span.className = "ltl-item-name";
                span.textContent = file.name;
                span.title = file.rel;

                item.setAttribute("data-rel", file.rel);
                // 当前选中项高亮
                if (this._currentRel && file.rel === this._currentRel) {
                    item.style.background = "#45475a";
                }

                item.appendChild(icon);
                item.appendChild(span);
                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.onSelect(file.rel, file.name);
                    this.close(false);
                });
                container.appendChild(item);
            }
        };

        container.appendChild(frag);
        renderNextChunk();

        if (fileIdx < files.length) {
            const scroller = container.closest(".ltl-panel-list");
            if (scroller) {
                if (!scroller._ltlScrollListeners) scroller._ltlScrollListeners = [];
                const onScroll = () => {
                    if (fileIdx >= files.length) {
                        scroller.removeEventListener("scroll", onScroll);
                        const idx = scroller._ltlScrollListeners.indexOf(onScroll);
                        if (idx !== -1) scroller._ltlScrollListeners.splice(idx, 1);
                        return;
                    }
                    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80) {
                        renderNextChunk();
                    }
                };
                scroller._ltlScrollListeners.push(onScroll);
                scroller.addEventListener("scroll", onScroll);
            }
        }
    }

    _runSearch(rawQuery, list) {
        // 清除旧的懒加载 scroll 监听，防止累积
        this._clearScrollListeners(list.closest(".ltl-panel-list") || list);
        list.innerHTML = "";
        const q = rawQuery.trim().toLowerCase();

        if (q === "") {
            this._renderTree(list, LoraStore.tree, 0);
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
            const empty = document.createElement("div");
            empty.className = "ltl-item";
            empty.style.opacity = "0.4";
            empty.textContent = "无匹配结果";
            list.appendChild(empty);
            return;
        }

        for (const file of matched) {
            const item = document.createElement("div");
            item.className = "ltl-item";
            item.style.paddingLeft = "8px";

            const icon = document.createElement("span");
            icon.className = "ltl-item-icon";
            icon.textContent = "🎨";

            const span = document.createElement("span");
            span.className = "ltl-item-name";
            span.textContent = file.rel.replace(/\\/g, "/");
            span.title = file.rel;

            item.appendChild(icon);
            item.appendChild(span);
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                this.onSelect(file.rel, file.name);
                this.close(false);
            });
            list.appendChild(item);
        }

        if (matched.length >= SEARCH_LIMIT) {
            const meta = document.createElement("div");
            meta.className = "ltl-meta";
            meta.textContent = `结果过多，仅显示前 ${SEARCH_LIMIT} 条，请输入更精确的关键词`;
            list.appendChild(meta);
        }
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

            // ---- 树形面板菜单 ----
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
                menu.open(anchor, loraWidget.value || null);
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
