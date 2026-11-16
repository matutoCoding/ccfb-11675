/**
 * 等距鱼眼 (domemaster) 映射 —— CPU 参考实现。
 *
 * 约定(与 GLSL 端严格一致):
 *  - 球幕空间: +Z = 天顶, +Y = 正北(画面正上方), +X = 正东。
 *  - 方向 d 为单位向量。θ = 距天顶角(极角), az = 方位角(北起顺时针, 即 atan2(x, y))。
 *  - domemaster 为 size×size 正方形。连续像素坐标, 像素 (i,j) 的中心在 (i+0.5, j+0.5)。
 *  - 中心 c = size/2。半径 r = (θ / halfFov) * (size/2)。
 *  - px = c + r·sin(az),  py = c − r·cos(az)   (az=0 → 图像正上方)
 *  - 倾角 tilt: 正值表示球幕天顶轴向观众席(−Y, 图像下方)倾斜 —— 天文馆标准布局。
 *    映射时先把方向绕 X 轴旋转 −tilt(物理方向 → 内容方向)。
 *  - y 轴向下为图像行方向(与 canvas/WebGL 帧缓冲行序一致, 渲染时不再翻转)。
 */

export interface FisheyeParams {
  /** 输出边长(像素) */
  size: number;
  /** 视场角(度), 180 或 210 */
  fovDeg: number;
  /** 球幕倾角(度), 天顶倾向画面正北为正 */
  tiltDeg: number;
}

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

/** 绕 X 轴旋转(右手系): 把 +Z 转向 +Y */
export function rotX(v: Vec3, angleDeg: number): Vec3 {
  const a = angleDeg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

/** 球面方向 → domemaster 像素坐标(连续)。超出视场返回 null。 */
export function directionToPixel(d: Vec3, p: FisheyeParams): [number, number] | null {
  const t = rotX(d, -p.tiltDeg);
  // atan2(hypot(x,y), z) 与 acos(z) 数学等价, 但天顶附近数值稳定
  // (acos 在 z→1 时把 z 的噪声放大 1/sinθ 倍)
  const theta = Math.atan2(Math.hypot(t[0], t[1]), t[2]);
  const halfFov = (p.fovDeg / 2) * DEG;
  if (theta > halfFov) return null;
  const az = Math.atan2(t[0], t[1]);
  const r = (theta / halfFov) * (p.size / 2);
  const c = p.size / 2;
  return [c + r * Math.sin(az), c - r * Math.cos(az)];
}

/** domemaster 像素坐标(连续) → 球面方向。超出视场返回 null。 */
export function pixelToDirection(px: number, py: number, p: FisheyeParams): Vec3 | null {
  const c = p.size / 2;
  const dx = px - c, dy = c - py; // dy 取图像向上为正
  const r = Math.hypot(dx, dy);
  const halfFov = (p.fovDeg / 2) * DEG;
  const theta = (r / (p.size / 2)) * halfFov;
  if (theta > halfFov) return null;
  const az = Math.atan2(dx, dy);
  const st = Math.sin(theta);
  const t: Vec3 = [st * Math.sin(az), st * Math.cos(az), Math.cos(theta)];
  return rotX(t, p.tiltDeg);
}

/**
 * 与 CPU 公式逐字对应的 GLSL 函数(合成 pass 用)。
 * 输入 fragCenter 为图像坐标(行向下, 像素中心在 i+0.5), 输出球幕空间方向。
 */
export const GLSL_PIXEL_TO_DIR = /* glsl */ `
uniform float uSize;      // domemaster 边长
uniform float uHalfFov;   // 半视场(弧度)
uniform float uTilt;      // 倾角(弧度)

vec3 pixelToDir(vec2 fragCenter) {
  float c = uSize * 0.5;
  vec2 d = vec2(fragCenter.x - c, c - fragCenter.y);
  float r = length(d);
  float theta = r / c * uHalfFov;
  if (theta > uHalfFov) return vec3(0.0);   // 视场外, 由调用方判 r>c 处理
  float az = atan(d.x, d.y);
  float st = sin(theta);
  vec3 v = vec3(st * sin(az), st * cos(az), cos(theta));
  // 内容方向 -> 物理方向: 绕 X 轴旋转 +tilt (与 CPU rotX(t, tiltDeg) 一致)
  float ct = cos(uTilt), stt = sin(uTilt);
  return vec3(v.x, v.y * ct - v.z * stt, v.y * stt + v.z * ct);
}
`;

/** 把像素坐标误差换算说明: 返回给定参数下 1 像素对应的天顶角(度) */
export function degreesPerPixel(p: FisheyeParams): number {
  return p.fovDeg / p.size;
}

/** 相机旋转矩阵 Rz(yaw)·Rx(pitch), 列主序 3×3 (GLSL uniformMatrix3fv 直接可用) */
export function camRotMatrix(yawDeg: number, pitchDeg: number): Float32Array {
  const a = yawDeg * DEG, b = pitchDeg * DEG;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  return new Float32Array([
    ca, sa, 0,
    -sa * cb, ca * cb, sb,
    sa * sb, -ca * sb, cb,
  ]);
}

/** CPU 端施加同样的相机旋转(标签定位等用) */
export function applyCamRot(d: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const m = camRotMatrix(yawDeg, pitchDeg);
  return [
    m[0] * d[0] + m[3] * d[1] + m[6] * d[2],
    m[1] * d[0] + m[4] * d[1] + m[7] * d[2],
    m[2] * d[0] + m[5] * d[1] + m[8] * d[2],
  ];
}
