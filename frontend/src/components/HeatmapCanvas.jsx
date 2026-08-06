// 온도 배열을 WebGL2의 R32F 텍스처로 GPU에 전달하고, fragment shader에서 컬러맵을 적용함 

import {
  useEffect,
  useRef,
} from "react";

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_temperatureTexture;
uniform float u_minTemperature;
uniform float u_maxTemperature;

in vec2 v_texCoord;
out vec4 outColor;


// 두 색상 사이를 선형 보간
vec3 interpolateColor(
    vec3 startColor,
    vec3 endColor,
    float value
) {
    return mix(
        startColor,
        endColor,
        clamp(value, 0.0, 1.0)
    );
}


// 정규화된 온도값을 히트맵 색상으로 변환
vec3 heatmapColor(float value) {
    value = clamp(value, 0.0, 1.0);

    const vec3 blackColor =
        vec3(0.0, 0.0, 0.0);

    const vec3 purpleColor =
        vec3(0.25, 0.0, 0.45);

    const vec3 redColor =
        vec3(0.85, 0.05, 0.02);

    const vec3 yellowColor =
        vec3(1.0, 0.85, 0.0);

    const vec3 whiteColor =
        vec3(1.0, 1.0, 1.0);

    if (value < 0.25) {
        return interpolateColor(
            blackColor,
            purpleColor,
            value / 0.25
        );
    }

    if (value < 0.5) {
        return interpolateColor(
            purpleColor,
            redColor,
            (value - 0.25) / 0.25
        );
    }

    if (value < 0.75) {
        return interpolateColor(
            redColor,
            yellowColor,
            (value - 0.5) / 0.25
        );
    }

    return interpolateColor(
        yellowColor,
        whiteColor,
        (value - 0.75) / 0.25
    );
}


void main() {
    /*
     * JavaScript 온도 배열은 위쪽 행부터 저장되지만
     * WebGL 텍스처 좌표는 아래쪽부터 시작한다.
     * 따라서 y 좌표를 반전한다.
     */
    vec2 textureCoordinate = vec2(
        v_texCoord.x,
        1.0 - v_texCoord.y
    );

    float temperature = texture(
        u_temperatureTexture,
        textureCoordinate
    ).r;

    float temperatureRange =
        max(
            u_maxTemperature -
            u_minTemperature,
            0.0001
        );

    float normalizedTemperature =
        (
            temperature -
            u_minTemperature
        ) / temperatureRange;

    vec3 color =
        heatmapColor(normalizedTemperature);

    outColor = vec4(color, 1.0);
}
`;


function createShader(
  gl,
  shaderType,
  source
) {
  const shader =
    gl.createShader(shaderType);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compiled =
    gl.getShaderParameter(
      shader,
      gl.COMPILE_STATUS
    );

  if (!compiled) {
    const message =
      gl.getShaderInfoLog(shader);

    gl.deleteShader(shader);

    throw new Error(
      `WebGL 셰이더 컴파일 실패: ${message}`
    );
  }

  return shader;
}


function createProgram(
  gl,
  vertexShader,
  fragmentShader
) {
  const program =
    gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const linked =
    gl.getProgramParameter(
      program,
      gl.LINK_STATUS
    );

  if (!linked) {
    const message =
      gl.getProgramInfoLog(program);

    gl.deleteProgram(program);

    throw new Error(
      `WebGL 프로그램 연결 실패: ${message}`
    );
  }

  return program;
}


function HeatmapCanvas({
  frameData,
  width,
  height,
  minTemperature,
  maxTemperature,
  onTemperatureHover,
}) {
  const canvasRef = useRef(null);
  const webglRef = useRef(null);

  /*
   * WebGL 초기화
   *
   * 프레임이 바뀔 때마다 셰이더와 버퍼를 다시 만들지 않고,
   * 컴포넌트가 처음 생성될 때 한 번만 실행한다.
   */
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const gl = canvas.getContext(
      "webgl2",
      {
        antialias: false,
        preserveDrawingBuffer: false,
      }
    );

    if (!gl) {
      throw new Error(
        "이 환경에서는 WebGL2를 사용할 수 없습니다."
      );
    }

    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE
    );

    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER_SOURCE
    );

    const program = createProgram(
      gl,
      vertexShader,
      fragmentShader
    );

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    const positionLocation =
      gl.getAttribLocation(
        program,
        "a_position"
      );

    const texCoordLocation =
      gl.getAttribLocation(
        program,
        "a_texCoord"
      );

    const minTemperatureLocation =
      gl.getUniformLocation(
        program,
        "u_minTemperature"
      );

    const maxTemperatureLocation =
      gl.getUniformLocation(
        program,
        "u_maxTemperature"
      );

    const textureLocation =
      gl.getUniformLocation(
        program,
        "u_temperatureTexture"
      );

    /*
     * 화면 전체를 덮는 사각형.
     * 삼각형 두 개로 구성한다.
     */
    const vertices = new Float32Array([
      // x, y, textureX, textureY
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,

      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]);

    const vertexArray =
      gl.createVertexArray();

    const vertexBuffer =
      gl.createBuffer();

    gl.bindVertexArray(vertexArray);

    gl.bindBuffer(
      gl.ARRAY_BUFFER,
      vertexBuffer
    );

    gl.bufferData(
      gl.ARRAY_BUFFER,
      vertices,
      gl.STATIC_DRAW
    );

    const stride =
      4 * Float32Array.BYTES_PER_ELEMENT;

    gl.enableVertexAttribArray(
      positionLocation
    );

    gl.vertexAttribPointer(
      positionLocation,
      2,
      gl.FLOAT,
      false,
      stride,
      0
    );

    gl.enableVertexAttribArray(
      texCoordLocation
    );

    gl.vertexAttribPointer(
      texCoordLocation,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );

    const temperatureTexture =
      gl.createTexture();

    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(
      gl.TEXTURE_2D,
      temperatureTexture
    );

    /*
     * 온도값을 보간하면 실제 픽셀의 온도값과 달라질 수 있다.
     * 우선 정확한 픽셀 단위 표시를 위해 NEAREST를 사용한다.
     */
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.NEAREST
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      gl.NEAREST
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.CLAMP_TO_EDGE
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      gl.CLAMP_TO_EDGE
    );

    gl.useProgram(program);
    gl.uniform1i(textureLocation, 0);

    webglRef.current = {
      gl,
      program,
      vertexArray,
      vertexBuffer,
      temperatureTexture,
      minTemperatureLocation,
      maxTemperatureLocation,
    };

    return () => {
      gl.deleteTexture(temperatureTexture);
      gl.deleteBuffer(vertexBuffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);

      webglRef.current = null;
    };
  }, []);


  /*
   * 프레임 데이터가 바뀔 때 온도 텍스처만 갱신한다.
   */
  useEffect(() => {
    if (
      !frameData ||
      !width ||
      !height ||
      !webglRef.current
    ) {
      return;
    }

    const expectedLength =
      width * height;

    if (frameData.length !== expectedLength) {
      console.error(
        "온도 배열 크기가 영상 크기와 일치하지 않습니다.",
        {
          actual: frameData.length,
          expected: expectedLength,
        }
      );

      return;
    }

    const {
      gl,
      program,
      vertexArray,
      temperatureTexture,
      minTemperatureLocation,
      maxTemperatureLocation,
    } = webglRef.current;

    const canvas = canvasRef.current;

    if (
      canvas.width !== width ||
      canvas.height !== height
    ) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(
      0,
      0,
      width,
      height
    );

    gl.useProgram(program);

    gl.uniform1f(
      minTemperatureLocation,
      minTemperature
    );

    gl.uniform1f(
      maxTemperatureLocation,
      maxTemperature
    );

    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(
      gl.TEXTURE_2D,
      temperatureTexture
    );

    /*
     * 한 픽셀당 float32 하나를 가진 단일 채널 텍스처.
     */
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      width,
      height,
      0,
      gl.RED,
      gl.FLOAT,
      frameData
    );

    gl.bindVertexArray(vertexArray);

    gl.drawArrays(
      gl.TRIANGLES,
      0,
      6
    );
  }, [
    frameData,
    width,
    height,
    minTemperature,
    maxTemperature,
  ]);


  function handleMouseMove(event) {
    if (
      !frameData ||
      !width ||
      !height ||
      !onTemperatureHover
    ) {
      return;
    }

    const canvas = canvasRef.current;
    const rect =
      canvas.getBoundingClientRect();

    const relativeX =
      event.clientX - rect.left;

    const relativeY =
      event.clientY - rect.top;

    const x = Math.min(
      width - 1,
      Math.max(
        0,
        Math.floor(
          relativeX / rect.width * width
        )
      )
    );

    const y = Math.min(
      height - 1,
      Math.max(
        0,
        Math.floor(
          relativeY / rect.height * height
        )
      )
    );

    const arrayIndex =
      y * width + x;

    onTemperatureHover({
      x,
      y,
      temperature:
        frameData[arrayIndex],
    });
  }


  function handleMouseLeave() {
    onTemperatureHover?.(null);
  }


  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "block",
        width: "100%",
        maxWidth: "960px",
        height: "auto",
        imageRendering: "pixelated",
        background: "#000",
      }}
    />
  );
}

export default HeatmapCanvas;