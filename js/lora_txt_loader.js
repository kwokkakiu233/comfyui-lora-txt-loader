import { app } from "../../scripts/app.js";

// 简单的 toast 提示（不会阻止输入焦点）
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    const bgColor = type === "error" ? "#f38ba8" : type === "success" ? "#a6e3a1" : "#89b4fa";
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${bgColor};
        color: #1e1e2e;
        padding: 12px 16px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 99999;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        word-wrap: break-word;
        font-weight: 500;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

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

.version-dialog {
    position: fixed;
    z-index: 100001;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: #1e1e2e;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 20px;
    min-width: 400px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.8);
    color: #cdd6f4;
    pointer-events: all;
}
.version-dialog-backdrop {
    position: fixed;
    z-index: 100000;
    inset: 0;
    background: rgba(0,0,0,0.5);
    pointer-events: all;
}
.version-dialog h2 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
}
.version-dialog label {
    display: block;
    margin: 12px 0 4px 0;
    font-size: 13px;
}
.version-dialog input,
.version-dialog textarea {
    width: 100%;
    box-sizing: border-box;
    background: #2a2a3e;
    border: 1px solid #555;
    border-radius: 4px;
    color: #cdd6f4;
    padding: 8px;
    font-family: inherit;
    font-size: 12px;
    outline: none;
    pointer-events: all;
}
.version-dialog input:focus,
.version-dialog textarea:focus {
    border-color: #6c7086;
    background: #313244;
}
.version-dialog textarea {
    min-height: 60px;
    resize: vertical;
}
.version-dialog-buttons {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    justify-content: flex-end;
}
.version-dialog-buttons button {
    padding: 8px 16px;
    background: #313244;
    border: 1px solid #555;
    border-radius: 4px;
    color: #cdd6f4;
    cursor: pointer;
    font-size: 12px;
    pointer-events: all;
}
.version-dialog-buttons button:hover {
    background: #45475a;
    border-color: #6c7086;
}
.version-dialog-buttons button.primary {
    background: #89b4fa;
    color: #1e1e2e;
    border-color: #89b4fa;
}
.version-dialog-buttons button.primary:hover {
    background: #a3c7ff;
}

.version-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #555;
    border-radius: 4px;
    margin: 12px 0;
}
.version-item {
    padding: 10px;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}
.version-item:last-child {
    border-bottom: none;
}
.version-item-info {
    flex: 1;
    min-width: 0;
}
.version-item-name {
    font-weight: 500;
    margin-bottom: 2px;
}
.version-item-meta {
    font-size: 11px;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.version-item-badge {
    display: inline-block;
    padding: 2px 6px;
    background: #a6e3a1;
    color: #1e1e2e;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    margin-left: 6px;
}
.version-item-lock {
    color: #f38ba8;
    font-size: 12px;
    margin-left: 6px;
}
.version-item-buttons {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}
.version-item-buttons button {
    padding: 4px 8px;
    background: #313244;
    border: 1px solid #555;
    border-radius: 3px;
    color: #cdd6f4;
    cursor: pointer;
    font-size: 11px;
    pointer-events: all;
}
.version-item-buttons button:hover {
    background: #45475a;
}
.version-item-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
`;

const SEARCH_LIMIT = 1000;

let _ltlLastMouseX = 0;
let _ltlLastMouseY = 0;
document.addEventListener("pointerdown", e => {
    _ltlLastMouseX = e.clientX;
    _ltlLastMouseY = e.clientY;
}, true);

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
                console.warn("[LoRATxtLoader] Failed to load all LoRA models.", e);
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

async function refreshLoraStore() {
    try {
        await fetch("/lora_txt_loader/refresh");
    } catch (e) {
        console.warn("[LoRATxtLoader] Backend refresh failed.", e);
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

// 显示保存版本对话框
function showSaveVersionDialog(loraName, content, isFirstSave, originalContent, callback) {
    const backdrop = document.createElement("div");
    backdrop.className = "version-dialog-backdrop";
    document.body.appendChild(backdrop);

    const dialog = document.createElement("div");
    dialog.className = "version-dialog";

    // 判断是否应该保存为默认版本
    const shouldSaveAsDefault = isFirstSave || (originalContent && content === originalContent);

    let dialogHTML = `<h2>💾 Save New Version</h2>`;

    if (shouldSaveAsDefault) {
        dialogHTML += `
            <p style="font-size: 13px; color: #a6e3a1; margin-bottom: 12px;">
                ✓ This will be saved as the <strong>default version</strong>.
            </p>
            <p style="font-size: 11px; color: #888; margin-bottom: 16px;">
                No version number or remark needed.
            </p>
            <div class="version-dialog-buttons">
                <button id="cancel-btn">Cancel</button>
                <button id="save-btn" class="primary">Save as Default</button>
            </div>
        `;
    } else {
        dialogHTML += `
            <p style="font-size: 12px; color: #888; margin-bottom: 12px;" id="notice"></p>
            <label>Version Number (Custom Name):</label>
            <input type="text" id="version-name" placeholder="e.g., v1, improved, final" value="">
            <label>Remark (Optional):</label>
            <textarea id="version-remark" placeholder="Add notes about this version..."></textarea>
            <div class="version-dialog-buttons">
                <button id="cancel-btn">Cancel</button>
                <button id="save-btn" class="primary">Save Version</button>
            </div>
        `;
    }

    dialog.innerHTML = dialogHTML;
    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector("#cancel-btn");
    const saveBtn = dialog.querySelector("#save-btn");
    const noticeEl = dialog.querySelector("#notice");
    const nameInput = dialog.querySelector("#version-name");

    if (nameInput) {
        nameInput.focus();
    }

    const cleanup = () => {
        backdrop.remove();
        dialog.remove();
    };

    cancelBtn.addEventListener("click", cleanup);

    saveBtn.addEventListener("click", async () => {
        if (shouldSaveAsDefault) {
            cleanup();
            callback("", ""); // 默认版本不需要自定义名称和备注
        } else {
            const customName = nameInput.value.trim();
            const remark = dialog.querySelector("#version-remark").value.trim();

            if (!customName) {
                noticeEl.textContent = "⚠ Version number cannot be empty";
                noticeEl.style.color = "#f38ba8";
                return;
            }

            cleanup();
            callback(customName, remark);
        }
    });

    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) cleanup();
    });
}

function showVersionManagerDialog(loraName, versions, currentVersion, hasOriginal, callback) {
    const backdrop = document.createElement("div");
    backdrop.className = "version-dialog-backdrop";
    document.body.appendChild(backdrop);

    const dialog = document.createElement("div");
    dialog.className = "version-dialog";
    dialog.style.minWidth = "500px";

    let listHTML = `<h2>📚 Version Manager</h2>`;

    // 总是显示版本列表容器，即使为空
    listHTML += `<div class="version-list" id="versions-container">`;

    // 显示 _original.txt（默认版本）- 只有有原始版本时才显示
    if (hasOriginal) {
        const isOriginalCurrent = currentVersion === "_original.txt";
        listHTML += `
            <div class="version-item">
                <div class="version-item-info">
                    <div class="version-item-name">📌 Original Version${isOriginalCurrent ? '<span class="version-item-badge">✓ Current</span>' : ''}</div>
                    <div class="version-item-meta">_original.txt (Default)</div>
                </div>
                <span class="version-item-lock">🔒 Locked</span>
                <div class="version-item-buttons">
                    <button class="load-original-btn" ${isOriginalCurrent ? "disabled" : ""}>Load</button>
                </div>
            </div>
        `;
    }

    // 显示其他版本
    for (const v of versions) {
        const isCurrent = v.filename === currentVersion;
        let badge = "";
        if (isCurrent) {
            badge = `<span class="version-item-badge">✓ Current</span>`;
        }

        let remark = "";
        if (v.remark) {
            remark = ` — ${v.remark}`;
        }

        listHTML += `
            <div class="version-item">
                <div class="version-item-info">
                    <div class="version-item-name">${v.custom_name}${badge}</div>
                    <div class="version-item-meta">${v.timestamp}${remark}</div>
                </div>
                <div class="version-item-buttons">
                    <button class="load-btn" data-file="${v.filename}" ${isCurrent ? "disabled" : ""}>Load</button>
                    <button class="delete-btn" data-file="${v.filename}" ${isCurrent ? "disabled" : ""}>Delete</button>
                </div>
            </div>
        `;
    }

    listHTML += `</div>`;

    // 无版本时显示提示
    if (!hasOriginal && versions.length === 0) {
        listHTML += `<p style="color: #888; text-align: center; padding: 20px;">No versions saved yet. Right-click node to save your first version.</p>`;
    }

    listHTML += `
        <div class="version-dialog-buttons">
            <button id="close-btn">Close</button>
        </div>
    `;

    dialog.innerHTML = listHTML;
    document.body.appendChild(dialog);

    const cleanup = () => {
        backdrop.remove();
        dialog.remove();
    };

    const closeBtn = dialog.querySelector("#close-btn");
    closeBtn.addEventListener("click", cleanup);

    const loadOriginalBtn = dialog.querySelector(".load-original-btn");
    if (loadOriginalBtn) {
        loadOriginalBtn.addEventListener("click", async () => {
            callback("load", "_original.txt");
            cleanup();
        });
    }

    dialog.querySelectorAll(".load-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const filename = btn.dataset.file;
            callback("load", filename);
            cleanup();
        });
    });

    dialog.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const filename = btn.dataset.file;
            // 确认删除
            const confirmBackdrop = document.createElement("div");
            confirmBackdrop.className = "version-dialog-backdrop";
            const confirmDialog = document.createElement("div");
            confirmDialog.className = "version-dialog";
            confirmDialog.style.minWidth = "300px";
            confirmDialog.innerHTML = `
                <h2>Confirm Delete</h2>
                <p>Are you sure you want to delete this version?</p>
                <div class="version-dialog-buttons">
                    <button id="confirm-cancel">Cancel</button>
                    <button id="confirm-delete" class="primary">Delete</button>
                </div>
            `;
            document.body.appendChild(confirmBackdrop);
            document.body.appendChild(confirmDialog);

            confirmDialog.querySelector("#confirm-cancel").addEventListener("click", () => {
                confirmBackdrop.remove();
                confirmDialog.remove();
            });

            confirmDialog.querySelector("#confirm-delete").addEventListener("click", () => {
                confirmBackdrop.remove();
                confirmDialog.remove();
                callback("delete", filename);
                cleanup();
            });

            confirmBackdrop.addEventListener("click", (e) => {
                if (e.target === confirmBackdrop) {
                    confirmBackdrop.remove();
                    confirmDialog.remove();
                }
            });
        });
    });

    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) cleanup();
    });
}

class CascadeMenu {
    constructor(onSelect, onCancel) {
        injectStyle();
        this.onSelect   = onSelect;
        this.onCancel   = onCancel;
        this.panel      = null;
        this.overlay    = null;
        this._openState = new WeakMap();
        this._currentRel = null;
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
            this.panel.textContent = "LoRA list failed to load, please try again.";
            return;
        }

        const searchWrap = document.createElement("div");
        searchWrap.className = "ltl-panel-search";
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "🔍 Search for LoRA...";
        searchWrap.appendChild(input);
        this.panel.appendChild(searchWrap);

        const list = document.createElement("div");
        list.className = "ltl-panel-list";
        this.panel.appendChild(list);

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
        if (cancelled && this.onCancel) this.onCancel();
    }

    _clearScrollListeners(scroller) {
        if (!scroller || !scroller._ltlScrollListeners) return;
        for (const fn of scroller._ltlScrollListeners) {
            scroller.removeEventListener("scroll", fn);
        }
        scroller._ltlScrollListeners = [];
    }

    _clearOpenStateDeep(treeNode) {
        if (!treeNode || !treeNode.folders) return;
        for (const [, child] of treeNode.folders) {
            this._openState.set(child, false);
            this._clearOpenStateDeep(child);
        }
    }

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

            wrapper._folderNode   = folder.node;
            wrapper._childrenEl   = children;
            wrapper._toggleEl     = toggle;

            row.addEventListener("click", () => {
                const nowOpen = children.style.display === "none";

                if (nowOpen) {
                    const parent = wrapper.parentElement;
                    if (parent) {
                        parent.childNodes.forEach(sibling => {
                            if (sibling !== wrapper && sibling._folderNode) {
                                this._openState.set(sibling._folderNode, false);
                                this._clearOpenStateDeep(sibling._folderNode);
                                sibling._childrenEl.style.display = "none";
                                sibling._childrenEl.innerHTML = "";
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
                    console.warn("[LoRATxtLoader] Failed to get txt file.", e);
                    return "";
                }
            };

            const checkVersionStatus = async (loraName, currentContent) => {
                try {
                    const statusRes = await fetch(`/lora_txt_loader/version_status?lora_name=${encodeURIComponent(loraName)}`);
                    const statusData = await statusRes.json();
                    const originalContent = statusData.current_txt_content;

                    if (currentContent.trim() === originalContent.trim()) {
                        showToast("Using default version", "info");
                    }
                } catch (e) {
                    console.error("[LoRATxtLoader] Failed to check version status", e);
                }
            };

            loraWidget.computeSize = () => [0, -4];
            loraWidget.draw = () => {};
            loraWidget.mouse = () => {};

            const initName = loraWidget.value
                ? loraWidget.value.split(/[\/\\]/).pop()
                : "( Click to select LoRA. )";
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

            const menu = new CascadeMenu(
                async (loraRel, filename) => {
                    loraWidget.value   = loraRel;
                    displayWidget.name = filename;
                    loraWidget.callback?.(loraRel);
                    promptWidget.value = await fetchTxt(loraRel);
                    fitSize();
                    app.graph.setDirtyCanvas(true);

                    // 检查版本状态
                    await checkVersionStatus(loraRel, promptWidget.value);
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
                anchor.style.left = mp[0] * scale + offset[0] + canvasRect.left + "px";
                anchor.style.top  = mp[1] * scale + offset[1] + canvasRect.top  + "px";
                menu.open(anchor, loraWidget.value || null);
            };

            const resetBtn = this.addWidget("button", "↺ Reset from .txt", null, async () => {
                promptWidget.value = await fetchTxt(loraWidget.value);
            });
            resetBtn.serialize = false;
            applyLabelButtonDraw(resetBtn, "center");

            const refreshBtn = this.addWidget("button", "⟳ Refresh LoRA list", null, async () => {
                refreshBtn.name = "⟳ Refreshing...";
                app.graph.setDirtyCanvas(true);
                await refreshLoraStore();
                refreshBtn.name = "⟳ Refresh LoRA list";
                app.graph.setDirtyCanvas(true);
            });
            refreshBtn.serialize = false;
            applyLabelButtonDraw(refreshBtn, "center");

            // ---- 右键菜单（版本管理）----
            const origGetExtraMenuOptions = this.getExtraMenuOptions;
            this.getExtraMenuOptions = function(canvas, options) {
                origGetExtraMenuOptions?.apply(this, arguments);

                options.push(null);
                options.push({
                    content: "💾 Save LoRA Tags Version",
                    callback: () => {
                        if (!loraWidget.value) {
                            showToast("Please select a LoRA first", "error");
                            return;
                        }

                        const content = promptWidget.value.trim();
                        if (!content) {
                            showToast("Prompt content cannot be empty", "error");
                            return;
                        }

                        // 获取版本信息，判断是否是首次保存
                        (async () => {
                            try {
                                const statusRes = await fetch(`/lora_txt_loader/version_status?lora_name=${encodeURIComponent(loraWidget.value)}`);
                                const statusData = await statusRes.json();
                                const originalContent = statusData.original_content || statusData.current_txt_content;
                                const isFirstSave = !statusData.has_versions;

                                if (content === originalContent) {
                                    showToast("Content is same as default version, no need to save", "info");
                                    return;
                                }

                                showSaveVersionDialog(loraWidget.value, content, isFirstSave, originalContent, async (customName, remark) => {
                                    try {
                                        const res = await fetch("/lora_txt_loader/save_version", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                lora_name: loraWidget.value,
                                                content: content,
                                                custom_name: customName,
                                                remark: remark,
                                            }),
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                            if (data.is_default) {
                                                showToast(data.message, "success");
                                            } else {
                                                showToast(`Version "${customName}" saved successfully!`, "success");
                                            }
                                        } else {
                                            showToast(`Error: ${data.error}`, "error");
                                        }
                                    } catch (e) {
                                        console.error("[LoRATxtLoader] Failed to save version", e);
                                        showToast("Failed to save version", "error");
                                    }
                                });
                            } catch (e) {
                                console.error("[LoRATxtLoader] Failed to get version status", e);
                                showToast("Failed to check version status", "error");
                            }
                        })();
                    },
                });

                options.push({
                    content: "📚 LoRA Tags Version Manager",
                    callback: () => {
                        if (!loraWidget.value) {
                            showToast("Please select a LoRA first", "error");
                            return;
                        }

                        (async () => {
                            try {
                                const res = await fetch(`/lora_txt_loader/version_status?lora_name=${encodeURIComponent(loraWidget.value)}`);
                                const data = await res.json();

                                showVersionManagerDialog(loraWidget.value, data.versions_list || [], data.current_version, data.has_original, async (action, filename) => {
                                    if (action === "load") {
                                        try {
                                            const loadRes = await fetch("/lora_txt_loader/load_version", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    lora_name: loraWidget.value,
                                                    version_filename: filename,
                                                }),
                                            });
                                            const loadData = await loadRes.json();
                                            if (loadData.success) {
                                                promptWidget.value = loadData.content;
                                                fitSize();
                                                app.graph.setDirtyCanvas(true);
                                                showToast(`Version loaded: ${filename}`, "success");
                                            } else {
                                                showToast(`Error: ${loadData.error}`, "error");
                                            }
                                        } catch (e) {
                                            console.error("[LoRATxtLoader] Failed to load version", e);
                                            showToast("Failed to load version", "error");
                                        }
                                    } else if (action === "delete") {
                                        try {
                                            const delRes = await fetch("/lora_txt_loader/delete_version", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    lora_name: loraWidget.value,
                                                    version_filename: filename,
                                                }),
                                            });
                                            const delData = await delRes.json();
                                            if (delData.success) {
                                                showToast(`Version deleted: ${filename}`, "success");
                                                // 重新加载版本管理器
                                                const reloadRes = await fetch(`/lora_txt_loader/version_status?lora_name=${encodeURIComponent(loraWidget.value)}`);
                                                const reloadData = await reloadRes.json();
                                                showVersionManagerDialog(loraWidget.value, reloadData.versions_list || [], reloadData.current_version, reloadData.has_original, arguments.callee);
                                            } else {
                                                showToast(`Error: ${delData.error}`, "error");
                                            }
                                        } catch (e) {
                                            console.error("[LoRATxtLoader] Failed to delete version", e);
                                            showToast("Failed to delete version", "error");
                                        }
                                    }
                                });
                            } catch (e) {
                                console.error("[LoRATxtLoader] Failed to load version status", e);
                                showToast("Failed to load version manager", "error");
                            }
                        })();
                    },
                });
            };

            setTimeout(async () => {
                if (loraWidget.value) {
                    displayWidget.name = loraWidget.value.split(/[\/\\]/).pop();
                    if (promptWidget.value === "") {
                        promptWidget.value = await fetchTxt(loraWidget.value);
                        fitSize();

                        // 检查版本状态
                        await checkVersionStatus(loraWidget.value, promptWidget.value);
                    }
                }
            }, 100);
        };
    },
});

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
                    console.warn("[LoRATxtLoaderDropdown] Failed to get txt file", e);
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
                    const res = await fetch(`/lora_txt_loader/get_txt_file?txt_name=${encodeURIComponent(txtName)}`);
                    if (!res.ok) {
                        console.warn(`[TxtFileLoader] HTTP error: ${res.status}`);
                        return "";
                    }
                    const data = await res.json();
                    return data.txt ?? "";
                } catch (e) {
                    console.warn("[TxtFileLoader] Failed to fetch txt file", e);
                    return "";
                }
            };

            // 刷新文件列表
            const refreshFileList = async () => {
                try {
                    const res = await fetch("/lora_txt_loader/get_txt_list");
                    if (!res.ok) return;
                    const data = await res.json();
                    const files = data.files || [];

                    if (files.length > 0) {
                        nameWidget.options.values = files;
                    }
                } catch (e) {
                    console.warn("[TxtFileLoader] Failed to refresh file list", e);
                }
            };

            // 添加"刷新文件列表"按钮
            const resetBtn = this.addWidget("button", "↺ Refresh Files", null, async () => {
                await refreshFileList();
                if (nameWidget.value && !nameWidget.value.includes("(No txt files found)")) {
                    textWidget.value = await fetchTxtFile(nameWidget.value);
                    fitSize();
                }
            });
            resetBtn.serialize = false;

            // 监听 txt_name 的变化，自动加载文件内容
            let _val = nameWidget.value;
            Object.defineProperty(nameWidget, "value", {
                configurable: true,
                get() { return _val; },
                set(v) {
                    const prev = _val;
                    _val = v;
                    if (v !== prev && v && !v.includes("(No txt files found)")) {
                        fetchTxtFile(v).then(txt => {
                            textWidget.value = txt;
                            fitSize();
                        });
                    }
                }
            });

            // 初始化时加载文件内容
            if (textWidget.value === "" && nameWidget.value && !nameWidget.value.includes("(No txt files found)")) {
                fetchTxtFile(nameWidget.value).then(txt => {
                    textWidget.value = txt;
                    fitSize();
                });
            }

            // 定期刷新文件列表（每5秒检查一次是否有新文件）
            setInterval(() => {
                refreshFileList();
            }, 5000);
        };
    },
});