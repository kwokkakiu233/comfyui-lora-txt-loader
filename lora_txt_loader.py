import os
import time
import json
import folder_paths
import comfy.utils
import comfy.sd
from server import PromptServer
from aiohttp import web
from datetime import datetime
import sys
import importlib.util

# 获取 folder_paths 模块所在目录（ComfyUI 根目录）
folder_paths_spec = importlib.util.find_spec('folder_paths')
if folder_paths_spec and folder_paths_spec.origin:
    comfyui_base_path = os.path.dirname(os.path.realpath(folder_paths_spec.origin))
else:
    comfyui_base_path = None

# 获取共享 input 目录
shared_input_base = folder_paths.get_input_directory()

# 构建扫描目录列表
scan_dirs = []

# 1. ComfyUI 安装目录的 input/texts
if comfyui_base_path:
    comfyui_input_texts = os.path.join(comfyui_base_path, "input", "texts")
    if os.path.isdir(comfyui_input_texts):
        scan_dirs.append(comfyui_input_texts)
    print(f"[TxtFileLoader] ComfyUI base_path: {comfyui_base_path}")
else:
    print(f"[TxtFileLoader] WARNING: Could not determine ComfyUI base_path")

# 2. 共享 input 目录的 input/texts
shared_input_texts = os.path.join(shared_input_base, "texts") if shared_input_base else None
if shared_input_texts and os.path.isdir(shared_input_texts):
    # 避免重复扫描
    if not scan_dirs or shared_input_texts != scan_dirs[0]:
        scan_dirs.append(shared_input_texts)

print(f"[TxtFileLoader] Shared input base: {shared_input_base}")
print(f"[TxtFileLoader] Scanning directories:")
for d in scan_dirs:
    print(f"  - {d}")

if not scan_dirs:
    print(f"[TxtFileLoader] WARNING: No valid directories to scan!")

# ────────────────────────────────────────────────
# 启动时扫描一次，缓存结果
# ────────────────────────────────────────────────
def _scan_txt_files_once():
    """启动时扫描一次所有 txt 文件"""
    files_dict = {}  # {filename: full_path}

    for scan_dir in scan_dirs:
        if not os.path.exists(scan_dir):
            print(f"[TxtFileLoader] Directory not found: {scan_dir}")
            continue
        try:
            files = [f for f in os.listdir(scan_dir) if f.endswith(".txt")]
            print(f"[TxtFileLoader] Found {len(files)} txt files in {scan_dir}")
            for filename in files:
                files_dict[filename] = os.path.join(scan_dir, filename)
        except Exception as e:
            print(f"[TxtFileLoader] Error scanning {scan_dir}: {e}")

    total = len(files_dict)
    print(f"[TxtFileLoader] Total: {total} unique txt files")
    return sorted(files_dict.keys())

# 启动时扫描一次
_cached_txt_files = _scan_txt_files_once()

def get_all_txt_files():
    """返回缓存的文件列表（已在启动时扫描）"""
    return _cached_txt_files

# ── loras 根目录白名单（用于路径安全校验）────────────────────────────────────
_lora_roots = set()
for _p in folder_paths.get_folder_paths("loras"):
    _lora_roots.add(os.path.realpath(_p))


def _is_safe_lora_txt(txt_path: str) -> bool:
    """检查 txt_path 是否在已知 loras 目录下，防止路径穿越。"""
    real = os.path.realpath(txt_path).lower()
    return any(
        real.startswith((root + os.sep).lower()) or real == root.lower()
        for root in _lora_roots
    )


def _get_lora_base_dir(lora_name: str) -> str:
    """获取 LoRA 模型的目录路径"""
    lora_path = folder_paths.get_full_path("loras", lora_name)
    if lora_path:
        return os.path.dirname(lora_path)
    return None


def _get_lora_basename(lora_name: str) -> str:
    """获取 LoRA 文件的基名（不含扩展名）"""
    lora_path = folder_paths.get_full_path("loras", lora_name)
    if lora_path:
        return os.path.splitext(os.path.basename(lora_path))[0]
    return None


def _ensure_versions_dir(lora_name: str) -> str:
    """确保 LoRA 的版本目录存在，返回版本目录路径"""
    base_dir = _get_lora_base_dir(lora_name)
    basename = _get_lora_basename(lora_name)
    if not base_dir or not basename:
        return None

    versions_dir = os.path.join(base_dir, f"{basename}.versions")
    os.makedirs(versions_dir, exist_ok=True)
    return versions_dir


def _read_manifest(versions_dir: str) -> dict:
    """读取 manifest.json，如果不存在返回空结构"""
    manifest_path = os.path.join(versions_dir, "_manifest.json")
    if not os.path.isfile(manifest_path):
        return {
            "versions": [],
            "current_version": None,
            "locked_version": "_original.txt",
        }
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {
            "versions": [],
            "current_version": None,
            "locked_version": "_original.txt",
        }


def _write_manifest(versions_dir: str, manifest: dict):
    """写入 manifest.json"""
    manifest_path = os.path.join(versions_dir, "_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def _read_file_safe(file_path: str) -> str:
    """安全地读取文件内容"""
    if not os.path.isfile(file_path):
        return ""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except:
        return ""


def _write_file_safe(file_path: str, content: str):
    """安全地写入文件内容"""
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    except:
        return False


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


# ── API：获取文件列表（返回缓存结果）────────────────────────────────
@PromptServer.instance.routes.get("/lora_txt_loader/get_txt_list")
async def get_txt_list(request):
    # 直接返回缓存的文件列表，无需重新扫描
    return web.json_response({"files": _cached_txt_files})

# ── API：获取单个文件内容 ────────────────────────────────
@PromptServer.instance.routes.get("/lora_txt_loader/get_txt_file")
async def get_txt_file(request):
    txt_name = request.rel_url.query.get("txt_name", "")
    if not txt_name:
        return web.json_response({"txt": ""})

    # 防止路径遍历
    if ".." in txt_name or txt_name.startswith("/"):
        return web.json_response({"txt": ""}, status=403)

    # 从所有目录中查找文件
    for scan_dir in scan_dirs:
        txt_path = os.path.realpath(os.path.join(scan_dir, txt_name))
        # 确保文件在扫描目录内
        if not txt_path.startswith(os.path.realpath(scan_dir)):
            continue

        if os.path.isfile(txt_path):
            try:
                with open(txt_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                return web.json_response({"txt": content})
            except Exception as e:
                print(f"[TxtFileLoader] Error reading {txt_path}: {e}")
                continue

    return web.json_response({"txt": ""})


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
        "files": sorted(files, key=lambda f: f["name"].lower())
    })


# ════════════════════════════════════════════════════════════════════════
#  版本管理 API
# ════════════════════════════════════════════════════════════════════════

@PromptServer.instance.routes.get("/lora_txt_loader/version_status")
async def version_status(request):
    """检查 LoRA 的版本管理状态"""
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name:
        return web.json_response({"error": "missing lora_name"}, status=400)

    base_dir = _get_lora_base_dir(lora_name)
    basename = _get_lora_basename(lora_name)
    if not base_dir or not basename:
        return web.json_response({"error": "invalid lora_name"}, status=400)

    versions_dir = os.path.join(base_dir, f"{basename}.versions")
    txt_path = os.path.join(base_dir, f"{basename}.txt")

    has_versions = os.path.isdir(versions_dir)
    current_txt_content = _read_file_safe(txt_path)

    versions_list = []
    locked_version = "_original.txt"
    current_version = None
    has_original = False
    original_content = None

    if has_versions:
        manifest = _read_manifest(versions_dir)
        locked_version = manifest.get("locked_version", "_original.txt")
        current_version = manifest.get("current_version")

        # 检查 _original.txt 是否存在
        original_path = os.path.join(versions_dir, "_original.txt")
        has_original = os.path.isfile(original_path)
        # 读取原始版本内容用于比较
        original_content = _read_file_safe(original_path)

        for item in manifest.get("versions", []):
            versions_list.append({
                "filename": item["filename"],
                "custom_name": item.get("custom_name", ""),
                "remark": item.get("remark", ""),
                "timestamp": item.get("timestamp", ""),
                "is_locked": item["filename"] == locked_version,
                "is_current": item["filename"] == current_version,
            })

    return web.json_response({
        "has_versions": has_versions,
        "has_original": has_original,
        "current_txt_content": current_txt_content,
        "original_content": original_content,
        "versions_list": versions_list,
        "locked_version": locked_version,
        "current_version": current_version,
    })

@PromptServer.instance.routes.post("/lora_txt_loader/save_version")
async def save_version(request):
    """保存 LoRA 提示词版本"""
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "invalid json"}, status=400)

    lora_name = data.get("lora_name", "").strip()
    content = data.get("content", "").strip()
    custom_name = data.get("custom_name", "").strip()
    remark = data.get("remark", "").strip()

    if not lora_name:
        return web.json_response({"error": "missing lora_name"}, status=400)
    if not content:
        return web.json_response({"error": "content cannot be empty"}, status=400)

    base_dir = _get_lora_base_dir(lora_name)
    basename = _get_lora_basename(lora_name)
    if not base_dir or not basename:
        return web.json_response({"error": "invalid lora_name"}, status=400)

    txt_path = os.path.join(base_dir, f"{basename}.txt")
    versions_dir = _ensure_versions_dir(lora_name)
    if not versions_dir:
        return web.json_response({"error": "cannot create versions dir"}, status=500)

    manifest = _read_manifest(versions_dir)
    original_path = os.path.join(versions_dir, "_original.txt")

    # 读取原始 txt 文件内容
    original_txt_content = _read_file_safe(txt_path)

    # 第一次保存的处理（版本文件夹为空或没有版本)
    is_first_save = not manifest.get("versions")

    if is_first_save:
        # 情况1：有 txt 且不为空
        if original_txt_content:
            # 比较当前编辑的内容和原始 txt 内容
            if content == original_txt_content:
                # 内容相同：保存为默认版本，txt 不变
                if not _write_file_safe(original_path, original_txt_content):
                    return web.json_response({"error": "failed to save original version"}, status=500)

                manifest["versions"] = []
                manifest["current_version"] = "_original.txt"
                manifest["locked_version"] = "_original.txt"
                _write_manifest(versions_dir, manifest)

                return web.json_response({
                    "success": True,
                    "is_default": True,
                    "message": "Content is identical to original. No version changes needed.",
                })
            else:
                # 内容不同：原始 txt 保存为默认版本，新内容需要版本号
                if not custom_name:
                    return web.json_response(
                        {"error": "custom_name cannot be empty when content differs from original"}, status=400)

                if not _write_file_safe(original_path, original_txt_content):
                    return web.json_response({"error": "failed to save original version"}, status=500)
        else:
            # 情况2：没有 txt 或 txt 为空
            # 当前内容同时作为默认版本
            if not _write_file_safe(original_path, content):
                return web.json_response({"error": "failed to save original version"}, status=500)

            # 创建 txt 文件
            if not _write_file_safe(txt_path, content):
                return web.json_response({"error": "failed to create .txt file"}, status=500)

            manifest["versions"] = []
            manifest["current_version"] = "_original.txt"
            manifest["locked_version"] = "_original.txt"
            _write_manifest(versions_dir, manifest)

            return web.json_response({
                "success": True,
                "is_default": True,
                "message": "Saved as default version.",
            })

    # 非第一次保存：必须有版本号
    if not custom_name:
        return web.json_response({"error": "custom_name cannot be empty"}, status=400)

    # 检查 custom_name 唯一性
    for v in manifest.get("versions", []):
        if v.get("custom_name") == custom_name:
            return web.json_response({"error": f"custom_name '{custom_name}' already exists"}, status=400)

    # 检查内容是否与原始版本相同
    original_content = _read_file_safe(original_path)
    if content == original_content:
        return web.json_response({"error": "content is identical to original version"}, status=400)

    # 保存新版本文件
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    version_filename = f"{timestamp}_{custom_name}.txt"
    version_path = os.path.join(versions_dir, version_filename)

    counter = 1
    while os.path.exists(version_path):
        base_name = f"{timestamp}_{custom_name}"
        version_filename = f"{base_name}_({counter}).txt"
        version_path = os.path.join(versions_dir, version_filename)
        counter += 1

    if not _write_file_safe(version_path, content):
        return web.json_response({"error": "failed to save version file"}, status=500)

    # 更新 manifest
    if "versions" not in manifest:
        manifest["versions"] = []

    manifest["versions"].append({
        "filename": version_filename,
        "custom_name": custom_name,
        "remark": remark,
        "timestamp": timestamp,
    })
    manifest["current_version"] = version_filename
    manifest["locked_version"] = "_original.txt"

    _write_manifest(versions_dir, manifest)

    # 更新同级 .txt 文件为最新版本
    if not _write_file_safe(txt_path, content):
        return web.json_response({"error": "failed to update .txt file"}, status=500)

    return web.json_response({
        "success": True,
        "version_filename": version_filename,
        "message": f"Version '{custom_name}' saved successfully",
    })


@PromptServer.instance.routes.post("/lora_txt_loader/load_version")
async def load_version(request):
    """加载指定版本的内容"""
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "invalid json"}, status=400)

    lora_name = data.get("lora_name", "").strip()
    version_filename = data.get("version_filename", "").strip()

    if not lora_name or not version_filename:
        return web.json_response({"error": "missing parameters"}, status=400)

    base_dir = _get_lora_base_dir(lora_name)
    basename = _get_lora_basename(lora_name)
    if not base_dir or not basename:
        return web.json_response({"error": "invalid lora_name"}, status=400)

    versions_dir = os.path.join(base_dir, f"{basename}.versions")
    if not os.path.isdir(versions_dir):
        return web.json_response({"error": "versions directory not found"}, status=404)

    # 处理 _original.txt（默认版本）
    if version_filename == "_original.txt":
        version_path = os.path.join(versions_dir, "_original.txt")
    else:
        version_path = os.path.join(versions_dir, version_filename)

    if not os.path.isfile(version_path):
        return web.json_response({"error": "version file not found"}, status=404)

    content = _read_file_safe(version_path)

    # 更新 .txt 文件
    txt_path = os.path.join(base_dir, f"{basename}.txt")
    if not _write_file_safe(txt_path, content):
        return web.json_response({"error": "failed to update .txt file"}, status=500)

    # 更新 manifest 中的 current_version
    manifest = _read_manifest(versions_dir)
    manifest["current_version"] = version_filename
    _write_manifest(versions_dir, manifest)

    return web.json_response({
        "success": True,
        "content": content,
        "message": f"Version '{version_filename}' loaded successfully",
    })


@PromptServer.instance.routes.post("/lora_txt_loader/delete_version")
async def delete_version(request):
    """删除指定版本"""
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "invalid json"}, status=400)

    lora_name = data.get("lora_name", "").strip()
    version_filename = data.get("version_filename", "").strip()

    if not lora_name or not version_filename:
        return web.json_response({"error": "missing parameters"}, status=400)

    base_dir = _get_lora_base_dir(lora_name)
    basename = _get_lora_basename(lora_name)
    if not base_dir or not basename:
        return web.json_response({"error": "invalid lora_name"}, status=400)

    versions_dir = os.path.join(base_dir, f"{basename}.versions")
    if not os.path.isdir(versions_dir):
        return web.json_response({"error": "versions directory not found"}, status=404)

    # 检查是否为被锁定的版本
    manifest = _read_manifest(versions_dir)
    locked_version = manifest.get("locked_version", "_original.txt")
    current_version = manifest.get("current_version")

    if version_filename == locked_version or version_filename == current_version:
        return web.json_response({
            "error": f"Cannot delete '{version_filename}': locked or currently active"
        }, status=403)

    version_path = os.path.join(versions_dir, version_filename)
    if not os.path.isfile(version_path):
        return web.json_response({"error": "version file not found"}, status=404)

    # 删除版本文件
    try:
        os.remove(version_path)
    except Exception as e:
        return web.json_response({"error": f"failed to delete file: {str(e)}"}, status=500)

    # 从 manifest 删除记录
    manifest["versions"] = [
        v for v in manifest.get("versions", [])
        if v["filename"] != version_filename
    ]
    _write_manifest(versions_dir, manifest)

    return web.json_response({
        "success": True,
        "message": f"Version '{version_filename}' deleted successfully",
    })


# ────────────────────────────────────────────────────────────────────────
#  节点定义
# ────────────────────────────────────────────────────────────────────────

class LoRATxtLoader:

    @classmethod
    def INPUT_TYPES(cls):
        lora_list = folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_name": (lora_list,),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "positive_prompt": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES = ("model", "clip", "positive_prompt", "lora_path")
    FUNCTION = "load_lora"
    CATEGORY = "loaders"

    def load_lora(self, model, clip, lora_name, strength_model, strength_clip, positive_prompt):
        lora_path = folder_paths.get_full_path("loras", lora_name)
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, lora, strength_model, strength_clip
        )
        return (model_out, clip_out, positive_prompt, lora_path)


class LoRATxtLoaderFromPath:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_path": ("STRING", {"default": "", "multiline": False}),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES = ("model", "clip", "positive_prompt", "lora_path")
    FUNCTION = "load_lora"
    CATEGORY = "loaders"

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
        if os.path.isfile(txt_path) and _is_safe_lora_txt(txt_path):
            with open(txt_path, "r", encoding="utf-8") as f:
                trigger_words = f.read().strip()

        return (model_out, clip_out, trigger_words, lora_path)


class TxtFileLoader:

    @classmethod
    def INPUT_TYPES(cls):
        # 直接使用缓存的文件列表
        txt_list = _cached_txt_files if _cached_txt_files else ["(No txt files found)"]

        return {
            "required": {
                "txt_name": (tuple(txt_list),),
                "text": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "load_txt"
    CATEGORY = "loaders"

    def load_txt(self, txt_name, text):
        return (text,)


class LoRATxtLoaderDropdown:

    @classmethod
    def INPUT_TYPES(cls):
        lora_list = folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_name": (lora_list,),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "positive_prompt": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES = ("model", "clip", "positive_prompt", "lora_path")
    FUNCTION = "load_lora"
    CATEGORY = "loaders"

    def load_lora(self, model, clip, lora_name, strength_model, strength_clip, positive_prompt):
        lora_path = folder_paths.get_full_path("loras", lora_name)
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, lora, strength_model, strength_clip
        )
        return (model_out, clip_out, positive_prompt, lora_path)


NODE_CLASS_MAPPINGS = {
    "LoRATxtLoader": LoRATxtLoader,
    "LoRATxtLoaderFromPath": LoRATxtLoaderFromPath,
    "TxtFileLoader": TxtFileLoader,
    "LoRATxtLoaderDropdown": LoRATxtLoaderDropdown,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoRATxtLoader": "LoRA Txt Loader",
    "LoRATxtLoaderFromPath": "LoRA Txt Loader (From Path)",
    "TxtFileLoader": "Txt File Loader",
    "LoRATxtLoaderDropdown": "LoRA Txt Loader (Dropdown)",
}