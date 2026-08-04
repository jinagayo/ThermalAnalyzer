# electron 이 실행하는 시작 파일 
# 파이썬 프로그램의 출입구 

# Electron은 python 프로세스의 표준 출력인 stdout을 읽음 

from __future__ import annotations

import json   # 파이썬 딕셔너리를 JSON 문자열로 바꿀 때 사용 
import sys    # electron이 전달한 실행 옵션을 가져오기 위해 사용 
from pathlib import Path

from services.tmx_service import prepare_tmx 

# 결과를 직접 return 하는 대신 print() 를 통해 Electron에 전달 
def main() -> None : 
    # Electron이 TMX 파일 경로를 전달했는지 확인 

    if len(sys.argv) < 3 :
          raise ValueError(
               "TMX 파일 경로 또는 캐시 경로가 전달되지 않았습니다."
          )

    # Electron이 전달한 문자열 경로를 Path 객체로 반환 
    # sys.argv[0] : 실행된 python 파일 경로 
    file_path = Path(sys.argv[1])        
    cache_root = Path(sys.argv[2])

    # 실제 tmx 처리 함수 실행 
    result = prepare_tmx(file_path, cache_root)

    # 처리 결과를 JSON 문자열로 출력
    # Electron은 이 출력값을 받아서 사용
    print(
         json.dumps(
              result,
              ensure_ascii=False   # 한글이 이상한 유니코드 형태로 출력되는 것을 막음 
         )
    )


if __name__ == "__main__" :

    try:
         main()

    except Exception as error: 
        # python에서 오류가 발생하더라도
        # Electron이 읽을 수 있도록 JSON 형태로 출력 
        error_result = {
              "success" : False,
              "error" : str(error)
        }

        print(
              json.dumps(
                    error_result,
                    ensure_ascii=False
              )
        )

        # 오류 종료 상태를 Electron에 전달
        # 0 : 정상 종료
        # 1 이상 : 오류 종료 
        sys.exit(1)   