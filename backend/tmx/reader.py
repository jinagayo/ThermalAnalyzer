from __future__ import annotations

import mmap  # memory map > 파일을 메모리처럼 접근할 수 있게 해주는 기능 
from pathlib import Path
from types import TracebackType 

import numpy as np
from .parser import parse_tmx_header, read_frame_u16_be, convert_to_celsius

class TMXReader :
    """TMX 파일을 mmap으로 열고, 헤더는 한 번만 분석하며 필요한 프레임만 읽는다."""

    def __init__(self, file_path: str | Path):
        self.file_path = Path(file_path)

        if not self.file_path.exists():
            raise FileNotFoundError(
                f"TMX 파일을 찾을 수 없습니다: {self.file_path}"
            )

        if self.file_path.suffix.lower() != ".tmx":
            raise ValueError(
                f"TMX 파일이 아닙니다: {self.file_path.name}"
            )

        # 파일 객체를 바이너리 읽기 모드로 연다.
        # rb : read, binary
        self._file = self.file_path.open("rb")

        try:
            # tmx 파일 전체를 메모리에 복사하지 않고 가상 메모리에 연결한다. 
            self._mmap = mmap.mmap(
                self._file.fileno(),  # 열려 있는 파일의 운영체제용 식별 번호를 가져옴 
                length=0,            # 파일 전체를 mmap 대상으로 지정함 
                access=mmap.ACCESS_READ      # 읽기 전용으로 연다. (tmx 파일 수정 X)
            )

            # 헤더는 프로그램 시작 시 한 번만 분석한다. 
            # self._mmap은 bytes처럼 인덱싱하거나 슬라이싱 가능 
            self.header = parse_tmx_header(self._mmap)

            self.width = self.header["width"]
            self.height = self.header["height"]
            self.frame_count = self.header["frame_count"]

        except Exception:
            if hasattr(self, "mmap"):
                self._mmap.close()

            self._file.close()
            raise

    def read_frame(self, frame_index : int) -> np.ndarray:
        """특정 프레임을 섭씨 온도 배열로 변환한다."""

        self._validate_frame_index(frame_index)

        raw14, flag2 = read_frame_u16_be(
            data=self._mmap,
            frame_index=frame_index,
            width=self.width,
            height=self.height
        )

        temperature = convert_to_celsius(
            raw14 = raw14,
            flag2 = flag2
        )

        return temperature

    def _validate_frame_index(self, frame_index: int) -> None:
        """프레임 번호가 올바른 범위인지 검사한다."""

        if not isinstance(frame_index, int):
            raise TypeError(
                f"frame_index는 정수여야 합니다: {type(frame_index).__name__}"
            )

        if frame_index < 0 :
            raise IndexError(
                f"frame_index는 0 이상이어야 합니다: {frame_index}"
            )

        if frame_index >= self.frame_count :
            raise IndexError(
                f"프레임 범위를 벗어났습니다: "
                f"{frame_index} / 최대 {self.frame_count -1}"
            )

    def close(self) -> None:
        """mmap과 파일 객체를 닫는다."""
        if hasattr(self, "_mmap") and not self._mmap.closed:
            self._mmap.close()

        if hasattr(self, "_file") and not self._file.closed:
            self._file.close()

    # with 문이 시작될 때 자동 호출됨
    # with : 파일처럼 사용 후 반드시 닫아야 하는 자원을 자동으로 정리해주는 문법
    def __enter__(self) -> TMXReader:
        """with 문에서 사용할 수 있도록 한다."""
        return self


    # with 문 종료
    def __exit__(
            self,
            exc_type: type[BaseException] | None,
            exc_value: BaseException | None,
            traceback: TracebackType | None
    ) -> None:
        self.close()
    

