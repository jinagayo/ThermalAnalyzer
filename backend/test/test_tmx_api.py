from pathlib import Path

from api.tmx_api import (
    get_tmx_info,
    get_frame_cache_path,
    load_cached_frame,
)


CURRENT_DIR = Path(__file__).resolve().parent
TMX_PATH = CURRENT_DIR / "HGW_01.tmx"


tmx_info = get_tmx_info(TMX_PATH)

print("TMX 파일 정보")
print(tmx_info)


frame_index = 0

cache_path = get_frame_cache_path(
    file_path=TMX_PATH,
    frame_index=frame_index,
)

print()
print("캐시 경로")
print(cache_path)


frame = load_cached_frame(
    file_path=TMX_PATH,
    frame_index=frame_index,
)

print()
print("프레임 정보")
print(f"배열 크기: {frame.shape}")
print(f"최저 온도: {frame.min():.2f} °C")
print(f"최고 온도: {frame.max():.2f} °C")
print(f"평균 온도: {frame.mean():.2f} °C")
print(f"캐시 생성 여부: {cache_path.exists()}")