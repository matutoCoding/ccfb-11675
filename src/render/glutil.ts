/** WebGL2 小工具 */

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('无法创建着色器');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`着色器编译失败: ${log}\n${src}`);
  }
  return sh;
}

export function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('无法创建程序');
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`程序链接失败: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export function requireGl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  attrs: WebGLContextAttributes = {},
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
    ...attrs,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('当前浏览器不支持 WebGL2');
  return gl;
}

/** 立方体各面的视图矩阵(看向面心)。
 *  up 按 OpenGL 立方体贴图采样规范选取, 保证渲染结果与 texture(uCube, dir) 的
 *  (sc, tc, ma) 映射逐像素一致:
 *    +X: s=-z t=-y | -X: s=+z t=-y | +Y: s=+x t=+z
 *    -Y: s=+x t=-z | +Z: s=+x t=-y | -Z: s=-x t=-y
 */
export interface CubeFace { dir: [number, number, number]; up: [number, number, number] }

export const CUBE_FACES: CubeFace[] = [
  { dir: [1, 0, 0], up: [0, -1, 0] },   // +X
  { dir: [-1, 0, 0], up: [0, -1, 0] },  // -X
  { dir: [0, 1, 0], up: [0, 0, 1] },    // +Y
  { dir: [0, -1, 0], up: [0, 0, -1] },  // -Y
  { dir: [0, 0, 1], up: [0, -1, 0] },   // +Z (天顶)
  { dir: [0, 0, -1], up: [0, -1, 0] },  // -Z
];

export type Mat4 = Float32Array; // 16, 列主序

export function mat4Perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Mat4 {
  const z = norm3([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = norm3(cross3(up, z));
  const y = cross3(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0];
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1];
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
  m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function norm3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
