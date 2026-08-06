import {
  useEffect,
  useRef,
  useState,
} from "react";

import HeatmapCanvas from "./components/HeatmapCanvas";


function convertToFloat32Array(data) {
  let byteArray;

  if (data instanceof Uint8Array) {
    byteArray = data;
  } else if (data instanceof ArrayBuffer) {
    byteArray = new Uint8Array(data);
  } else {
    byteArray = new Uint8Array(data);
  }

  if (
    byteArray.byteLength %
      Float32Array.BYTES_PER_ELEMENT !==
    0
  ) {
    throw new Error(
      `프레임 데이터 크기가 올바르지 않습니다: ` +
      `${byteArray.byteLength} bytes`
    );
  }

  /*
   * IPC를 통해 전달된 Uint8Array의 byteOffset을 고려해
   * 정확한 영역만 별도 ArrayBuffer로 복사한다.
   */
  const copiedBuffer =
    byteArray.buffer.slice(
      byteArray.byteOffset,
      byteArray.byteOffset +
        byteArray.byteLength
    );

  return new Float32Array(
    copiedBuffer
  );
}


function findTemperatureRange(frameData) {
  let minimum = Infinity;
  let maximum = -Infinity;

  for (
    let index = 0;
    index < frameData.length;
    index += 1
  ) {
    const value = frameData[index];

    if (!Number.isFinite(value)) {
      continue;
    }

    if (value < minimum) {
      minimum = value;
    }

    if (value > maximum) {
      maximum = value;
    }
  }

  if (
    minimum === Infinity ||
    maximum === -Infinity
  ) {
    return {
      minimum: 0,
      maximum: 1,
    };
  }

  if (minimum === maximum) {
    return {
      minimum,
      maximum: minimum + 0.01,
    };
  }

  return {
    minimum,
    maximum,
  };
}


function App() {
  const [selectedFile, setSelectedFile] =
    useState(null);

  const [frameData, setFrameData] =
    useState(null);

  const [
    currentFrameIndex,
    setCurrentFrameIndex,
  ] = useState(0);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    hoveredPixel,
    setHoveredPixel,
  ] = useState(null);

  const [playbackFps, setPlaybackFps] =
    useState(15);

  const [
    displayMinimum,
    setDisplayMinimum,
  ] = useState(0);

  const [
    displayMaximum,
    setDisplayMaximum,
  ] = useState(1);

  /*
   * 비동기 재생 반복문에서 최신 값을 참조하기 위한 ref.
   */
  const isPlayingRef = useRef(false);
  const playbackTokenRef = useRef(0);
  const currentFrameIndexRef = useRef(0);
  const playbackFpsRef = useRef(15);

  const metadata =
    selectedFile?.metadata ?? null;

  const frameCount =
    metadata?.frame_count ?? 0;

  const width =
    metadata?.width ?? 0;

  const height =
    metadata?.height ?? 0;


  useEffect(() => {
    playbackFpsRef.current = playbackFps;
  }, [playbackFps]);


  useEffect(() => {
    currentFrameIndexRef.current =
      currentFrameIndex;
  }, [currentFrameIndex]);


  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      playbackTokenRef.current += 1;
    };
  }, []);


  async function requestFrame(frameIndex) {
    const result =
      await window.thermalApi.getFrame(
        frameIndex
      );

    if (!result) {
      throw new Error(
        "프레임 응답을 받지 못했습니다."
      );
    }

    if (!result.success) {
      throw new Error(
        result.error ||
          "프레임을 불러오지 못했습니다."
      );
    }

    const temperatureArray =
      convertToFloat32Array(result.data);

    const expectedLength =
      width * height;

    /*
     * 파일 선택 직후에는 React state 반영 전일 수 있으므로
     * metadata 값도 함께 확인한다.
     */
    const expectedFrameLength =
      expectedLength ||
      (
        selectedFile?.metadata?.width *
        selectedFile?.metadata?.height
      );

    if (
      expectedFrameLength &&
      temperatureArray.length !==
        expectedFrameLength
    ) {
      throw new Error(
        `프레임 온도 데이터 개수가 올바르지 않습니다. ` +
        `${temperatureArray.length} / ` +
        `${expectedFrameLength}`
      );
    }

    setFrameData(temperatureArray);

    setCurrentFrameIndex(
      result.frameIndex
    );

    currentFrameIndexRef.current =
      result.frameIndex;

    return temperatureArray;
  }


  function stopPlayback() {
    isPlayingRef.current = false;
    playbackTokenRef.current += 1;
    setIsPlaying(false);
  }


  async function handleSelectTmx() {
    stopPlayback();

    try {
      setIsLoading(true);
      setErrorMessage("");
      setSelectedFile(null);
      setFrameData(null);
      setHoveredPixel(null);
      setCurrentFrameIndex(0);

      const result =
        await window.thermalApi.selectTmxFile();

      if (!result) {
        throw new Error(
          "Electron으로부터 응답을 받지 못했습니다."
        );
      }

      if (result.canceled) {
        return;
      }

      if (!result.success) {
        throw new Error(
          result.error ||
            "TMX 파일을 준비하지 못했습니다."
        );
      }

      setSelectedFile(result);

      const firstFrameResult =
        await window.thermalApi.getFrame(0);

      if (!firstFrameResult) {
        throw new Error(
          "첫 번째 프레임 응답을 받지 못했습니다."
        );
      }

      if (!firstFrameResult.success) {
        throw new Error(
          firstFrameResult.error ||
            "첫 번째 프레임을 불러오지 못했습니다."
        );
      }

      const temperatureArray =
        convertToFloat32Array(
          firstFrameResult.data
        );

      const expectedLength =
        result.metadata.width *
        result.metadata.height;

      if (
        temperatureArray.length !==
        expectedLength
      ) {
        throw new Error(
          `프레임 온도 데이터 개수가 올바르지 않습니다. ` +
          `${temperatureArray.length} / ` +
          `${expectedLength}`
        );
      }

      setFrameData(temperatureArray);
      setCurrentFrameIndex(0);
      currentFrameIndexRef.current = 0;

      /*
       * metadata에 전체 온도 범위가 있다면 해당 값을 사용한다.
       * 없으면 첫 프레임에서 임시 범위를 계산한다.
       */
      const frameRange =
        findTemperatureRange(
          temperatureArray
        );

      const minimum =
        result.metadata.min_temperature ??
        result.metadata.global_min_temperature ??
        frameRange.minimum;

      const maximum =
        result.metadata.max_temperature ??
        result.metadata.global_max_temperature ??
        frameRange.maximum;

      setDisplayMinimum(minimum);
      setDisplayMaximum(maximum);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "TMX 파일 처리 중 오류가 발생했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }


  async function handlePlay() {
    if (
      !selectedFile ||
      !frameCount ||
      isPlayingRef.current
    ) {
      return;
    }

    setErrorMessage("");
    setIsPlaying(true);
    isPlayingRef.current = true;

    const playbackToken =
      playbackTokenRef.current + 1;

    playbackTokenRef.current =
      playbackToken;

    let nextFrameIndex =
      currentFrameIndexRef.current;

    /*
     * 마지막 프레임에서 재생을 누르면
     * 첫 번째 프레임부터 다시 시작한다.
     */
    if (
      nextFrameIndex >=
      frameCount - 1
    ) {
      nextFrameIndex = 0;
    } else {
      nextFrameIndex += 1;
    }

    try {
      while (
        isPlayingRef.current &&
        playbackTokenRef.current ===
          playbackToken
      ) {
        const frameStartTime =
          performance.now();

        await requestFrame(
          nextFrameIndex
        );

        if (
          !isPlayingRef.current ||
          playbackTokenRef.current !==
            playbackToken
        ) {
          break;
        }

        nextFrameIndex += 1;

        if (
          nextFrameIndex >= frameCount
        ) {
          /*
           * 전체 영상 반복 재생.
           * 한 번만 재생하려면 여기에서 stopPlayback()을 호출한다.
           */
          nextFrameIndex = 0;
        }

        const targetFrameDuration =
          1000 /
          playbackFpsRef.current;

        const elapsed =
          performance.now() -
          frameStartTime;

        const remainingDelay =
          Math.max(
            0,
            targetFrameDuration -
              elapsed
          );

        if (remainingDelay > 0) {
          await new Promise((resolve) => {
            window.setTimeout(
              resolve,
              remainingDelay
            );
          });
        }
      }
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "프레임 재생 중 오류가 발생했습니다."
      );
    } finally {
      if (
        playbackTokenRef.current ===
        playbackToken
      ) {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    }
  }


  async function handleFrameChange(event) {
    const frameIndex =
      Number(event.target.value);

    stopPlayback();

    try {
      setErrorMessage("");
      setIsLoading(true);

      await requestFrame(frameIndex);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "프레임을 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }


  return (
    <main
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px",
      }}
    >
      <h1>Thermal Analyzer</h1>

      <button
        type="button"
        onClick={handleSelectTmx}
        disabled={isLoading}
      >
        {isLoading && !selectedFile
          ? "TMX 파일 준비 중..."
          : "TMX 파일 선택"}
      </button>

      {metadata && (
        <section>
          <h2>TMX 파일 정보</h2>

          <p>
            파일 이름:{" "}
            {metadata.file_name ??
              selectedFile.filePath
                ?.split(/[\\/]/)
                .pop()}
          </p>

          <p>
            영상 크기: {width} × {height}
          </p>

          <p>
            전체 프레임 수: {frameCount}
          </p>

          <p>
            현재 프레임:{" "}
            {currentFrameIndex} /{" "}
            {frameCount - 1}
          </p>
        </section>
      )}

      {frameData && metadata && (
        <section>
          <h2>열화상 영상</h2>

          <HeatmapCanvas
            frameData={frameData}
            width={width}
            height={height}
            minTemperature={
              displayMinimum
            }
            maxTemperature={
              displayMaximum
            }
            onTemperatureHover={
              setHoveredPixel
            }
          />

          <div
            style={{
              marginTop: "12px",
              minHeight: "24px",
            }}
          >
            {hoveredPixel ? (
              <span>
                좌표: ({hoveredPixel.x},{" "}
                {hoveredPixel.y}) / 온도:{" "}
                {hoveredPixel.temperature.toFixed(
                  2
                )}
                °C
              </span>
            ) : (
              <span>
                히트맵 위에 마우스를 올리면
                픽셀 온도가 표시됩니다.
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "16px",
            }}
          >
            <button
              type="button"
              onClick={handlePlay}
              disabled={
                isPlaying ||
                isLoading
              }
            >
              재생
            </button>

            <button
              type="button"
              onClick={stopPlayback}
              disabled={!isPlaying}
            >
              일시정지
            </button>
          </div>

          <div
            style={{
              marginTop: "16px",
            }}
          >
            <label htmlFor="frame-slider">
              프레임 선택
            </label>

            <input
              id="frame-slider"
              type="range"
              min="0"
              max={Math.max(
                0,
                frameCount - 1
              )}
              value={currentFrameIndex}
              onChange={handleFrameChange}
              disabled={
                isLoading ||
                isPlaying
              }
              style={{
                display: "block",
                width: "100%",
              }}
            />
          </div>

          <div
            style={{
              marginTop: "16px",
            }}
          >
            <label htmlFor="fps-select">
              재생 속도
            </label>

            <select
              id="fps-select"
              value={playbackFps}
              onChange={(event) => {
                setPlaybackFps(
                  Number(
                    event.target.value
                  )
                );
              }}
              style={{
                marginLeft: "8px",
              }}
            >
              <option value="5">
                5 FPS
              </option>

              <option value="10">
                10 FPS
              </option>

              <option value="15">
                15 FPS
              </option>

              <option value="20">
                20 FPS
              </option>

              <option value="30">
                30 FPS
              </option>
            </select>
          </div>

          <div
            style={{
              marginTop: "16px",
            }}
          >
            <label>
              표시 최저 온도
              <input
                type="number"
                step="0.1"
                value={displayMinimum}
                onChange={(event) => {
                  setDisplayMinimum(
                    Number(
                      event.target.value
                    )
                  );
                }}
                style={{
                  marginLeft: "8px",
                }}
              />
            </label>

            <label
              style={{
                marginLeft: "16px",
              }}
            >
              표시 최고 온도
              <input
                type="number"
                step="0.1"
                value={displayMaximum}
                onChange={(event) => {
                  setDisplayMaximum(
                    Number(
                      event.target.value
                    )
                  );
                }}
                style={{
                  marginLeft: "8px",
                }}
              />
            </label>
          </div>
        </section>
      )}

      {errorMessage && (
        <p
          role="alert"
          style={{
            color: "red",
          }}
        >
          {errorMessage}
        </p>
      )}
    </main>
  );
}

export default App;