# 어떤 컬러맵을 사용할지 결정 (컬러맵 이름과 실제 .COL 파일을 연결함)
# 이미 읽은 lut를 캐시
# 이미지에 lut 적용 

from __future__ import annotations

import numpy as np
from PIL import Image

from .lut import load_col_lut

COLORMAP_FILES: dict[str, str] = {
    "iron": "IRON.COL",
    "olive": "OLIVE.COL",
    "avrainbow": "AVRAINBOW.COL",
    "hotblack": "HOTBLACK.COL",
    "hotiron": "HOTIRON.COL",
    "hotwhite": "HOTWHITE.COL",
    "iris": "IRIS.COL",
}

DEFAULT_COLORMAP = "avrainbow"

_LUT_CACHE : dict[str, np.ndarray] = {}


# 사용 가능한 컬러맵 이름 반환
def get_colormap_names() -> tuple[str, ...]:

    return tuple(COLORMAP_FILES.keys())


# 컬러맵 이름을 정리하고 검증한다.
# 잘못된 이름이면 기본 컬러맵을 반환한다 
def _normalize_colormap_name(
        name : str | None
) -> str:

    if not isinstance(name, str):
        return DEFAULT_COLORMAP

    normalized_name = name.strip().lower()

    if normalized_name not in COLORMAP_FILES:
        return DEFAULT_COLORMAP

    return normalized_name 


# 컬러맵 LUT를 반환한다.
# 한 번 읽은 lut는 캐시에 저장하여 재사용한다.
def _get_lut(
        colormap: str | None
)-> np.ndarray:

    safe_name = _normalize_colormap_name(colormap)

    if safe_name not in _LUT_CACHE:
        file_name = COLORMAP_FILES[safe_name]
        _LUT_CACHE[safe_name] = load_col_lut(file_name)

    return _LUT_CACHE[safe_name]


# 정규화된 배열을 검사하고 uint8로 변환한다. 
def _validate_normalized_array(
        normalized : np.ndarray
) -> np.ndarray:

    array = np.asarray(normalized)   # 배열이면 그냥 써. (np.array() -> 새 배열 하나 만들어)

    if array.ndim != 2 :
        raise ValueError(
            "정규화 배열은 2차원이어야 합니다. "
            f"현재 shape: {array.shape}"
        )

    # np.issubdtype(확인할 타입, 기준 타입) => True/False 반환 
    if not np.issubdtype(array.dtype, np.number):
        raise TypeError(
            "정규화 배열은 숫자 타입이어야 합니다. "
        )

    # np.clip() : 배열의 값을 지정한 최소값과 최대값 사이로 제한하는 함수 
    # 최소값보다 작은 값 -> 최소값으로 변경
    # 최대값보다 큰 값 -> 최대값으로 변경 
    return np.clip(
        array,
        0,
        255
    ).astype(np.uint8)


# 0~255 배열에 col 컬러맵을 적용해 rgb 이미지를 만든다. 
def apply_colormap(
        normalized : np.ndarray,
        colormap : str = DEFAULT_COLORMAP,
) -> Image.Image:

    normalized_u8 = _validate_normalized_array(normalized)

    lut = _get_lut(colormap)

    rgb = lut[normalized_u8]

    return Image.fromarray(
        rgb,
        mode="RGB"
    )

    