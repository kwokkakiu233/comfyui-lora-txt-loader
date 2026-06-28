import os
import time
import folder_paths
import comfy.utils
import comfy.sd
from server import PromptServer
from aiohttp import web


# ── texts 目录：在 API 之前初始化，确保路径可用 ─────────────────────────────
_texts_dir = os.path.join(folder_paths.get_input_directory(), "texts")
os.makedirs(_texts_dir, exist_ok=True)
folder_paths.add_model_folder_path("txt_files", _texts_dir)

# ── loras 根目录白名单（用于路径安全校验）────────────────────────────────────
_lora_roots = set()
for _p in folder_paths.get_folder_paths("loras"):
    _lora_roots.add(os.path.realpath(_p))


def _is_safe_lora_txt(txt_path: str) -> bool:
    """检查 txt_path 是否在已知 loras 目录下，防止路径穿越。"""
    # 修复：Windows 文件系统大小写不敏感，统一 lower() 后比较
    real = os.path.realpath(txt_path).lower()
    return any(
        real.startswith((root + os.sep).lower()) or real == root.lower()
        for root in _lora_roots
    )


# ════════════════════════════════════════════════════════════════════════
#  全量 LoRA 列表缓存（核心优化）
# ════════════════════════════════════════════════════════════════════════
_CACHE_TTL = 10.0

_cache = {
    "ts": 0.0,
    "normalized": None,
    "all_payload": None,
}


def _get_normalized_loras():
    now = time.time()
    if _cache["normalized"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["normalized"]
    all_loras = folder_paths.get_filename_list("loras")
    normalized = [name.replace("\\", "/") for name in all_loras]
    _cache["ts"] = now
    _cache["normalized"] = normalized
    _cache["all_payload"] = None
    return normalized


def _get_all_payload():
    normalized = _get_normalized_loras()
    if _cache["all_payload"] is not None:
        return _cache["all_payload"]
    files = []
    for name in normalized:
        rel = name.replace("/", "\\")
        filename = name.split("/")[-1]
        files.append({"name": filename, "rel": rel, "subpath": rel})
    payload = {
        "folders": [],
        "files": sorted(files, key=lambda f: f["rel"].lower()),
    }
    _cache["all_payload"] = payload
    return payload


def _invalidate_cache():
    _cache["ts"] = 0.0
    _cache["normalized"] = None
    _cache["all_payload"] = None


# ── API：供前端 JS 查询某个 LoRA 对应的 .txt 内容 ──────────────────────────
@PromptServer.instance.routes.get("/lora_txt_loader/get_txt")
async def get_lora_txt(request):
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name:
        return web.json_response({"txt": ""})

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path:
        return web.json_response({"txt": ""})

    txt_path = os.path.splitext(lora_path)[0] + ".txt"
    content = ""
    if os.path.isfile(txt_path):
        with open(txt_path, "r", encoding="utf-8") as f:
            content = f.read().strip()

    return web.json_response({"txt": content})


# ── API：供前端 JS 查询某个独立 .txt 文件的内容 ────────────────────────────
@PromptServer.instance.routes.get("/lora_txt_loader/get_txt_file")
async def get_txt_file(request):
    txt_name = request.rel_url.query.get("txt_name", "")
    if not txt_name:
        return web.json_response({"txt": ""})

    # 安全：确保路径不超出 _texts_dir
    # 修复：Windows 大小写不敏感，统一 lower() 后比较
    txt_path = os.path.realpath(os.path.join(_texts_dir, txt_name))
    base = (os.path.realpath(_texts_dir) + os.sep).lower()
    if not txt_path.lower().startswith(base):
        return web.json_response({"txt": ""}, status=403)

    if not os.path.isfile(txt_path):
        return web.json_response({"txt": ""})

    with open(txt_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    return web.json_response({"txt": content})


# ── API：手动让缓存失效 ──────────────────────────────────────────────────────
@PromptServer.instance.routes.get("/lora_txt_loader/refresh")
async def refresh_loras(request):
    _invalidate_cache()
    return web.json_response({"ok": True})


# ── API：供前端级联菜单浏览 LoRA 目录结构 ─────────────────────────────────
@PromptServer.instance.routes.get("/lora_txt_loader/browse_loras")
async def browse_loras(request):
    subpath = request.rel_url.query.get("subpath", "").strip().replace("\\", "/")

    if subpath == "__all__":
        return web.json_response(_get_all_payload())

    all_loras_normalized = _get_normalized_loras()

    folders_dict = {}
    files = []
    prefix = (subpath + "/") if subpath else ""

    for name in all_loras_normalized:
        if not name.startswith(prefix):
            continue
        rest = name[len(prefix):]
        if "/" in rest:
            folder_name = rest.split("/")[0]
            folder_subpath = (subpath + "/" + folder_name) if subpath else folder_name
            folders_dict[folder_name] = folder_subpath.replace("/", "\\")
        else:
            rel = name.replace("/", "\\")
            files.append({"name": rest, "rel": rel, "subpath": rel})

    folders_out = sorted(
        [{"name": k, "subpath": v} for k, v in folders_dict.items()],
        key=lambda x: x["name"].lower()
    )

    return web.json_response({
        "folders": folders_out,
        "files":   sorted(files, key=lambda f: f["name"].lower())
    })


# ── 节点 1：LoRA Txt Loader（级联菜单）─────────────────────────────────────
class LoRATxtLoader:

    @classmethod
    def INPUT_TYPES(cls):
        lora_list = folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model":           ("MODEL",),
                "clip":            ("CLIP",),
                "lora_name":       (lora_list,),
                "strength_model":  ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "strength_clip":   ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "positive_prompt": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES  = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES  = ("model", "clip", "positive_prompt", "lora_path")
    FUNCTION      = "load_lora"
    CATEGORY      = "loaders"

    def load_lora(self, model, clip, lora_name, strength_model, strength_clip, positive_prompt):
        lora_path = folder_paths.get_full_path("loras", lora_name)
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, lora, strength_model, strength_clip
        )
        return (model_out, clip_out, positive_prompt, lora_path)


# ── 节点 2：LoRA Txt Loader (From Path) ────────────────────────────────────
class LoRATxtLoaderFromPath:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model":          ("MODEL",),
                "clip":           ("CLIP",),
                "lora_path":      ("STRING", {"default": "", "multiline": False}),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "strength_clip":  ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
            }
        }

    RETURN_TYPES  = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES  = ("model", "clip", "positive_prompt", "lora_path")
    FUNCTION      = "load_lora"
    CATEGORY      = "loaders"

    def load_lora(self, model, clip, lora_path, strength_model, strength_clip):
        lora_path = lora_path.strip()
        if not os.path.isfile(lora_path):
            raise FileNotFoundError(f"[LoRATxtLoaderFromPath] LoRA 文件不存在: {lora_path}")

        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, lora, strength_model, strength_clip
        )

        txt_path = os.path.splitext(lora_path)[0] + ".txt"
        trigger_words = ""
        # 安全：只读取 loras 目录内的 .txt，防止路径穿越
        if os.path.isfile(txt_path) and _is_safe_lora_txt(txt_path):
            with open(txt_path, "r", encoding="utf-8") as f:
                trigger_words = f.read().strip()

        return (model_out, clip_out, trigger_words, lora_path)


# ── 节点 3：Txt File Loader ────────────────────────────────────────────────
class TxtFileLoader:

    @classmethod
    def INPUT_TYPES(cls):
        txt_list = folder_paths.get_filename_list("txt_files")
        return {
            "required": {
                "txt_name": (txt_list,),
                "text":     ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES  = ("STRING",)
    RETURN_NAMES  = ("text",)
    FUNCTION      = "load_txt"
    CATEGORY      = "loaders"

    def load_txt(self, txt_name, text):
        return (text,)


# ── 节点 4：LoRA Txt Loader (Dropdown) ────────────────────────────────────
class LoRATxtLoaderDropdown:

    @classmethod
    def INPUT_TYPES(cls):
        lora_list = folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model":           ("MODEL",),
                "clip":            ("CLIP",),
                "lora_name":       (lora_list,),
                "strength_model":  ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "strength_clip":   ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "positive_prompt": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES  = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES  = ("model", "clip", "positive_prompt", "lora_path")
    FUNCTION      = "load_lora"
    CATEGORY      = "loaders"

    def load_lora(self, model, clip, lora_name, strength_model, strength_clip, positive_prompt):
        lora_path = folder_paths.get_full_path("loras", lora_name)
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, lora, strength_model, strength_clip
        )
        return (model_out, clip_out, positive_prompt, lora_path)


NODE_CLASS_MAPPINGS = {
    "LoRATxtLoader":            LoRATxtLoader,
    "LoRATxtLoaderFromPath":    LoRATxtLoaderFromPath,
    "TxtFileLoader":            TxtFileLoader,
    "LoRATxtLoaderDropdown":    LoRATxtLoaderDropdown,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoRATxtLoader":            "LoRA Txt Loader",
    "LoRATxtLoaderFromPath":    "LoRA Txt Loader (From Path)",
    "TxtFileLoader":            "Txt File Loader",
    "LoRATxtLoaderDropdown":    "LoRA Txt Loader (Dropdown)",
}
