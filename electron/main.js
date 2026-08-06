const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
} = require("electron");

const path = require("path");
const { spawn } = require("child_process");


let pythonProcess = null;

// Python stdout에서 받은 바이너리 데이터를 임시 저장
let pythonReceiveBuffer = Buffer.alloc(0);

// 현재 Python 응답을 기다리는 요청
// 현재는 request_id가 없으므로 동시에 하나의 요청만 처리
let pendingRequest = null;

// 앱 종료 처리가 이미 시작됐는지 확인
let isQuitting = false;


// ============================================================
// Python 바이너리 응답 프로토콜
// ============================================================

const HEADER_SIZE = 16;
const MAGIC = "TMX1";

const MESSAGE_PREPARE = 1;
const MESSAGE_FRAME = 2;
const MESSAGE_LUT = 3;
const MESSAGE_ERROR = 4;
const MESSAGE_CLOSED = 5;
const MESSAGE_PONG = 6;

const STATUS_OK = 0;

// 비정상적으로 큰 payload를 차단하기 위한 최대 크기
const MAX_PAYLOAD_SIZE = 100 * 1024 * 1024;


// ============================================================
// Electron 창
// ============================================================

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,

        webPreferences: {
            preload: path.join(
                __dirname,
                "preload.js"
            ),

            // React와 preload 실행 환경 분리
            contextIsolation: true,

            // React에서 Node.js 기능 직접 사용 차단
            nodeIntegration: false,
        },
    });

    // React 개발 서버
    mainWindow.loadURL(
        "http://localhost:5173"
    );
}


// ============================================================
// Python 실행 경로
// ============================================================

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

// TMX 캐시 파일을 저장할 기본 폴더
function getCacheRoot() {
    return path.join(
        app.getPath("userData"),
        "tmx-cache"
    );
}


// ============================================================
// Python 프로세스 실행
// ============================================================

function startPythonProcess() {
    // 이미 정상 실행 중이면 다시 실행하지 않음
    if (
        pythonProcess &&
        pythonProcess.exitCode === null &&
        !pythonProcess.killed
    ) {
        return;
    }

    const pythonPath = getPythonPath();

    const pythonMainPath = path.join(
        __dirname,
        "..",
        "backend",
        "main.py"
    );

    const backendPath = path.join(
        __dirname,
        "..",
        "backend"
    );

    pythonProcess = spawn(
        pythonPath,
        [pythonMainPath],
        {
            cwd: backendPath,

            stdio: [
                "pipe", // Electron → Python stdin
                "pipe", // Python → Electron stdout
                "pipe", // Python 로그와 오류 stderr
            ],

            // Windows에서 별도 콘솔 창을 띄우지 않음
            windowsHide: true,
        }
    );

    // Python stdout 데이터 수신
    pythonProcess.stdout.on(
        "data",
        (chunk) => {
            pythonReceiveBuffer = Buffer.concat([
                pythonReceiveBuffer,
                chunk,
            ]);

            parsePythonPackets();
        }
    );

    // Python 로그 및 오류 출력
    pythonProcess.stderr.on(
        "data",
        (chunk) => {
            console.error(
                "[Python]",
                chunk.toString("utf8")
            );
        }
    );

    // Python 실행 자체가 실패한 경우
    pythonProcess.on(
        "error",
        (error) => {
            console.error(
                "Python 프로세스 실행 실패:",
                error
            );

            rejectPendingRequest(error);
        }
    );

    // Python 프로세스가 종료된 경우
    pythonProcess.on(
        "close",
        (exitCode, signal) => {
            console.log(
                `Python 프로세스 종료: ` +
                `exitCode=${exitCode}, signal=${signal}`
            );

            pythonProcess = null;
            pythonReceiveBuffer = Buffer.alloc(0);

            rejectPendingRequest(
                new Error(
                    `Python 프로세스가 종료되었습니다. ` +
                    `exitCode=${exitCode}`
                )
            );
        }
    );
}


// ============================================================
// Python 명령 전송
// ============================================================

function sendPythonCommand(command) {
    if (!pythonProcess) {
        throw new Error(
            "Python 프로세스가 실행되지 않았습니다."
        );
    }

    if (
        pythonProcess.exitCode !== null ||
        pythonProcess.killed
    ) {
        throw new Error(
            "Python 프로세스가 이미 종료되었습니다."
        );
    }

    if (!pythonProcess.stdin.writable) {
        throw new Error(
            "Python stdin에 명령을 보낼 수 없습니다."
        );
    }

    // Python에는 JSON Lines 형식으로 명령 전달
    const requestLine =
        JSON.stringify(command) + "\n";

    pythonProcess.stdin.write(
        requestLine,
        "utf8"
    );
}


// ============================================================
// Python 요청과 응답 연결
// ============================================================

function requestPython(
    command,
    expectedMessageType
) {
    return new Promise((resolve, reject) => {
        if (pendingRequest) {
            reject(
                new Error(
                    "이전 Python 요청이 아직 처리 중입니다."
                )
            );

            return;
        }

        pendingRequest = {
            expectedMessageType,
            resolve,
            reject,
        };

        try {
            sendPythonCommand(command);
        } catch (error) {
            pendingRequest = null;
            reject(error);
        }
    });
}


// Python 오류 또는 프로세스 종료 시 대기 중 요청 거절
function rejectPendingRequest(error) {
    if (!pendingRequest) {
        return;
    }

    const { reject } = pendingRequest;

    pendingRequest = null;

    reject(error);
}


// ============================================================
// Python 바이너리 패킷 파싱
// ============================================================

function parsePythonPackets() {
    while (true) {
        // 헤더 16바이트가 아직 도착하지 않음
        if (
            pythonReceiveBuffer.length <
            HEADER_SIZE
        ) {
            return;
        }

        const magic = pythonReceiveBuffer
            .subarray(0, 4)
            .toString("ascii");

        if (magic !== MAGIC) {
            const error = new Error(
                `잘못된 Python 패킷입니다: ${magic}`
            );

            pythonReceiveBuffer =
                Buffer.alloc(0);

            rejectPendingRequest(error);
            return;
        }

        const messageType =
            pythonReceiveBuffer.readUInt8(4);

        const status =
            pythonReceiveBuffer.readUInt8(5);

        // 6~7바이트는 reserved 영역

        const value =
            pythonReceiveBuffer.readInt32LE(8);

        const payloadLength =
            pythonReceiveBuffer.readInt32LE(12);

        // 음수 또는 지나치게 큰 payload 방지
        if (
            payloadLength < 0 ||
            payloadLength > MAX_PAYLOAD_SIZE
        ) {
            const error = new Error(
                `잘못된 payload 크기입니다: ` +
                `${payloadLength}`
            );

            pythonReceiveBuffer =
                Buffer.alloc(0);

            rejectPendingRequest(error);
            return;
        }

        const packetLength =
            HEADER_SIZE + payloadLength;

        // payload 전체가 아직 도착하지 않음
        if (
            pythonReceiveBuffer.length <
            packetLength
        ) {
            return;
        }

        /*
         * subarray는 원래 Buffer 메모리를 참조한다.
         * 이후 receiveBuffer를 잘라내기 때문에
         * Buffer.from()으로 payload 복사본을 만든다.
         */
        const payload = Buffer.from(
            pythonReceiveBuffer.subarray(
                HEADER_SIZE,
                packetLength
            )
        );

        // 처리한 패킷을 수신 버퍼에서 제거
        pythonReceiveBuffer =
            pythonReceiveBuffer.subarray(
                packetLength
            );

        handlePythonPacket({
            messageType,
            status,
            value,
            payload,
        });
    }
}


// ============================================================
// Python 패킷 처리
// ============================================================

function handlePythonPacket({
    messageType,
    status,
    value,
    payload,
}) {
    // Python에서 명시적인 오류 패킷을 보낸 경우
    if (messageType === MESSAGE_ERROR) {
        let errorMessage =
            "Python 처리 중 오류가 발생했습니다.";

        try {
            const errorData = JSON.parse(
                payload.toString("utf8")
            );

            errorMessage =
                errorData.error ||
                errorMessage;
        } catch {
            // 오류 payload가 JSON이 아니면 기본 메시지 사용
        }

        rejectPendingRequest(
            new Error(errorMessage)
        );

        return;
    }

    // 상태값이 성공이 아닌 경우
    if (status !== STATUS_OK) {
        rejectPendingRequest(
            new Error(
                `Python 응답 상태 오류: ${status}`
            )
        );

        return;
    }

    // 기다리는 요청이 없는데 응답을 받은 경우
    if (!pendingRequest) {
        console.warn(
            "대기 중인 요청이 없는데 " +
            "Python 응답을 받았습니다.",
            {
                messageType,
                value,
                payloadLength: payload.length,
            }
        );

        return;
    }

    // 기다리던 응답 종류와 실제 응답 종류 비교
    if (
        pendingRequest.expectedMessageType !==
        messageType
    ) {
        const expected =
            pendingRequest.expectedMessageType;

        rejectPendingRequest(
            new Error(
                `예상하지 않은 응답입니다. ` +
                `expected=${expected}, ` +
                `actual=${messageType}`
            )
        );

        return;
    }

    const {
        resolve,
        reject,
    } = pendingRequest;

    pendingRequest = null;

    // TMX 준비 완료 응답
    if (messageType === MESSAGE_PREPARE) {
        try {
            const metadata = JSON.parse(
                payload.toString("utf8")
            );

            resolve(metadata);
        } catch {
            reject(
                new Error(
                    "Python metadata JSON을 " +
                    "해석하지 못했습니다."
                )
            );
        }

        return;
    }

    // 프레임 온도 배열 응답
    if (messageType === MESSAGE_FRAME) {
        resolve({
            frameIndex: value,
            data: payload,
        });

        return;
    }

    // 컬러맵 LUT 응답
    if (messageType === MESSAGE_LUT) {
        resolve({
            lutIndex: value,
            data: payload,
        });

        return;
    }

    // Python 연결 확인 응답
    if (messageType === MESSAGE_PONG) {
        resolve({
            pong: true,
        });

        return;
    }

    // Python 정상 종료 응답
    if (messageType === MESSAGE_CLOSED) {
        resolve({
            closed: true,
        });

        return;
    }

    // 정의되지 않은 일반 응답
    resolve({
        messageType,
        value,
        data: payload,
    });
}


// ============================================================
// Electron IPC
// ============================================================

// TMX 파일 선택 및 준비
ipcMain.handle(
    "tmx:select-file",
    async () => {
        const window =
            BrowserWindow.getFocusedWindow();

        const dialogResult =
            await dialog.showOpenDialog(
                window ?? undefined,
                {
                    title: "TMX 파일 선택",

                    properties: [
                        "openFile",
                    ],

                    filters: [
                        {
                            name: "TMX Files",
                            extensions: ["tmx"],
                        },
                    ],
                }
            );

        if (
            dialogResult.canceled ||
            dialogResult.filePaths.length === 0
        ) {
            return {
                success: false,
                canceled: true,
            };
        }

        const filePath =
            dialogResult.filePaths[0];

        // 운영체제별 앱 데이터 폴더 내부의 캐시 경로
        const cacheRoot =
            getCacheRoot();

        try {
            const metadata =
                await requestPython(
                    {
                        command: "prepare",
                        file_path: filePath,
                        cache_root: cacheRoot,
                    },
                    MESSAGE_PREPARE
                );

            return {
                success: true,
                canceled: false,
                filePath,
                cacheRoot,
                metadata,
            };
        } catch (error) {
            return {
                success: false,
                canceled: false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
    }
);


// 특정 프레임 요청
ipcMain.handle(
    "tmx:get-frame",
    async (_, frameIndex) => {
        if (
            !Number.isInteger(frameIndex) ||
            frameIndex < 0
        ) {
            return {
                success: false,
                error:
                    "frameIndex는 0 이상의 " +
                    "정수여야 합니다.",
            };
        }

        try {
            const frameResult =
                await requestPython(
                    {
                        command: "get_frame",
                        frame_index: frameIndex,
                    },
                    MESSAGE_FRAME
                );

            return {
                success: true,

                frameIndex:
                    frameResult.frameIndex,

                /*
                 * Electron IPC를 통해 React로 전달할 때
                 * Node.js Buffer보다 Uint8Array로 전달하는 편이
                 * 프론트엔드에서 처리하기 명확하다.
                 */
                data: new Uint8Array(
                    frameResult.data
                ),
            };
        } catch (error) {
            return {
                success: false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
    }
);


// Python 연결 확인
ipcMain.handle(
    "tmx:ping",
    async () => {
        try {
            const result =
                await requestPython(
                    {
                        command: "ping",
                    },
                    MESSAGE_PONG
                );

            return {
                success: true,
                ...result,
            };
        } catch (error) {
            return {
                success: false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
    }
);


// ============================================================
// Python 종료
// ============================================================

async function closePythonProcess() {
    if (!pythonProcess) {
        return;
    }

    const processToClose = pythonProcess;

    try {
        if (
            processToClose.stdin.writable &&
            !pendingRequest
        ) {
            await requestPython(
                {
                    command: "close",
                },
                MESSAGE_CLOSED
            );
        }
    } catch (error) {
        console.error(
            "Python 정상 종료 요청 실패:",
            error
        );
    } finally {
        /*
         * Python이 close 응답 후 스스로 종료하지 않았을 경우
         * Electron에서 프로세스를 종료한다.
         */
        if (
            processToClose.exitCode === null &&
            !processToClose.killed
        ) {
            processToClose.kill();
        }
    }
}


// ============================================================
// Electron 앱 생명주기
// ============================================================

app.whenReady().then(() => {
    startPythonProcess();
    createWindow();

    app.on("activate", () => {
        if (
            BrowserWindow
                .getAllWindows()
                .length === 0
        ) {
            createWindow();
        }
    });
});


app.on(
    "window-all-closed",
    () => {
        // macOS는 일반적으로 창을 닫아도 앱을 유지
        if (process.platform !== "darwin") {
            app.quit();
        }
    }
);


app.on(
    "before-quit",
    async (event) => {
        if (isQuitting) {
            return;
        }

        isQuitting = true;

        /*
         * Python 종료가 완료되기 전에 Electron이
         * 먼저 종료되는 것을 막는다.
         */
        event.preventDefault();

        await closePythonProcess();

        app.quit();
    }
);