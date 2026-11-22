// 轻量三维向量库（列向量约定，全部纯函数，方便单元测试）

export type Vec3 = { x: number; y: number; z: number };

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const fromTuple = (t: ArrayLike<number>): Vec3 => ({
  x: t[0] ?? 0,
  y: t[1] ?? 0,
  z: t[2] ?? 0,
});
export const toTuple = (a: Vec3): [number, number, number] => [a.x, a.y, a.z];

export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const scale = (a: Vec3, s: number): Vec3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});
export const dot = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const lengthSq = (a: Vec3): number => dot(a, a);
export const length = (a: Vec3): number => Math.sqrt(lengthSq(a));

export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  if (l < 1e-12) return v3(0, 0, 1);
  return scale(a, 1 / l);
};

export const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });

/** 线性插值 */
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** 绕任意单位轴旋转（Rodrigues 公式） */
export const rotateAxis = (a: Vec3, axis: Vec3, angleRad: number): Vec3 => {
  const k = normalize(axis);
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return add(
    add(scale(a, c), scale(cross(k, a), s)),
    scale(k, dot(k, a) * (1 - c)),
  );
};

/** 两个单位方向之间的角距离（弧度），数值稳定 */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const d = Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))));
  return Math.acos(d);
};

/** 水平坐标（方位角/高度角，弧度）转单位方向。
 * 约定：az 从 +Y(北) 起顺时针；el 为相对水平面仰角；+Z 为天顶。
 * el=+90° → (0,0,1)；el=0,az=0 → (0,1,0)；el=0,az=90° → (1,0,0)。
 */
export const fromHoriz = (azRad: number, elRad: number): Vec3 => {
  const ce = Math.cos(elRad);
  return {
    x: ce * Math.sin(azRad),
    y: ce * Math.cos(azRad),
    z: Math.sin(elRad),
  };
};

/** 单位方向转水平坐标（方位角 0..2π，高度角 -π/2..π/2） */
export const toHoriz = (d: Vec3): { az: number; el: number } => {
  const n = normalize(d);
  const el = Math.asin(Math.max(-1, Math.min(1, n.z)));
  let az = Math.atan2(n.x, n.y);
  if (az < 0) az += Math.PI * 2;
  return { az, el };
};

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;
export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));
