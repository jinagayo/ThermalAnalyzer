# TMX 분석 작업의 전체 순서를 관리하는 서비스 파일 

from __future__ import annotations

import json
from pathlib import Path
from typing import Any  

import numpy as np

from cache.tmx_cache import (
    cache_exists,
    create_tmx_cache,
    get_metadata_path,
    get_cache_path,
    get_cache_dir
)


# 캐시가 없으면 최초 한 번 생성
def ensure_tmx_cache(
        file_path : str | Path,
        cache_root : str | Path
) -> None:

    if not cache_exists(file_path, cache_root):
        create_tmx_cache(file_path, cache_root)


# tmx 파일 정보를 캐시 metadata.json 에서 읽는다. 
def get_tmx_info (
        file_path : str | Path,
        cache_root : str | Path
) -> dict[str, Any] :

    ensure_tmx_cache(file_path, cache_root)

    metadata_path = get_metadata_path(file_path, cache_root)

    return json.loads(
        metadata_path.read_text(
            encoding="utf-8"
        )
    )


# 전체 프레임 캐시를 메모리 매핑 방식으로 연다. 
def load_cached_tmx(
        file_path : str | Path,
        cache_root : str | Path
) -> np.ndarray :

    ensure_tmx_cache(file_path, cache_root)

    return np.load(
        get_cache_path(file_path, cache_root),
        mmap_mode="r"
    )


# 캐시에서 특정 프레임을 읽는다. 
def load_cached_frame(
        file_path : str | Path,
        cache_root : str | Path,
        frame_index : int
) -> np.ndarray : 

    frames = load_cached_tmx(file_path, cache_root)

    frame_count = frames.shape[0]

    if frame_index < 0 or frame_index >= frame_count :
        raise IndexError(
            f"프레임 범위를 벗어났습니다: "
            f"{frame_index} / 최대 {frame_count - 1}"
        )

    return np.asanyarray(
        frames[frame_index]
    )


# Electron에서 tmx 파일 선택 후 호출하는 대표 함수
def prepare_tmx(
        file_path : str | Path,
        cache_root : str | Path
) -> dict[str, Any] :

    path = Path(file_path)
    root = Path(cache_root)

    if not path.exists():
        raise FileNotFoundError(
            f"파일 경로가 아닙니다: {path}"
        )

    if path.suffix.lower() != ".tmx":
        raise ValueError(
            f"TMX 파일이 아닙니다: {path.name}"
        )

    root.mkdir(
        parents=True,
        exist_ok=True
    )

    metadata = get_tmx_info(
        path,
        root
    )

    return {
        "success": True,
        "metadata": metadata,
        "cache_path": str(
            get_cache_path(
                path,
                root
            ).resolve()
        ),
        "metadata_path": str(
            get_metadata_path(
                path,
                root
            ).resolve()
        )
    }