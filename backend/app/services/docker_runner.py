from pathlib import Path
from app.core.settings import NODE_NPM_CACHE_VOLUME, NODE_MODULES_VOLUME_PREFIX, NODE_TMPFS_SIZE
from app.utils.docker_names import sanitize_project_id


def node_extra_mounts_and_flags(project_id: str) -> tuple[list[str], list[str]]:
    pid = sanitize_project_id(project_id)

    node_modules_vol = f"{NODE_MODULES_VOLUME_PREFIX}{pid}"
    npm_cache_vol = NODE_NPM_CACHE_VOLUME

    mounts = [
        # 프로젝트 별 node_moules
        "-v", f"{node_modules_vol}:/workspace/node_modules",
        # 공유 npm 캐시
        "-v", f"{npm_cache_vol}:/home/node/.npm",
    ]

    flags = [
        "--read-only",
        "--tmpfs", f"/tmp:rw,exec,nosuid,nodev,size={NODE_TMPFS_SIZE}",

        # npm이 HOME 기반으로 동작하게
        "-e", "HOME=/home/node",
        "-e", "NPM_CONFIG_CACHE=home/node/.npm",
    ]

    return mounts, flags


def docker_fs_secu(project_id: str, project_path: Path, is_node: bool) -> list[str]:
    # ------------------------------------
    # filesystem / security
    # ------------------------------------
    cmd = []
    if is_node:
        pid = sanitize_project_id(project_id)

        node_moduls_vol = f"{NODE_MODULES_VOLUME_PREFIX}{pid}"

        cmd +=[
            # 보안 옵션
            "--read-only",

            # project source (ro)
            "-v", f"{project_path}:/app:ro",

            # project 별 node_modules
            "-v", f"{node_moduls_vol}:/app/node_modules",

            # npm cache(공유)
            "-v", f"{NODE_NPM_CACHE_VOLUME}:/home/node/.npm",

            # tmpfs
            "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=512m",

            # npm 환경
            "-e", "HOME=/home/node",
            "-e", "NPM_CONFIG_CACHE=/home/nde/.npm",
        ]
    else:
        # 기존 python / bash
        cmd += [
            # 보안 옵션
            "--read-only",

            # 파일시스템
            "-v", f"{project_path}:/app:ro",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        ]

    cmd += ["-w", "/app",]
    
    return cmd