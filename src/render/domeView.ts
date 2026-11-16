/**
 * 座位预览: 以透视相机从指定座位观察球幕内壁, 直观呈现实际变形。
 * 球幕网格顶点携带"内容方向", 直接从立方体贴图取色 —— 与 domemaster 映射严格一致。
 */
import { linkProgram, mat4LookAt, mat4Mul, mat4Perspective } from './glutil';
import { SeatConfig } from '../core/types';

const DEG = Math.PI / 180;

const DOME_VS = /* glsl */ `#version 300 es
in vec3 aDir;        // 内容方向(球幕空间)
uniform mat3 uTilt;  // 倾角旋转
uniform float uRadius;
uniform mat4 uMVP;
out vec3 vDir;
void main() {
  vDir = aDir;
  vec3 world = uTilt * aDir * uRadius;
  gl_Position = uMVP * vec4(world, 1.0);
}
`;

const DOME_FS = /* glsl */ `#version 300 es
precision highp float;
uniform samplerCube uCube;
in vec3 vDir;
out vec4 outColor;
void main() {
  outColor = vec4(texture(uCube, normalize(vDir)).rgb, 1.0);
}
`;

const FLAT_VS = /* glsl */ `#version 300 es
in vec3 aPos;
uniform mat4 uMVP;
uniform float uPointSize;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
}
`;

const FLAT_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 outColor;
void main() { outColor = vec4(uColor, uAlpha); }
`;

export interface SeatPos { x: number; y: number; z: number; row: number; col: number }

/** 计算座位布局(观众面向 +Y 即画面正北, 座位在球心南侧) */
export function seatLayout(cfg: SeatConfig): SeatPos[] {
  const seats: SeatPos[] = [];
  for (let r = 0; r < cfg.rows; r++) {
    const y = -(cfg.firstRowDist + r * cfg.rowSpacing);
    const n = cfg.seatsPerRow;
    for (let c = 0; c < n; c++) {
      const x = (c - (n - 1) / 2) * cfg.seatSpacing;
      seats.push({ x, y, z: cfg.eyeHeight, row: r, col: c });
    }
  }
  return seats;
}

export class SeatViewRenderer {
  gl: WebGL2RenderingContext;
  private domeProg: WebGLProgram;
  private flatProg: WebGLProgram;
  private domeVao: WebGLVertexArrayObject;
  private domeIdxCount = 0;
  private seatVao: WebGLVertexArrayObject;
  private seatBuf: WebGLBuffer;
  private seatCount = 0;
  private floorVao: WebGLVertexArrayObject;
  private floorCount = 0;
  yaw = 0;       // 视线方向(度), 0 = 面向 +Y
  pitch = 20;    // 抬头
  fovY = 70;

  /** 与 DomeRenderer 共用同一 GL 上下文(立方体贴图不能跨上下文共享) */
  constructor(sharedGl: WebGL2RenderingContext, private canvas: HTMLCanvasElement) {
    this.gl = sharedGl;
    const gl = this.gl;
    this.domeProg = linkProgram(gl, DOME_VS, DOME_FS);
    this.flatProg = linkProgram(gl, FLAT_VS, FLAT_FS);
    this.domeVao = gl.createVertexArray()!;
    this.seatVao = gl.createVertexArray()!;
    this.seatBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.seatVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seatBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.floorVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
  }

  /** 构建球幕网格(球冠, 张角 = fov/2) */
  buildDome(fovDeg: number): void {
    const gl = this.gl;
    const halfFov = (fovDeg / 2) * DEG;
    const rings = 48, segs = 128;
    const verts: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const theta = (r / rings) * halfFov;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let s = 0; s <= segs; s++) {
        const az = (s / segs) * 2 * Math.PI;
        verts.push(st * Math.sin(az), st * Math.cos(az), ct);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s, b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    gl.bindVertexArray(this.domeVao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.domeIdxCount = idx.length;
  }

  setSeats(seats: SeatPos[]): void {
    const gl = this.gl;
    const data = new Float32Array(seats.length * 3);
    seats.forEach((s, i) => { data[i * 3] = s.x; data[i * 3 + 1] = s.y; data[i * 3 + 2] = s.z; });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seatBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.seatCount = seats.length;
  }

  /** 地面参考线(同心圆 + 十字线) */
  buildFloor(radius: number): void {
    const gl = this.gl;
    const pts: number[] = [];
    const seg = 96;
    for (let ring = 1; ring <= 3; ring++) {
      const r = (radius * ring) / 3;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * 2 * Math.PI, a1 = ((k + 1) / seg) * 2 * Math.PI;
        pts.push(r * Math.cos(a0), r * Math.sin(a0), 0, r * Math.cos(a1), r * Math.sin(a1), 0);
      }
    }
    pts.push(-radius, 0, 0, radius, 0, 0, 0, -radius, 0, 0, radius, 0);
    gl.bindVertexArray(this.floorVao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.floorCount = pts.length / 3;
  }

  /**
   * 从座位渲染。cubeTex 为 DomeRenderer 的立方体贴图。
   */
  render(
    cubeTex: WebGLTexture,
    eye: SeatPos,
    cfg: SeatConfig,
    tiltDeg: number,
    selectedSeat: number,
  ): void {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.02, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const proj = mat4Perspective(this.fovY * DEG, w / h, 0.05, 200);
    const yawR = this.yaw * DEG, pitchR = this.pitch * DEG;
    const look: [number, number, number] = [
      eye.x + Math.cos(pitchR) * Math.sin(yawR),
      eye.y + Math.cos(pitchR) * Math.cos(yawR),
      eye.z + Math.sin(pitchR),
    ];
    const view = mat4LookAt([eye.x, eye.y, eye.z], look, [0, 0, 1]);
    const mvp = mat4Mul(proj, view);

    // 球幕
    const t = tiltDeg * DEG;
    const ct = Math.cos(t), st = Math.sin(t);
    const tiltMat = new Float32Array([1, 0, 0, 0, ct, st, 0, -st, ct]); // 列主序 rotX(tilt)
    gl.useProgram(this.domeProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.domeProg, 'uMVP'), false, mvp);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.domeProg, 'uTilt'), false, tiltMat);
    gl.uniform1f(gl.getUniformLocation(this.domeProg, 'uRadius'), cfg.domeRadius);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTex);
    gl.uniform1i(gl.getUniformLocation(this.domeProg, 'uCube'), 0);
    gl.bindVertexArray(this.domeVao);
    gl.drawElements(gl.TRIANGLES, this.domeIdxCount, gl.UNSIGNED_INT, 0);

    // 地面线
    gl.useProgram(this.flatProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.flatProg, 'uMVP'), false, mvp);
    gl.uniform3f(gl.getUniformLocation(this.flatProg, 'uColor'), 0.25, 0.28, 0.35);
    gl.uniform1f(gl.getUniformLocation(this.flatProg, 'uAlpha'), 1);
    gl.bindVertexArray(this.floorVao);
    gl.drawArrays(gl.LINES, 0, this.floorCount);

    // 座位
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3f(gl.getUniformLocation(this.flatProg, 'uColor'), 0.9, 0.7, 0.2);
    gl.uniform1f(gl.getUniformLocation(this.flatProg, 'uPointSize'), 5.0);
    gl.bindVertexArray(this.seatVao);
    gl.drawArrays(gl.POINTS, 0, this.seatCount);
    // 当前座位高亮
    if (selectedSeat >= 0 && selectedSeat < this.seatCount) {
      gl.uniform3f(gl.getUniformLocation(this.flatProg, 'uColor'), 1.0, 0.3, 0.3);
      gl.uniform1f(gl.getUniformLocation(this.flatProg, 'uPointSize'), 10.0);
      gl.drawArrays(gl.POINTS, selectedSeat, 1);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}
