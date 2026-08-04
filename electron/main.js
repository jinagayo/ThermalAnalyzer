const {
    app,
    BrowserWindow,
    dialog,
    ipcMain
} = require("electron");

const path = require("path");
const { spawn } = require("child_process");

// Electron 창 생성 함수 
function createWindow(){
    const mainWindow = new BrowserWindow({
        width : 1200,
        height : 800,
        webPreferences : {
            preload : path.join(__dirname, "preload.js"),
            contextIsolation : true,                    // 보안 설정. React 코드와 preload 코드를 서로 분리해서 실행 >> React가 Electron 내부 객체에 직접 접근하지 못하도록함 
            nodeIntegration : false                    // React 화면에서 Node.js 기능을 직접 사용하는 것을 막음 
        },
    });

    // React 개발 서버 열기
    // Electron 창 안에 React 화면 불러오기  (개발 중에는 먼저 React 서버가 실행 중이어야 함)
    mainWindow.loadURL("http://localhost:5173");

}


// 운영체제에 맞는 python 실행 경로 반환 
function getPythonPath() {
    const projectRoot = path.join(
        __dirname,
        ".."
    );

    if (process.platform === "win32") {
        return path.join(
            projectRoot,
            "venv",
            "Scripts",
            "python.exe"
        );
    }

    return path.join(
        projectRoot,
        "venv",
        "bin",
        "python"
    );
}


// Python main.py 실행
function runPythonTmx(
    tmxPath,
    cacheRoot
) {
    return new Promise((resolve, reject) => {
        const pythonPath = getPythonPath();

        const pythonMainPath = path.join(
            __dirname,
            "..",
            "backend",
            "main.py"
        );

        const pythonProcess = spawn(
            pythonPath,
            [
                pythonMainPath,
                tmxPath,
                cacheRoot
            ],
            {
                cwd: path.join(
                    __dirname,
                    "..",
                    "backend"
                )
            }
        );

        let stdout = "";
        let stderr = "";

        // Python의 print() 결과
        pythonProcess.stdout.on(
            "data",
            (data) => {
                stdout += data.toString();
            }
        );

        // Python 오류 출력
        pythonProcess.stderr.on(
            "data",
            (data) => {
                stderr += data.toString();
            }
        );

        // Python 프로세스 실행 자체가 실패한 경우
        pythonProcess.on(
            "error",
            (error) => {
                reject(
                    new Error(
                        `Python 실행 실패: ${error.message}`
                    )
                );
            }
        );

        // Python 프로세스 종료
        pythonProcess.on(
            "close",
            (exitCode) => {
                let result;

                try {
                    result = JSON.parse(
                        stdout.trim()
                    );
                } catch (error) {
                    reject(
                        new Error(
                            `Python 결과를 JSON으로 변환할 수 없습니다.\n` +
                            `stdout: ${stdout}\n` +
                            `stderr: ${stderr}`
                        )
                    );

                    return;
                }

                if (
                    exitCode !== 0 ||
                    result.success === false
                ) {
                    reject(
                        new Error(
                            result.error ||
                            stderr ||
                            `Python 종료 코드: ${exitCode}`
                        )
                    );

                    return;
                }

                resolve(result);
            }
        );
    });
}



// 파일 선택 IPC 등록
// tmx:select-file 이라는 이름의 요청을 main.js가 처리하도록 등록 
ipcMain.handle("tmx:select-file", async () => {
    const result = await dialog.showOpenDialog({
        title: "TMX 파일 선택",
        properties: ["openFile"],
        filters: [
            {
                name: "TMX Files",
                extensions: ["tmx"]
            }
        ]
    });

    if (
        result.canceled ||
        result.filePaths.length === 0
    ) {
        return null;
    }

    const tmxPath = result.filePaths[0];

    const cacheRoot = path.join(
        app.getPath("userData"),
        "cache"
    );

    try {
        // 여기서 실제로 Python 실행
        const pythonResult = await runPythonTmx(
            tmxPath,
            cacheRoot
        );

        return {
            success: true,
            tmxPath,
            fileName: path.basename(tmxPath),
            cacheRoot,
            ...pythonResult
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
});

app.whenReady().then(() => {
    createWindow();

    // macOS에서 Dock 아이콘을 다시 눌렀을 때 창 생성
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});


app.on("window-all-closed", () => {
    // macOS가 아니라면 모든 창이 닫힐 때 앱 종료
    if (process.platform !== "darwin") {
        app.quit();
    }
});