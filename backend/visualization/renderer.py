from __future__ import annotations

import numpy as np
from PIL import Image
from .colormap import (
    COLORMAP_FILES,
    DEFAULT_COLORMAP,
    apply_colormap,
)

from .normalize import _temperature_to_lut_u8


"""
섭씨 온도 배열을 컬러맵이 적용된 RGB 이미지로 변환한다. 

표시 온도 범위 결정 방식 
    1. global_display_min 와 global_display_max 가 모두 전달된 경우 모든 프레임에 동일한 온도 범위를 사용한다. 
    2. 전역 범위가 전달되지 않은 경우 현재 프레임의 p_low ~ p_high 백분위 값을 사용한다. (프레임마다 범위가 달라질 수 있음)

parameters
    1. temp_c : (height, width) 형태의 섭씨 온도 배열
    2. colormap : 적용할 컬러맵 이름
    3. p_low, p_high : 현재 프레임에서 표시 범위를 계산할 백분위 값
    4. gamma : 밝기 분포 조정값, 1.0이면 감마 보정 없음
    5. global_display_min, global_display_max : 여러 프레임에서 공통으로 사용할 최소, 최대 온도 

Returns
    1. image : 컬러맵이 적용된 PIL RGB 이미지
    2. info : 프레임 온도 및 표시 범위 정보     
"""

def frame_to_image(
        temp_c: np.ndarray,
        colormap: str = DEFAULT_COLORMAP,
        p_low: float = 5.0,
        p_high: float = 99.99,
        gamma: float = 1.0,
        global_display_min: float | None = None,
        global_display_max: float | None = None,
) -> tuple[Image.Image, dict[str, float | int]] :

    temperature = _validate_temperature_array(temp_c)

    valid_mask = np.isfinite(temperature)  
    valid_temperature = temperature[valid_mask]

    # NaN, inf 를 제외한 유효한 온도가 하나도 없는 경우 
    if valid_temperature.size == 0 : 
        normalized = np.zeros(temperature.shape, dtype=np.uint8)

        display_min = 0.0
        display_max = 0.0
        temperature_min = 0.0
        temperature_max = 0.0 

    else:
        temperature_min = float(np.min(valid_temperature))
        temperature_max = float(np.max(valid_temperature))

        display_min, display_max = _resolve_display_range(
            valid_temperature = valid_temperature,
            p_low = p_low,
            p_high = p_high,
            global_display_min = global_display_min,
            global_display_max = global_display_max
        )

        if display_max <= display_min :
            normalized = np.zeros(
                temperature.shape,
                dtype = np.uint8
            )
        else:
            normalized = _temperature_to_lut_u8(
                temp_c = temperature,
                display_min = display_min,
                display_max = display_max,
                gamma = gamma
            )

            # 원본에서 NaN 또는 inf였던 위치는 첫 번째 LUT 색상으로 처리 
            normalized[~valid_mask] = 0 

    colormap_name = _resolve_colormap_name(colormap)

    image = apply_colormap(
        normalized=normalized,
        colormap=colormap_name,
    )

    info: dict[str, float | int] = {
        "c_min": temperature_min,
        "c_max": temperature_max,
        "display_min": display_min,
        "display_max": display_max,
        "pixel_count": int(np.count_nonzero(valid_mask)),
    }

    return image, info


# 온도 배열의 타입과 모양을 검사 
# float32로 변환 
# 온도 계산을 하기 좋은 형태로 만드는 함수 
def _validate_temperature_array(
        temp_c : np.ndarray
) -> np.ndarray : 

    temperature = np.asarray(temp_c)

    if temperature.ndim != 2:
        raise ValueError(
            "온도 배열은 (height, width) 형태의 "
            f"2차원 배열이어야 합니다: {temperature.shape}"
        )

    if not np.issubdtype(temperature.dtype, np.number):
        raise TypeError(
            "온도 배열은 숫자 타입이어야 합니다."
        )

    return temperature.astype(
        np.float32,
        copy=False
    )

# 이미지에 표시할 최소, 최대 온도를 결정한다.
def _resolve_display_range(
        valid_temperature : np.ndarray,
        p_low : float,
        p_high : float,
        global_display_min : float | None, 
        global_display_max : float | None 
) -> tuple[float, float] :

    # 전역 범위는 두 값이 모두 들어왔을 때만 사용 
    if global_display_min is not None and global_display_max is not None:
        display_min = float(global_display_min)
        display_max = float(global_display_max)

        if not np.isfinite(display_min):
            raise ValueError(
                "global_display_min 는 유한한 숫자여야 합니다."
            )

        if not np.isfinite(display_max):
            raise ValueError(
                "global_display_max 는 유한한 숫자여야 합니다."
            )

        if display_max <= display_min :
            raise ValueError(
                "global_display_max는 global_display_min보다 커야 합니다."
            )

        return display_min, display_max

    # 한 쪽 값만 전달되면 사용자의 입력 실수일 가능성이 높음
    if global_display_min is not None or global_display_max is not None:
        raise ValueError(
            "global_display_min 와 global_display_max 는 "
            "함께 전달해야 합니다."
        )

    if not 0.0 <= p_low < p_high <= 100.0:
        raise ValueError(
            "백분위 범위는 "
            "0 <= p_low < p_high <= 100이어야 합니다."
        )

    display_min, display_max = np.percentile(
        valid_temperature,
        [p_low, p_high]
    )

    return float(display_min), float(display_max)

def _resolve_colormap_name(
    colormap: str | None,
) -> str:
    """컬러맵 이름을 안전하게 정리한다."""

    colormap_name = (
        colormap or DEFAULT_COLORMAP
    ).strip().lower()

    if colormap_name not in COLORMAP_FILES:
        return DEFAULT_COLORMAP

    return colormap_name