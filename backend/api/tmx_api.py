from __future__ import annotations

from pathlib import Path
from typing import Any  

import numpy as np

from tmx.reader import TMXReader


# tmx 파일 기본 정보 반환
# dict[str, Any] -> 딕셔너리 키 : 문자열 / 딕셔너리 값 : 여러 타입이 들어올 수 있음 
def get_tmx_info(
        file_path: str | Path
) -> dict[str, Any]:

    path = Path(file_path)

    # with 블록을 빠져나오면 파일과 mmap이 자동으로 닫힘 
    with TMXReader(path) as reader : 
        return {
            "file_name" : path.name,
            "file_path" : str(path.resolve()),
            "width" : reader.width,
            "height" : reader.height,
            "frame_count" : reader.frame_count
        }


# TMX 파일의 특정 프레임을 섭씨 온도 배열로 반환한다.
def load_tmx_frame(
        file_path: str | Path,
        frame_index: int,
) -> np.ndarray :

    path = Path(file_path)

    with TMXReader(path) as reader : 
        temperature = reader.read_frame(frame_index)

    return temperature


# TMX 파일에 대응하는 캐시 폴더 경로를 반환한다. 
# path.stem : 파일명에서 확장자를 제외한 이름 
def get_cache_dir(
        file_path: str | Path 
) -> Path :

    path = Path(file_path)

    cache_dir = (
        path.parent
        / ".cache"
        / path.stem
    )

    cache_dir.mkdir(
        parents=True,      # 중간 폴더가 없어도 함께 만들기
        exist_ok=True      # 폴더가 이미 존재해도 오류 발생하지 않기 
    )

    return cache_dir 


# tmx 전체 프레임 캐시 파일 경로를 반환한다. 
def get_cache_path(
        file_path: str | Path,
) -> Path:

    path = Path(file_path)
    cache_dir = get_cache_dir(path)

    return cache_dir / f"{path.stem}.npy"


# tmx 전체 프레임을 섭씨 온도 배열로 변환하여 .npy로 저장한다. 
def create_tmx_cache(
        file_path: str | Path
) -> Path:

    path = Path(file_path)
    cache_path = get_cache_path(path)

    with TMXReader(path) as reader:
        frames = np.empty(
            (
            reader.frame_count,
            reader.height,
            reader.width
        ),
        dtypes=np.float32
        )

        for frame_index in range(reader.frame_count):
            frames[frame_index] = reader.read_frame(frame_index)

    np.save(
        cache_path,
        frames
    )

    return cache_path


# TMX 캐시가 있으면 캐시를 읽고, 없으면 먼저 생성한다. 
def load_cached_tmx(
        file_path: str | Path,
) -> np.ndarray:

    cache_path = get_cache_path(file_path)

    if not cache_path.exists():
        create_tmx_cache(file_path)

    # mmap_mode = "r" -> 전체 .npy 파일을 한 번에 RAM에 전부 올리지 않고, 필요한 부분만 읽도록 한다. 
    return np.load(
        cache_path,
        mmap_mode = "r"
    )


# 전체 캐시에서 특정 프레임만 반환한다.
def load_cached_frame(
        file_path : str | Path,
        frame_index : int
) -> np.ndarray:

    frames = load_cached_tmx(file_path)

    if frame_index < 0 or frame_index >= frames.shape[0]:
        raise IndexError(
            f"프레임 범위를 벗어났습니다: "
            f"{frame_index} / 최대 {frames.shape[0] - 1}"
        )

    return np.asarray(frames[frame_index])