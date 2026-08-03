# 1. parse_tmx_header()
# 2. read_frame_u16_be()
# 3. convert_to_celsius()
from __future__ import annotations  # 파이썬의 타입 표시 기능을 좀 더 편리하게 사용하기 위한 설정 
import struct  # 바이너리 데이터를 숫자로 변환하는 파이썬 기본 라이브러리 
import numpy as np 
import mmap

# tmx 파일 앞부분의 헤더 크기를 저장해 놓은 값 (16진수)
TMX_HEADER_SIZE = 0xC00   # 3072
FRAME_META_SIZE = 8      # 프레임 사이 메타데이터 크기


def parse_tmx_header(data: bytes) -> dict:
    """TMX 헤더 바이트에서 기본 정보를 읽어 반환한다."""

    if len(data) < TMX_HEADER_SIZE:
        raise ValueError(
            f"TMX 헤더가 부족합니다: {len(data)} / {TMX_HEADER_SIZE} bytes"
        )

    header_info = {}

    header_info["date"] = (
        data[0x00:0x10]
        .decode("ascii", errors="ignore")
        .rstrip("\x00")
    )

    time_text = (
        data[0x10:0x30]
        .decode("ascii", errors="ignore")
        .strip("\x00")
    )

    header_info["time"] = time_text.replace("/", ":")

    header_info["frame_count"] = struct.unpack(
        "<H",
        data[0x3C:0x3E],
    )[0]

    header_info["camera_model"] = (
        data[0x78:0x88]
        .decode("ascii", errors="ignore")
        .rstrip("\x00")
    )

    header_info["signature"] = (
        data[0x3EA:0x3FA]
        .decode("ascii", errors="ignore")
        .rstrip("\x00")
    )

    header_info["width"] = (
        struct.unpack(">H", data[0x3FE:0x400])[0] + 1
    )

    header_info["height"] = (
        struct.unpack(">H", data[0x400:0x402])[0] + 1
    )

    header_info["serial"] = (
        data[0x446:0x456]
        .decode("ascii", errors="ignore")
        .rstrip("\x00")
    )

    return header_info


def read_frame_u16_be(
    data: bytes | mmap.mmap,
    frame_index: int,
    width: int,
    height: int,
    meta_size: int = FRAME_META_SIZE,
) -> tuple[np.ndarray, np.ndarray]:
    """TMX에서 특정 프레임을 읽고 raw14와 flag2로 분리한다."""

    if frame_index < 0:
        raise ValueError("frame_index는 0 이상이어야 합니다.")

    if width <= 0 or height <= 0:
        raise ValueError(
            f"잘못된 프레임 크기입니다: width={width}, height={height}"
        )

    bytes_per_pixel = 2

    frame_bytes = width * height * bytes_per_pixel
    stride = frame_bytes + meta_size

    offset = TMX_HEADER_SIZE + frame_index * stride
    frame_end = offset + frame_bytes

    if frame_end > len(data):
        avaliable_bytes = max(0, len(data)-offset)

        raise ValueError(
            f"프레임 버퍼가 부족합니다: "
            f"{avaliable_bytes} / {frame_bytes} bytes"
        )

    # bytes로 복사하지 않고 원본 mmap의 해당 영역을 바라본다. 
    frame_view = memoryview(data)[offset:frame_end]

    u16 = np.frombuffer(
        frame_view,
        dtype=">u2",
    ).reshape(height, width)

    raw14 = u16 & 0x3FFF
    flag2 = (u16 >> 14) & 0x03

    return raw14, flag2


def convert_to_celsius(
    raw14: np.ndarray,
    flag2: np.ndarray,
) -> np.ndarray:
    """한 프레임의 raw14와 flag2를 섭씨 온도로 변환한다."""

    if raw14.shape != flag2.shape:
        raise ValueError(
            f"raw14와 flag2의 크기가 다릅니다: "
            f"{raw14.shape} != {flag2.shape}"
        )

    gain_map = np.array(
        [
            0.01098631578947,
            0.0109863281351,
            0.0109863281351,
            0.0109863281351,
        ],
        dtype=np.float32,
    )

    offset_map = np.array(
        [
            40.00000315789,
            -140.000000121,
            -140.000000121,
            -140.000000121,
        ],
        dtype=np.float32,
    )

    gain = gain_map[flag2]
    offset = offset_map[flag2]

    temperature = raw14.astype(np.float32) * gain + offset

    return temperature