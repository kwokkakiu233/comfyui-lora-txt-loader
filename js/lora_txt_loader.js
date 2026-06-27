import { app } from "../../scripts/app.js";

// ════════════════════════════════════════════════════════
//  级联菜单核心
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
`;

// ════════════════════════════════════════════════════════
//  公共：给 button widget 应用居左自绘样式
// ════════════════════════════════════════════════════════
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
        this._allFiles   = null;
    }

    async open(anchorEl) {
        this.close(false);

        // 全屏透明遮罩，z-index 低于菜单，点击时关闭
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

        await this._loadCol(0, "");
    }

    close(cancelled) {
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        if (this.root)    { this.root.remove();    this.root    = null; }
        this.cols = [];
        this.hoverTimers.forEach(clearTimeout);
        this.hoverTimers = [];
        if (cancelled && this.onCancel) this.onCancel();
    }

    async _getAllFiles() {
        if (this._allFiles) return this._allFiles;
        try {
            const res = await fetch(`/lora_txt_loader/browse_loras?subpath=__all__`);
            const data = await res.json();
            this._allFiles = data.files || [];
        } catch (e) {
            this._allFiles = [];
        }
        return this._allFiles;
    }

    async _loadCol(depth, subpath) {
        while (this.cols.length > depth) this.cols.pop().remove();

        let data;
        try {
            const res = await fetch(`/lora_txt_loader/browse_loras?subpath=${encodeURIComponent(subpath)}`);
            data = await res.json();
        } catch (e) {
            console.warn("[LoRATxtLoader] browse 失败", e);
            return;
        }

        const col = document.createElement("div");
        col.className = "ltl-col";
        this.cols.push(col);
        this.root.appendChild(col);

        if (depth === 0) {
            const searchWrap = document.createElement("div");
            searchWrap.className = "ltl-col-search";
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = "🔍 搜索 LoRA...";
            searchWrap.appendChild(input);
            col.appendChild(searchWrap);

            this._getAllFiles();

            const list = document.createElement("div");
            list.className = "ltl-col-list";
            col.appendChild(list);

            input.addEventListener("input", async () => {
                const q = input.value.trim().toLowerCase();
                while (this.cols.length > 1) this.cols.pop().remove();
                list.innerHTML = "";

                if (q === "") {
                    await this._refillList(list, data, depth);
                    return;
                }

                const all = await this._getAllFiles();
                const matched = all.filter(f =>
                    f.rel.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
                );

                if (matched.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "ltl-item";
                    empty.style.opacity = "0.4";
                    empty.textContent = "无匹配结果";
                    list.appendChild(empty);
                    return;
                }

                for (const file of matched) {
                    this._appendFileItem(list, file, depth);
                }
            });

            searchWrap.addEventListener("mousedown", e => e.stopPropagation());
            await this._refillList(list, data, depth);
            return;
        }

        const list = document.createElement("div");
        list.className = "ltl-col-list";
        col.appendChild(list);
        await this._refillList(list, data, depth);
    }

    async _refillList(list, data, depth) {
        list.innerHTML = "";
        const col = this.cols[depth];

        for (const folder of data.folders) {
            const item = document.createElement("div");
            item.className = "ltl-item ltl-folder";
            item.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis">${folder.name}</span><span class="ltl-folder-arrow">▶</span>`;
            item.addEventListener("mouseenter", () => {
                col.querySelectorAll(".ltl-item").forEach(i => i.classList.remove("active"));
                item.classList.add("active");
                clearTimeout(this.hoverTimers[depth]);
                this.hoverTimers[depth] = setTimeout(() => this._loadCol(depth + 1, folder.subpath), 150);
            });
            list.appendChild(item);
        }

        if (data.folders.length > 0 && data.files.length > 0) {
            const sep = document.createElement("div");
            sep.style.cssText = "border-top:1px solid #333;margin:3px 8px;";
            list.appendChild(sep);
        }

        for (const file of data.files) {
            this._appendFileItem(list, file, depth);
        }

        if (data.folders.length === 0 && data.files.length === 0) {
            const empty = document.createElement("div");
            empty.className = "ltl-item";
            empty.style.opacity = "0.4";
            empty.textContent = "（空）";
            list.appendChild(empty);
        }
    }

    _appendFileItem(list, file, depth) {
        const item = document.createElement("div");
        item.className = "ltl-item ltl-file";
        const display = (file.rel.includes("/") || file.rel.includes("\\"))
            ? file.rel
            : file.name;
        item.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis" title="${file.rel}">${display}</span>`;
        item.addEventListener("mouseenter", () => {
            list.querySelectorAll(".ltl-item").forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            while (this.cols.length > depth + 1) this.cols.pop().remove();
        });
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            this.onSelect(file.rel, file.name);
            this.close(false);
        });
        list.appendChild(item);
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

            // ---- 显示当前选中lora名的按钮，点击打开级联菜单 ----
            const initName = loraWidget.value
                ? loraWidget.value.split(/[\/\\]/).pop()
                : "( 点击选择 LoRA )";
            const displayWidget = this.addWidget("button", initName, null, () => {
                openMenu();
            });
            displayWidget.serialize = false;

            // ---- 覆盖 draw：文字居左 + 超出省略 ----
            displayWidget.draw = function(ctx, node, widget_width, y, H) {
                const margin = 6;
                const x = margin;
                const w = widget_width - margin * 2;
                // 背景（按钮风格）
                ctx.fillStyle = "#3a3a4e";
                ctx.strokeStyle = "#555";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(x, y, w, H, 4);
                ctx.fill();
                ctx.stroke();
                // 文字居左，超出截断
                ctx.fillStyle = "#cdd6f4";
                ctx.font = `${Math.min(H * 0.55, 13)}px sans-serif`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.save();
                ctx.beginPath();
                ctx.rect(x + 8, y, w - 16, H);
                ctx.clip();
                ctx.fillText(this.name, x + 8, y + H / 2);
                ctx.restore();
            };

            // ---- 级联菜单 ----
            const menu = new CascadeMenu(
                async (loraRel, filename) => {
                    loraWidget.value   = loraRel;
                    displayWidget.name = filename;
                    loraWidget.callback?.(loraRel);
                    const txt = await fetchTxt(loraRel);
                    promptWidget.value = txt;
                    fitSize();
                    app.graph.setDirtyCanvas(true);
                },
                () => {
                    // 取消：不做任何事，保持原来的 lora
                }
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
                const mp    = app.canvas.graph_mouse;
                const scale  = app.canvas.ds?.scale  ?? 1;
                const offset = app.canvas.ds?.offset ?? [0, 0];
                const sx = (mp[0] + offset[0]) * scale + canvasRect.left;
                const sy = (mp[1] + offset[1]) * scale + canvasRect.top;
                anchor.style.left = sx + "px";
                anchor.style.top  = sy + "px";
                menu.open(anchor);
            };

            // ---- Reset 按钮 ----
            const resetBtn = this.addWidget("button", "↺ Reset from .txt", null, async () => {
                const txt = await fetchTxt(loraWidget.value);
                promptWidget.value = txt;
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            // ---- 节点首次加载 ----
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
//  节点 4：LoRA Txt Loader (Dropdown) — 原始下拉选择方式
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

            // ---- Reset 按钮 ----
            const resetBtn = this.addWidget("button", "↺ Reset from .txt", null, async () => {
                const txt = await fetchTxt(loraWidget.value);
                promptWidget.value = txt;
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            // ---- 监听下拉变化 ----
            let lastLoraName = null;
            const origCallback = loraWidget.callback;
            loraWidget.callback = async (value) => {
                origCallback?.call(loraWidget, value);
                if (value === lastLoraName) return;
                lastLoraName = value;
                const txt = await fetchTxt(value);
                promptWidget.value = txt;
                fitSize();
            };

            // ---- 首次加载 ----
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

            // ---- Reset 按钮 ----
            const resetBtn = this.addWidget("button", "↺ Reset from file", null, async () => {
                textWidget.value = await fetchTxtFile(nameWidget.value);
                fitSize();
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            // ---- 延迟拦截 value setter ----
            setTimeout(async () => {
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
                if (textWidget.value === "" && nameWidget.value) {
                    textWidget.value = await fetchTxtFile(nameWidget.value);
                    fitSize();
                }
            }, 300);
        };
    },
});
