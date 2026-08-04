# 캐시의 저장·조회 방법을 담당

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from tmx.reader import TMXReader



# 선택한 tmx 파일에 대한 캐시 폴더 경로를 만든다. 
# path.stem : 파일명에서 확장자를 제외한 이름 
def get_cache_dir(
        file_path: str | Path,
        cache_root : str | Path 
) -> Path :

    path = Path(file_path)
    root = Path(cache_root)

    return root / path.stem


# tmx 전체 프레임 캐시 파일 경로 반환 
def get_cache_path(
        file_path: str | Path,
        cache_root: str | Path
) -> Path:

    path = Path(file_path)
    cache_dir = get_cache_dir(
        path,
        cache_root
    )

    return cache_dir / f"{path.stem}.npy"


# tmx 기본 정보 캐시 경로 반환
def get_metadata_path(
        file_path : str | Path,
        cache_root : str | Path
) -> Path:

    path = Path(file_path)
    cache_dir = get_cache_dir(
        path,
        cache_root
    )

    return cache_dir / f"{path.stem}_metadata.json"


# 필요한 캐시 파일이 모두 존재하는지 확인
def cache_exists(
        file_path : str | Path,
        cache_root : str | Path
) -> bool :

    return (
        get_cache_path(
            file_path,
            cache_root
        ).exists()
        and get_metadata_path(
            file_path,
            cache_root
        ).exists()
    )


# 원본 TMX를 읽어 캐시를 생성한다. 
# TMXReader는 이 함수에서만 사용한다. 
def create_tmx_cache(
        file_path : str | Path,
        cache_root: str | Path,
        overwrite : bool = False
) -> Path :

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"TMX 파일을 찾을 수 없습니다: {path}"
        )

    cache_dir = get_cache_dir(
        path,
        cache_root
    )

    cache_path = get_cache_path(
        path,
        cache_root
    )

    metadata_path = get_metadata_path(
        path,
        cache_root
    )

    # 기존 캐시가 있다면 다시 생성하지 않는다. 
    if cache_exists(path, cache_root) and not overwrite:
        return cache_path

    cache_dir.mkdir(
        parents= True,    
        exist_ok = True
    )

    # 원본 TMX 접근은 여기서만 발생
    with TMXReader(path) as reader:
        metadata = {
            "file_name" : path.name,
            "file_path" : str(path.resolve()),
            "width" : reader.width,
            "height" : reader.height,
            "frame_count" : reader.frame_count,
            "dtype" : "float32"
        }

        # np.empty() 대신 open_memmap() 사용
        # np.empty() : 전체 프레임 배열을 RAM에 먼저 만들고 np.save()로 한 번에 저장 
        # np.lib.format.open_memmap(...) : .npy 파일에 직접 프레임을 하나씩 기록 (캐시 생성 중 전체 배열을 RAM에 올리지 않아도 됨!) 
        frames = np.lib.format.open_memmap(
            cache_path,
            mode="w+",
            dtype=np.float32,
            shape=(
                reader.frame_count,
                reader.height,
                reader.width
            )
        )

        # 전체 tmx의 최저, 최고 온도를 저장할 변수 
        global_min_temperature = float("inf")
        global_max_temperature = float("-inf")

        for frame_index in range(reader.frame_count):
            frame = reader.read_frame(frame_index)

            # 현재 프레임을 npy 캐시에 저장
            frames[frame_index] = frame

            # 현재 프레임의 최저, 최고 온도 계산 
            frame_min_temperature = float(np.min(frame))
            frame_max_temperature = float(np.max(frame))

            # 지금까지 읽은 프레임 중 전체 최저, 최고 온도 갱신
            global_min_temperature = min(
                global_min_temperature,
                frame_min_temperature
            )

            global_max_temperature = max(
                global_max_temperature,
                frame_max_temperature
            )

        metadata["min_temperature"] = global_min_temperature
        metadata["max_temperature"] = global_max_temperature

        # 디스크에 기록
        frames.flush()

        # 파일 매핑 닫기
        del frames

    metadata_path.write_text(
        json.dumps(
            metadata,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    return cache_path

