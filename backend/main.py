# electron 이 실행하는 시작 파일 
# 파이썬 프로그램의 출입구 

# Electron -> Python
# stdin으로 한 줄짜리 JSON 명령 전달

# Python -> Electron
# stdout으로 패킷 전달

# 패킷 구조 : 
# 고정 16바이트 헤더 + payload 전송

# prepare 응답
# → Payload = JSON

# get_frame 응답
# → Payload = float32 바이너리

# get_lut 응답
# → Payload = uint8 바이너리

from __future__ import annotations

import json   # 파이썬 딕셔너리를 JSON 문자열로 바꿀 때 사용 
import struct
import sys    
from pathlib import Path
from typing import Any 

import numpy as np 

from services.tmx_service import (
    prepare_tmx,
    load_cached_frame
) 

# ===============================================================
# 통신 프로토콜 설정
# ===============================================================

MAGIC = b"TMX1"

HEADER_FORMAT = "<4sBBHII" 
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

# 응답 종류
MESSAGE_PREPARE = 1
MESSAGE_FRAME = 2
MESSAGE_LUT = 3
MESSAGE_ERROR = 4
MESSAGE_CLOSED = 5
MESSAGE_PONG = 6

# 처리 결과 
STATUS_OK = 0
STATUS_ERROR = 1

# 현재 준비된 tmx 파일
_current_file_path : Path | None = None
_current_cache_root : Path | None = None


# Electron에 패킷 하나 전송 
def send_packet(
        message_type : int,
        payload: bytes = b"",
        *,
        status : int = STATUS_OK,
        value : int = 0 
) -> None:

      header = struct.pack(
            HEADER_FORMAT,
            MAGIC,
            message_type,
            status,
            0,           # reserved
            value,
            len(payload)
      )

      output = sys.stdout.buffer
      output.write(header)

      if payload : 
            output.write(payload)

      output.flush()


# prepare 응답
# → Payload = JSON
def send_json_packet(
            message_type: int, 
            data : dict[str, Any],
            *,
            status: int = STATUS_OK,
            value: int = 0
) -> None :

      payload = json.dumps(
            data,
            ensure_ascii = False
      ).encode("utf-8")

      send_packet(
            message_type=message_type,
            payload=payload,
            status=status,
            value=value
      )

# 오류 전달
# -> Payload = JSOn
def send_error(error: Exception) -> None:
      send_json_packet(
            message_type=MESSAGE_ERROR,
            data = {
                  "error" : str(error)
            },
            status=STATUS_ERROR
      )


# tmx 캐시를 준비하고 현재 작업 파일로 등록 
def handle_prepare(
            command: dict[str, Any],
)-> None:

      global _current_file_path
      global _current_cache_root

      file_path_value = command.get("file_path")
      cache_root_value = command.get("cache_root")

      if not isinstance(file_path_value, str):
            raise ValueError(
                  "prepare 명령에는 file_path 문자열이 필요합니다."
            )

      if not isinstance(cache_root_value, str):
            raise ValueError(
                  "prepare 명령에는 cache_root 문자열이 필요합니다."
            )

      file_path = Path(file_path_value)
      cache_root = Path(cache_root_value)

      result = prepare_tmx(
            file_path = file_path,
            cache_root = cache_root
      )

      _current_file_path = file_path
      _current_cache_root = cache_root

      # prepare 결과는 필드가 다양하고 크기가 작으므로
      # payload에 JSON으로 전달
      send_json_packet(
            message_type = MESSAGE_PREPARE,
            data = result
      )


# 캐시에서 특정 프레임을 읽어 float32 바이너리 payload로 전달
def handle_get_frame(
            command: dict[str, Any]
)-> None : 

        if (
        _current_file_path is None
        or _current_cache_root is None
        ):
            raise RuntimeError(
                  "먼저 prepare 명령으로 TMX 파일을 준비해야 합니다."
            )

        frame_index = command.get("frame_index")

        if not isinstance(frame_index, int) :
              raise ValueError(
                    "get_frame 명령에는 정수 frame_index가 필요합니다."
              )

        frame = load_cached_frame(
              file_path = _current_file_path,
              cache_root = _current_cache_root,
              frame_index = frame_index
        )

        # little-endian float32, 연속 메모리 배열로 정리
        temperature = np.ascontiguousarray(
              frame,
              dtype = "<f4"
        )

        payload = temperature.tobytes(
              order="C"
        )

        # value 필드에 프레임 번호를 넣는다. 
        send_packet(
              message_type=MESSAGE_FRAME,
              payload=payload,
              value=frame_index
        )


# python 프로세스가 실행 중인지 확인
def handle_ping() -> None:

      send_packet(
            message_type=MESSAGE_PONG
      )


# JSON Lines 요청 하나를 처리한다. 
# True : 다음 명령을 계속 기다림
# False : Python 프로세스 종료
def handle_command(
            command : dict[str, Any]
) -> bool : 

      command_name = command.get("command")

      if command_name == "prepare" :
            handle_prepare(command)
            return True

      if command_name == "get_frame" : 
            handle_get_frame(command)
            return True

      if command_name == "ping" : 
            handle_ping()
            return True

      if command_name == "close" :
            send_packet(
                  message_type=MESSAGE_CLOSED
            )
            return False

      raise ValueError(
            f"지원하지 않는 명령입니다: {command_name}"
      )


# Electron이 보내는 JSON Lines 요청을 계속 읽는다. 
def main() -> None:

      for input_line in sys.stdin:
            line = input_line.strip()

            if not line : 
                  continue

            try : 
                  command = json.loads(line)

                  if not isinstance(command, dict) :
                        raise ValueError(
                              "요청은 JSON 객체여야 합니다."
                        )

                  should_continue = handle_command(command)

                  if not should_continue :
                        break

            except Exception as error :
                  send_error(error)


if __name__ == "__main__" :
      main()

            

