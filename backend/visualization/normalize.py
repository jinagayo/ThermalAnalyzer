# 온도 배열을 0~255 범위로 정규화 하기 
"""
온도 배열 (℃)
      │
      ▼
np.clip()
(범위 제한)
      │
      ▼
0~1 정규화
      │
      ▼
감마 보정(선택)
      │
      ▼
255 곱하기
      │
      ▼
반올림
      │
      ▼
0~255 범위 확인
      │
      ▼
uint8 변환
      │
      ▼
LUT 인덱스 배열
"""

import numpy as np

# display_min : 정규화의 최소 온도 (예를 들어 p1=20 이면 20도를 검정(0)으로 매핑)
# display_max : 정규화의 최대 온도 (예를 들어 p99=60 이면 60도를 흰색(255)으로 매핑)
# gamma : 감마 보정 값 (1.0이면 감마 보정 없음)
def _temperature_to_lut_u8(
    temp_c: np.ndarray,
    display_min: float,
    display_max: float,
    gamma: float,
) -> np.ndarray:
    
    clipped = np.clip(temp_c, display_min, display_max)

    # 0~1로 정규화 
    norm01 = (clipped - display_min) / (display_max - display_min)

    # 거듭제곱을 이용한 감마 보정 > 색의 분포를 사람이 보기 좋게 조절하기 위해서 
    if gamma != 1.0:
        norm01 = np.power(norm01, gamma)

    # np.rint() : 가장 가까운 정수로 반올림 
    return np.clip(np.rint(norm01 * 255.0), 0, 255).astype(np.uint8)