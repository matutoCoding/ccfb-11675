// 列主序 4x4 矩阵（Float32Array(16)，与 WebGL uniform 布局一致）

import { Vec3, v3, normalize, cross, sub, dot } from './vec3';

export type Mat4 = Float32Array;

export const identity = (): Mat4 => {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
};

/** a * b（先应用 b 再应用 a） */
export const multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
};

export const perspective = (
  fovyRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 => {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
};

export const lookAt = (eye: Vec3, center: Vec3, up: Vec3): Mat4 => {
  const f = normalize(sub(center, eye)); // 相机 -Z
  const s = normalize(cross(f, up)); // 相机 +X
  const u = cross(s, f); // 相机 +Y
  const m = identity();
  m[0] = s.x;
  m[4] = s.y;
  m[8] = s.z;
  m[1] = u.x;
  m[5] = u.y;
  m[9] = u.z;
  m[2] = -f.x;
  m[6] = -f.y;
  m[10] = -f.z;
  m[12] = -dot(s, eye);
  m[13] = -dot(u, eye);
  m[14] = dot(f, eye);
  return m;
};

export const translation = (t: Vec3): Mat4 => {
  const m = identity();
  m[12] = t.x;
  m[13] = t.y;
  m[14] = t.z;
  return m;
};

export const scaling = (s: Vec3): Mat4 => {
  const m = identity();
  m[0] = s.x;
  m[5] = s.y;
  m[10] = s.z;
  return m;
};

/** 绕单位轴旋转 angleRad（Rodrigues 构造旋转矩阵） */
export const rotationAxis = (axis: Vec3, angleRad: number): Mat4 => {
  const k = normalize(axis);
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;
  const m = identity();
  m[0] = t * k.x * k.x + c;
  m[1] = t * k.x * k.y + s * k.z;
  m[2] = t * k.x * k.z - s * k.y;
  m[4] = t * k.x * k.y - s * k.z;
  m[5] = t * k.y * k.y + c;
  m[6] = t * k.y * k.z + s * k.x;
  m[8] = t * k.x * k.z + s * k.y;
  m[9] = t * k.y * k.z - s * k.x;
  m[10] = t * k.z * k.z + c;
  return m;
};

/** 通用 4x4 求逆（平移旋转缩放均适用） */
export const inverse = (a: Mat4): Mat4 => {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return identity();
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
};

/** 用矩阵变换方向（忽略平移，w=0） */
export const transformDir = (m: Mat4, d: Vec3): Vec3 => ({
  x: m[0] * d.x + m[4] * d.y + m[8] * d.z,
  y: m[1] * d.x + m[5] * d.y + m[9] * d.z,
  z: m[2] * d.x + m[6] * d.y + m[10] * d.z,
});

/** 用矩阵变换点（含平移，w=1） */
export const transformPoint = (m: Mat4, p: Vec3): Vec3 => {
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
  const invW = w === 0 ? 1 : 1 / w;
  return v3(
    (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) * invW,
    (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) * invW,
    (m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]) * invW,
  );
};
