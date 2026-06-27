import os
import folder_paths
import comfy.utils
import comfy.sd
from server import PromptServer
from aiohttp import web


# ── texts 目录：在 API 之前初始化，确保路径可用 ─────────────────────────────
_texts_dir = os.path.join(folder_paths.get_input_directory(), "texts")
os.makedirs(_texts_dir, exist_ok=True)
folder_paths.add_model_folder_path("txt_files", _texts_dir)


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

    txt_path = os.path.join(_texts_dir, txt_name)
    if not os.path.isfile(txt_path):
        return web.json_response({"txt": ""})

    with open(txt_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    return web.json_response({"txt": content})


# ── API：供前端级联菜单浏览 LoRA 目录结构 ─────────────────────────────────
# 不猜根目录，直接从 get_filename_list("loras") 解析结构
# subpath 用正斜杠，如 "" = 根目录，"qt" = qt子目录，"qt/sub" = 更深一级
@PromptServer.instance.routes.get("/lora_txt_loader/browse_loras")
async def browse_loras(request):
    subpath = request.rel_url.query.get("subpath", "").strip().replace("\\", "/")

    all_loras = folder_paths.get_filename_list("loras")
    # ComfyUI 返回的 lora_name 用反斜杠，统一转成正斜杠方便处理
    all_loras_normalized = [name.replace("\\", "/") for name in all_loras]

    # 特殊参数：返回全量文件列表，供前端搜索使用
    if subpath == "__all__":
        files = []
        for name in all_loras_normalized:
            rel = name.replace("/", "\\")
            filename = name.split("/")[-1]
            files.append({"name": filename, "rel": rel, "subpath": rel})
        return web.json_response({
            "folders": [],
            "files": sorted(files, key=lambda f: f["rel"].lower())
        })

    folders_dict = {}  # name -> subpath
    files = []

    prefix = (subpath + "/") if subpath else ""

    for name in all_loras_normalized:
        if not name.startswith(prefix):
            continue
        rest = name[len(prefix):]  # 去掉前缀后剩余部分
        if "/" in rest:
            # 还有子目录，取第一层目录名
            folder_name = rest.split("/")[0]
            folder_subpath = (subpath + "/" + folder_name) if subpath else folder_name
            # 用反斜杠与 ComfyUI 保持一致
            folders_dict[folder_name] = folder_subpath.replace("/", "\\")
        else:
            # 就在当前层，是文件
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


# ── 节点 1：LoRA Txt Loader（下拉选择 + 可编辑提示词文本框）─────────────────
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


# ── 节点 2：LoRA Txt Loader (From Path)（路径输入，其余同上）────────────────
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
        if os.path.isfile(txt_path):
            with open(txt_path, "r", encoding="utf-8") as f:
                trigger_words = f.read().strip()

        return (model_out, clip_out, trigger_words, lora_path)


# ── 节点 3：Txt File Loader（下拉选择 .txt 文件 + 可编辑文本框）──────────────
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


# ── 节点 4：LoRA Txt Loader (Dropdown)（原始下拉选择方式）────────────────────
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
