/**
 * 球幕渲染器:
 *  1. 把天空(恒星/行星/轨道/网格)渲染到立方体贴图 6 个面;
 *  2. 合成 pass 用解析等距鱼眼公式逐像素采样立方体贴图, 输出 domemaster。
 * 映射精度只取决于合成 pass 的解析公式, 与几何细分无关。
 */
import {
  CUBE_FACES, linkProgram, mat4LookAt, mat4Mul, mat4Perspective, requireGl,
} from './glutil';
import { GLSL_PIXEL_TO_DIR, FisheyeParams } from '../core/fisheye';
import { AnimProps } from '../core/types';
import {
  PLANETS, PlanetId, julianDate, lst, moonEqu, planetEqu, planetOrbitPath, sunEqu,
} from '../core/astro';
import { PlanetConfig } from '../core/types';

const DEG = Math.PI / 180;
const IDENTITY_MAT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/* ---------- 着色器 ---------- */

const STAR_VS = /* glsl */ `#version 300 es
in vec3 aEqu;      // 赤道坐标单位向量
in float aMag;
uniform mat3 uRot;        // 赤道 -> 球幕空间
uniform mat4 uViewProj;
uniform float uCubeSize;
uniform float uMagLimit;
out float vBright;
void main() {
  vec3 d = uRot * aEqu;
  gl_Position = uViewProj * vec4(d, 1.0);   // 单位球面上的点(不能用 w=0, 否则 z_ndc 越界被裁剪)
  float k = clamp(uMagLimit - aMag, 0.0, 8.0);
  vBright = pow(2.0, -0.9 * (aMag - 1.0));
  gl_PointSize = clamp(1.5 + k * 1.6, 1.0, 18.0) * (uCubeSize / 1024.0);
}
`;

const STAR_FS = /* glsl */ `#version 300 es
precision highp float;
in float vBright;
uniform float uExposure;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.15, d);
  float b = clamp(vBright * uExposure, 0.0, 1.0);
  vec3 tint = vec3(0.9, 0.93, 1.0);
  outColor = vec4(tint * b * a, 1.0);
}
`;

const POINT_VS = /* glsl */ `#version 300 es
in vec3 aPos;      // 球幕空间方向
uniform mat4 uViewProj;
uniform float uPointSize;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
}
`;

const POINT_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uSoft;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.5 - uSoft, d);
  outColor = vec4(uColor * a, 1.0);
}
`;

const LINE_VS = /* glsl */ `#version 300 es
in vec3 aPos;
uniform mat3 uRot;
uniform mat4 uViewProj;
void main() {
  vec3 d = uRot * aPos;
  gl_Position = uViewProj * vec4(d, 1.0);
}
`;

const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 outColor;
void main() { outColor = vec4(uColor * uAlpha, 1.0); }
`;

const QUAD_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0))[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

/** 正常合成: 采样立方体贴图 */
const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform samplerCube uCube;
uniform vec2 uOrigin;     // 正方形视口左下角
uniform mat3 uCamRot;
${GLSL_PIXEL_TO_DIR}
out vec4 outColor;
void main() {
  // 转为图像坐标(行向下), 与 CPU 参考公式逐像素一致
  vec2 fc = vec2(gl_FragCoord.x - uOrigin.x, uSize - (gl_FragCoord.y - uOrigin.y));
  float c = uSize * 0.5;
  vec2 d = vec2(fc.x - c, c - fc.y);
  if (length(d) > c) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 dir = uCamRot * pixelToDir(fc);
  outColor = vec4(texture(uCube, dir).rgb, 1.0);
}
`;

/** 自检合成: 把方向分量编码进颜色 (每分量 16 位, 两遍渲染: uPass=0 编 x,y; uPass=1 编 z)。
 *  直接编码分量, 避免在天顶附近用 acos 反推极角的病态。 */
const SELFTEST_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uOrigin;
uniform mat3 uCamRot;
uniform int uPass;
${GLSL_PIXEL_TO_DIR}
out vec4 outColor;
vec2 enc16(float v) {  // [-1,1] -> 16 位 -> 两个字节
  uint u = uint(clamp(v * 0.5 + 0.5, 0.0, 1.0) * 65535.0 + 0.5);
  return vec2(float(u >> 8u) / 255.0, float(u & 0xFFu) / 255.0);
}
void main() {
  vec2 fc = vec2(gl_FragCoord.x - uOrigin.x, uSize - (gl_FragCoord.y - uOrigin.y));
  float c = uSize * 0.5;
  vec2 d = vec2(fc.x - c, c - fc.y);
  if (length(d) > c) { outColor = vec4(0.0); return; }
  vec3 dir = uCamRot * pixelToDir(fc);
  if (uPass == 0) {
    vec2 ex = enc16(dir.x), ey = enc16(dir.y);
    outColor = vec4(ex, ey);
  } else {
    vec2 ez = enc16(dir.z);
    outColor = vec4(ez, 0.0, 0.0);
  }
}
`;

/* ---------- 类型 ---------- */

export interface SkyUniforms {
  /** 赤道 -> 球幕空间旋转 */
  rot: Float32Array; // 9
  jd: number;
}

export interface RenderContent {
  magLimit: number;
  exposure: number;
  planetScale: number;
  planets: PlanetConfig[];
  showSun: boolean;
  showMoon: boolean;
  showGrid: boolean;
}

/** 由动画属性 + 观测地推导渲染用旋转矩阵 */
export function skyUniforms(props: AnimProps): SkyUniforms {
  const jd = julianDate(props.skyTime);
  const lstDeg = lst(jd, props.lon);
  const phi = props.lat * DEG;
  const L = lstDeg * DEG;
  const sL = Math.sin(L), cL = Math.cos(L);
  const sP = Math.sin(phi), cP = Math.cos(phi);
  // 行: [east, north, up] × 赤道向量
  const rot = new Float32Array([
    -sL, -sP * cL, cP * cL,
    cL, -sP * sL, cP * sL,
    0, cP, sP,
  ]);
  return { rot, jd };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* ---------- 主类 ---------- */

export class DomeRenderer {
  gl: WebGL2RenderingContext;
  cubeSize: number;
  private cubeTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private starProg: WebGLProgram;
  private pointProg: WebGLProgram;
  private lineProg: WebGLProgram;
  private compositeProg: WebGLProgram;
  private selfTestProg: WebGLProgram;
  private starVao: WebGLVertexArrayObject;
  private starCount = 0;
  private pointVao: WebGLVertexArrayObject;
  private pointBuf: WebGLBuffer;
  private lineVao: WebGLVertexArrayObject;
  private lineBuf: WebGLBuffer;
  private gridVao: WebGLVertexArrayObject;
  private gridCount = 0;
  private quadVao: WebGLVertexArrayObject;

  constructor(
    private canvas: HTMLCanvasElement | OffscreenCanvas,
    cubeSize = 1024,
    contextAttrs: WebGLContextAttributes = {},
  ) {
    this.gl = requireGl(canvas, contextAttrs);
    this.cubeSize = cubeSize;
    const gl = this.gl;

    this.starProg = linkProgram(gl, STAR_VS, STAR_FS);
    this.pointProg = linkProgram(gl, POINT_VS, POINT_FS);
    this.lineProg = linkProgram(gl, LINE_VS, LINE_FS);
    this.compositeProg = linkProgram(gl, QUAD_VS, COMPOSITE_FS);
    this.selfTestProg = linkProgram(gl, QUAD_VS, SELFTEST_FS);

    // 立方体贴图 + FBO
    const tex = gl.createTexture();
    if (!tex) throw new Error('无法创建纹理');
    this.cubeTex = tex;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    for (let i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA8, cubeSize, cubeSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('无法创建帧缓冲');
    this.fbo = fbo;

    // VAOs
    this.starVao = gl.createVertexArray()!;
    this.pointVao = gl.createVertexArray()!;
    this.pointBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 12, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.lineVao = gl.createVertexArray()!;
    this.lineBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.gridVao = gl.createVertexArray()!;
    this.buildGrid();

    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
  }

  /** 加载星表: rows = [raDeg, decDeg, mag][] */
  setStars(rows: [number, number, number][]): void {
    const gl = this.gl;
    const n = rows.length;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const ra = rows[i][0] * DEG, dec = rows[i][1] * DEG;
      data[i * 4] = Math.cos(dec) * Math.cos(ra);
      data[i * 4 + 1] = Math.cos(dec) * Math.sin(ra);
      data[i * 4 + 2] = Math.sin(dec);
      data[i * 4 + 3] = rows[i][2];
    }
    gl.bindVertexArray(this.starVao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
    this.starCount = n;
  }

  /** 地平网格(球幕空间, 静态): 高度圈每 15° + 方位线每 15° */
  private buildGrid(): void {
    const gl = this.gl;
    const pts: number[] = [];
    const seg = 96;
    for (let alt = 0; alt < 90; alt += 15) {
      const r = Math.cos(alt * DEG), z = Math.sin(alt * DEG);
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * 2 * Math.PI, a1 = ((k + 1) / seg) * 2 * Math.PI;
        pts.push(r * Math.sin(a0), r * Math.cos(a0), z, r * Math.sin(a1), r * Math.cos(a1), z);
      }
    }
    for (let az = 0; az < 360; az += 15) {
      const a = az * DEG;
      for (let k = 0; k < 24; k++) {
        const t0 = (k / 24) * Math.PI / 2, t1 = ((k + 1) / 24) * Math.PI / 2;
        pts.push(
          Math.cos(t0) * Math.sin(a), Math.cos(t0) * Math.cos(a), Math.sin(t0),
          Math.cos(t1) * Math.sin(a), Math.cos(t1) * Math.cos(a), Math.sin(t1),
        );
      }
    }
    const buf = gl.createBuffer();
    gl.bindVertexArray(this.gridVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.gridCount = pts.length / 3;
  }

  /** 渲染一帧 domemaster 到画布。camRot 为 3×3 列主序相机旋转(可选)。 */
  render(params: FisheyeParams, sky: SkyUniforms, content: RenderContent, camRot?: Float32Array): void {
    this.renderCube(sky, content);
    this.composite(params, this.compositeProg, camRot ?? IDENTITY_MAT3);
  }

  /** 只渲染立方体贴图(座位预览等复用同一 GL 上下文时用) */
  renderCubeMap(sky: SkyUniforms, content: RenderContent): void {
    this.renderCube(sky, content);
  }

  /** 自检模式: 渲染方向编码图。pass=0 编码 x,y; pass=1 编码 z */
  renderSelfTest(params: FisheyeParams, pass: 0 | 1): void {
    this.composite(params, this.selfTestProg, IDENTITY_MAT3, pass);
  }

  private renderCube(sky: SkyUniforms, content: RenderContent): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.cubeSize, this.cubeSize);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    const proj = mat4Perspective(Math.PI / 2, 1, 0.001, 10);
    const ident = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    for (let face = 0; face < 6; face++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, this.cubeTex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const f = CUBE_FACES[face];
      const view = mat4LookAt([0, 0, 0], f.dir, f.up);
      const vp = mat4Mul(proj, view);

      // 恒星
      if (this.starCount > 0) {
        gl.useProgram(this.starProg);
        gl.uniformMatrix3fv(gl.getUniformLocation(this.starProg, 'uRot'), false, sky.rot);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.starProg, 'uViewProj'), false, vp);
        gl.uniform1f(gl.getUniformLocation(this.starProg, 'uCubeSize'), this.cubeSize);
        gl.uniform1f(gl.getUniformLocation(this.starProg, 'uMagLimit'), content.magLimit);
        gl.uniform1f(gl.getUniformLocation(this.starProg, 'uExposure'), content.exposure);
        gl.bindVertexArray(this.starVao);
        gl.drawArrays(gl.POINTS, 0, this.starCount);
      }

      // 行星 / 太阳 / 月亮
      this.renderBodies(sky, content, vp);

      // 网格
      if (content.showGrid) {
        gl.useProgram(this.lineProg);
        gl.uniformMatrix3fv(gl.getUniformLocation(this.lineProg, 'uRot'), false, ident);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uViewProj'), false, vp);
        gl.uniform3f(gl.getUniformLocation(this.lineProg, 'uColor'), 0.2, 0.5, 0.6);
        gl.uniform1f(gl.getUniformLocation(this.lineProg, 'uAlpha'), 0.5);
        gl.bindVertexArray(this.gridVao);
        gl.drawArrays(gl.LINES, 0, this.gridCount);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }

  private renderBodies(sky: SkyUniforms, content: RenderContent, vp: Float32Array): void {
    const gl = this.gl;
    const latDummy = 0; // 位置已在 sky.rot 中体现; 这里直接用赤道向量
    void latDummy;
    const bodies: { dir: [number, number, number]; color: [number, number, number]; sizePx: number }[] = [];

    const eqDir = (raDeg: number, decDeg: number): [number, number, number] => {
      const ra = raDeg * DEG, dec = decDeg * DEG;
      const eq: [number, number, number] = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
      const r = sky.rot;
      return [
        r[0] * eq[0] + r[3] * eq[1] + r[6] * eq[2],
        r[1] * eq[0] + r[4] * eq[1] + r[7] * eq[2],
        r[2] * eq[0] + r[5] * eq[1] + r[8] * eq[2],
      ];
    };

    const scale = content.planetScale;
    if (content.showSun) {
      const s = sunEqu(sky.jd);
      bodies.push({ dir: eqDir(s.ra, s.dec), color: [1, 0.95, 0.8], sizePx: 14 * scale });
    }
    if (content.showMoon) {
      const m = moonEqu(sky.jd);
      bodies.push({ dir: eqDir(m.ra, m.dec), color: [0.9, 0.9, 0.85], sizePx: 12 * scale });
    }
    for (const pc of content.planets) {
      if (!pc.visible) continue;
      const el = PLANETS[pc.id as PlanetId];
      const p = planetEqu(pc.id as PlanetId, sky.jd);
      const size = Math.max(3, (6 - el.baseMag) * 1.2) * pc.sizeBoost * scale;
      bodies.push({ dir: eqDir(p.ra, p.dec), color: hexToRgb(el.color), sizePx: size });
    }

    // 点精灵
    gl.useProgram(this.pointProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.pointProg, 'uViewProj'), false, vp);
    gl.uniform1f(gl.getUniformLocation(this.pointProg, 'uSoft'), 0.25);
    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    const sizeScale = this.cubeSize / 1024;
    for (const b of bodies) {
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.dir), gl.DYNAMIC_DRAW);
      gl.uniform3fv(gl.getUniformLocation(this.pointProg, 'uColor'), b.color);
      gl.uniform1f(gl.getUniformLocation(this.pointProg, 'uPointSize'), b.sizePx * sizeScale);
      gl.drawArrays(gl.POINTS, 0, 1);
    }

    // 轨道线(赤道坐标, 用 sky.rot 变换)
    gl.useProgram(this.lineProg);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.lineProg, 'uRot'), false, sky.rot);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uViewProj'), false, vp);
    gl.uniform1f(gl.getUniformLocation(this.lineProg, 'uAlpha'), 0.6);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    for (const pc of content.planets) {
      if (!pc.visible || !pc.showOrbit) continue;
      const el = PLANETS[pc.id as PlanetId];
      const path = planetOrbitPath(pc.id as PlanetId, sky.jd, 180);
      const data = new Float32Array(path.length * 3);
      for (let i = 0; i < path.length; i++) {
        const ra = path[i].ra * DEG, dec = path[i].dec * DEG;
        data[i * 3] = Math.cos(dec) * Math.cos(ra);
        data[i * 3 + 1] = Math.cos(dec) * Math.sin(ra);
        data[i * 3 + 2] = Math.sin(dec);
      }
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const c = hexToRgb(el.color);
      gl.uniform3f(gl.getUniformLocation(this.lineProg, 'uColor'), c[0], c[1], c[2]);
      gl.drawArrays(gl.LINE_STRIP, 0, path.length);
    }
  }

  /** 合成: 立方体贴图 -> domemaster (或自检编码图) */
  private composite(params: FisheyeParams, prog: WebGLProgram, camRot: Float32Array, selfTestPass?: number): void {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const side = Math.min(w, h);
    const ox = Math.floor((w - side) / 2), oy = Math.floor((h - side) / 2);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(ox, oy, side, side);

    gl.useProgram(prog);
    gl.uniform2f(gl.getUniformLocation(prog, 'uOrigin'), ox, oy);
    gl.uniform1f(gl.getUniformLocation(prog, 'uSize'), side);
    gl.uniform1f(gl.getUniformLocation(prog, 'uHalfFov'), (params.fovDeg / 2) * DEG);
    gl.uniform1f(gl.getUniformLocation(prog, 'uTilt'), params.tiltDeg * DEG);
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uCamRot'), false, camRot);
    if (selfTestPass !== undefined) {
      const locPass = gl.getUniformLocation(prog, 'uPass');
      if (locPass) gl.uniform1i(locPass, selfTestPass);
    }

    const loc = gl.getUniformLocation(prog, 'uCube');
    if (loc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTex);
      gl.uniform1i(loc, 0);
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** 读取当前画布像素(自检用) */
  readPixels(): Uint8Array {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  get canvasSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  /** 立方体贴图(座位预览等共用) */
  get cubeTexture(): WebGLTexture {
    return this.cubeTex;
  }
}

/** 供页面/导出器使用: 由节目状态构造渲染内容 */
export function contentFromProps(
  props: AnimProps,
  parts: {
    planets: PlanetConfig[]; showSun: boolean; showMoon: boolean; showGrid: boolean;
    exposure: number;
  },
): RenderContent {
  return {
    magLimit: props.magLimit,
    exposure: parts.exposure,
    planetScale: props.planetScale,
    planets: parts.planets,
    showSun: parts.showSun,
    showMoon: parts.showMoon,
    showGrid: parts.showGrid,
  };
}
