// Electron 영역과 React 영역 사이에 안전한 통로를 만드는 코드 
/**
 * contextBridge : preload 영역에 있는 기능을 React 영역에 안전하게 공개하는 도구 
 * ipcRenderer : React 화면 쪽 프로세스가 사용하는 통신 도구
 * * ipcMain : main 프로세스가 사용하는 통신 도구 (main.js)
 */
const { contextBridge, ipcRenderer } = require("electron");


// React가 사용하는 window 객체에 안전한 값을 추가
// "thermalApi" : window에 추가할 이름   (React에서 window.thermalApi로 접근 가능)
// selectTmxFile : react에 공개할 기능(함수)   (React에서 window.thermalApi.selectTmxFile 로 접근 가능)
contextBridge.exposeInMainWorld("thermalApi", {
    selectTmxFile : ()=> ipcRenderer.invoke("tmx:select-file")
}); 

