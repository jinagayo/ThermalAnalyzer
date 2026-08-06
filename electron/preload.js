// Electron 영역과 React 영역 사이에 안전한 통로를 만드는 코드 
/**
 * contextBridge : preload 영역에 있는 기능을 React 영역에 안전하게 공개하는 도구 
 * ipcRenderer : preload.js 내부에서 사용하는 통신 도구 (react에는 필요한 함수만 공개하는 구조)
 * * ipcMain : main 프로세스가 사용하는 통신 도구 (main.js)
 */
const { contextBridge, ipcRenderer } = require("electron");


// React가 사용하는 window 객체에 안전한 값을 추가
// "thermalApi" : window에 추가할 이름   (React에서 window.thermalApi로 접근 가능)
// selectTmxFile : react에 공개할 기능(함수)   (React에서 window.thermalApi.selectTmxFile 로 접근 가능)
contextBridge.exposeInMainWorld(
      "thermalApi",
    {
        // TMX 파일 선택 후 Python에서 준비
        selectTmxFile: () =>
            ipcRenderer.invoke(
                "tmx:select-file"
            ),

        // 특정 프레임의 온도 데이터 요청
        getFrame: (frameIndex) =>
            ipcRenderer.invoke(
                "tmx:get-frame",
                frameIndex
            ),

        // Electron과 Python 연결 확인
        ping: () =>
            ipcRenderer.invoke(
                "tmx:ping"
            ),
    }
); 

