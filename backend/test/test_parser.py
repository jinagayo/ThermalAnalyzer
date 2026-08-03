import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from pathlib import Path

from tmx.reader import TMXReader 

CURRENT_DIR = Path(__file__).resolve().parent
TMX_PATH = CURRENT_DIR / "PTP_N16_1PULSE_1.tmx"

# 파일 읽기와 헤더 분석은 여기서 한 번만 수행 
tmx = TMXReader(TMX_PATH)

print(f"크기: {tmx.width} x {tmx.height}")
print(f"전체 프레임 수 : {tmx.frame_count}")

# 첫 번째 프레임 준비 
first_frame = tmx.read_frame(0)

fig , ax = plt.subplots()

heatmap = ax.imshow(
    first_frame,
    cmap = "inferno",
    vmin = 20,
    vmax = 60
)

colorbar = plt.colorbar(
    heatmap,
    ax=ax,
    label="Temperature"
)

title = ax.set_title("Frame : 0 / {tmx.frame_count - 1}")


def update(frame_index: int) : 
    """ 현재 프레임의 온도 배열로 화면을 갱신한다."""

    temperature = tmx.read_frame(frame_index)

    # 이미지 객체를 새로 만들지 않고 기존 이미지의 데이터만 교체 
    heatmap.set_data(temperature)


    title.set_text(
        f"Frame: {frame_index} / {tmx.frame_count - 1}"
    )

    return heatmap, title 

animation = FuncAnimation(
    fig=fig,
    func=update,
    frames=range(tmx.frame_count),
    interval=100,
    repeat=True
)

plt.show()