"""
파일 열기 
-> 첫 프레임 렌더링
-> 애니메이션 실행
-> 종료 

run_player.py -> TMXReader로 직접 재생한다.

"""

from pathlib import Path

import matplotlib.pyplot as plt 
import numpy as np
from matplotlib.animation import FuncAnimation

from tmx.reader import TMXReader
from visualization.renderer import frame_to_image



# 테스트 설정
CURRENT_DIR = Path(__file__).resolve().parent
TMX_PATH = CURRENT_DIR / "HGW_01.tmx"

COLORMAP = "iris"

# 모든 프레임에 같은 온도 범위를 적용한다. 
DISPLAY_MIN = 20.0
DISPLAY_MAX = 60.0

# 프레임 재생 간격 : 30ms = 초당 약 30프레임
INTERVAL_MS = 30



#--------------------
# tmx 파일 열기
#--------------------

tmx = TMXReader(TMX_PATH)

print(f"파일: {TMX_PATH.name}")
print(f"크기: {tmx.width} x {tmx.height}")
print(f"전체 프레임 수: {tmx.frame_count}")


#------------------------
# 첫 번째 프레임 렌더링
#------------------------

first_temperature = tmx.read_frame(0)

first_image, first_info = frame_to_image(
    temp_c = first_temperature,
    colormap=COLORMAP,
    gamma=1.0,
    global_display_min = DISPLAY_MIN,
    global_display_max = DISPLAY_MAX
)

# PIL Image를 matplotlib 에서 사용할 Numpy RGB 배열로 변환
first_rgb = np.asarray(first_image)


# --------------------------------------------------
# matplotlib 화면 준비
# --------------------------------------------------

fig, ax = plt.subplots()

# 이미 renderer에서 RGB 컬러 이미지가 완성됐으므로
# cmap, vmin, vmax를 지정하지 않는다.
heatmap = ax.imshow(first_rgb)

title = ax.set_title(
    f"Frame: 0 / {tmx.frame_count - 1}"
)

info_text = ax.text(
    0.01,
    0.01,
    (
        f"Min: {first_info['c_min']:.2f} °C\n"
        f"Max: {first_info['c_max']:.2f} °C"
    ),
    transform=ax.transAxes,
    color="white",
    verticalalignment="bottom",
    bbox={
        "facecolor": "black",
        "alpha": 0.6,
        "pad": 4,
    },
)

ax.set_xlabel("X pixel")
ax.set_ylabel("Y pixel")


# --------------------------------------------------
# 프레임 갱신 함수
# --------------------------------------------------

def update(frame_index: int):
    """현재 프레임을 RGB 히트맵 이미지로 변환해 화면을 갱신한다."""

    temperature = tmx.read_frame(frame_index)

    image, info = frame_to_image(
        temp_c=temperature,
        colormap=COLORMAP,
        gamma=1.0,
        global_display_min=DISPLAY_MIN,
        global_display_max=DISPLAY_MAX,
    )

    rgb = np.asarray(image)

    # 기존 matplotlib 이미지 객체의 데이터만 교체한다.
    heatmap.set_data(rgb)

    title.set_text(
        f"Frame: {frame_index} / {tmx.frame_count - 1}"
    )

    info_text.set_text(
        f"Min: {info['c_min']:.2f} °C\n"
        f"Max: {info['c_max']:.2f} °C"
    )

    return heatmap, title, info_text


# --------------------------------------------------
# 애니메이션 실행
# --------------------------------------------------

animation = FuncAnimation(
    fig=fig,
    func=update,
    frames=range(tmx.frame_count),
    interval=INTERVAL_MS,
    repeat=True,
    blit=False,
)

plt.tight_layout()
plt.show()

# matplotlib 창을 닫은 뒤 TMX 파일도 닫는다.
tmx.close()