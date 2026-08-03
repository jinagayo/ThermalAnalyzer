# analyze_frame()
# 프레임 통계
# ROI 분석
# 최고 온도 좌표 탐색
from .reader import read_temperature_frame
import numpy as np

def analyze_frame(
    data: bytes,
    frame_index: int,
) -> dict:
    """특정 프레임의 온도 데이터와 통계값을 반환한다."""

    temperature = read_temperature_frame(
        data=data,
        frame_index=frame_index,
    )

    return {
        "frame_index": frame_index,
        "height": temperature.shape[0],
        "width": temperature.shape[1],
        "min_temperature": float(np.min(temperature)),
        "max_temperature": float(np.max(temperature)),
        "mean_temperature": float(np.mean(temperature)),
        "temperature": temperature,
    }