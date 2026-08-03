# .COL 파일을 실제로 읽는 기능

from __future__ import annotations
from pathlib import Path
import numpy as np

LUT_DIRECTORY = Path(__file__).resolve().parent / "luts"

LUT_COLOR_COUNT = 256
RGB_CHANNEL_COUNT = 3
EXPECTED_COL_SIZE = LUT_COLOR_COUNT * RGB_CHANNEL_COUNT

def load_col_lut(file_name: str) -> np.ndarray:
    """
    COL 파일을 읽어 256x3 RGB LUT로 반환한다.

    반환 shape : (256, 3)
    반환 dtype : np.uint8
    """
    file_path = LUT_DIRECTORY / file_name 

    if not file_path.exists():
        raise FileNotFoundError(
            f"COL 파일을 찾을 수 없습니다: {file_path}"
        )

    if not file_path.is_file():
        raise ValueError(
            f"파일이 아닙니다: {file_path}"
        )

    if file_path.suffix.lower() != ".col":
        raise ValueError(
            f"COL 파일이 아닙니다: {file_path.name}"
        )

    raw = np.fromfile(
        file_path,
        dtype=np.uint8
    )


    if raw.size != EXPECTED_COL_SIZE:
        raise ValueError(
            f"COL 파일 크기가 잘못되었습니다: "
            f"{raw.size} / 예상 크기 {EXPECTED_COL_SIZE}"
        )

    return raw.reshape(
        LUT_COLOR_COUNT,
        RGB_CHANNEL_COUNT
    )
