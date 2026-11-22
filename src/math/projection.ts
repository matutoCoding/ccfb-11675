// 投影机分区、边缘融合权重、座位视场 —— 全部在「世界方向」层面计算，
// 与鱼眼映射共享同一套方向约定，保证校正与输出一致。

import { Projector, Seat, Settings } from '../types';
import {
  Vec3,
  v3,
  normalize,
  fromHoriz,
  toHoriz,
  deg2rad,
  clamp,
  angleBetween,
  rotateAxis,
} from './vec3';
import { worldToLocal, localToWorld } from './fisheye';

/** 投影机光轴方向（世界系） */
export const projectorAxis = (p: Projector): Vec3 =>
  fromHoriz(deg2rad(p.azimuthDeg), deg2rad(p.elevationDeg));

/** 投影机画面的右方向（世界系，垂直于光轴，考虑 roll） */
const projectorRight = (p: Projector): Vec3 => {
  const axis = projectorAxis(p);
  const worldUp = v3(0, 0, 1);
  let right = normalize(crossSafe(axis, worldUp));
  if (p.rollDeg !== 0) {
    right = rotateAxis(right, axis, deg2rad(p.rollDeg));
  }
  return right;
};

const crossSafe = (a: Vec3, b: Vec3): Vec3 => {
  const c = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
  const l = Math.hypot(c.x, c.y, c.z);
  return l < 1e-9 ? v3(1, 0, 0) : { x: c.x / l, y: c.y / l, z: c.z / l };
};

/** 投影机画面的上方向 */
const projectorUp = (p: Projector): Vec3 => {
  const axis = projectorAxis(p);
  const right = projectorRight(p);
  return normalize(crossSafe(right, axis));
};

/** 世界方向在某投影机画面内的归一化坐标（x/y ∈ [-1,1]），超出覆盖返回 null */
export const projectIntoProjector = (
  p: Projector,
  dir: Vec3,
): { nx: number; ny: number } | null => {
  const axis = projectorAxis(p);
  // 视场边界判定：与光轴夹角必须落在矩形光锥内
  const right = projectorRight(p);
  const up = projectorUp(p);
  const d = normalize(dir);
  const xComp = dot3(d, right);
  const yComp = dot3(d, up);
  const zComp = dot3(d, axis);
  if (zComp <= 0) return null;
  // 矩形光锥：半角对应的切平面坐标
  const halfW = Math.tan(deg2rad(p.widthDeg / 2));
  const halfH = Math.tan(deg2rad(p.heightDeg / 2));
  const nx = xComp / zComp / halfW;
  const ny = yComp / zComp / halfH;
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;
  return { nx, ny };
};

const dot3 = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * 边缘融合权重：距画面覆盖边缘 blendWidthDeg（角度）内做 0→1 的 gamma 过渡。
 * 角度换算与 warp 着色器遮罩模式严格同式（切平面反投影 atan）。
 * 返回 [0,1]，0 = 完全在融合带外/不属于该投影机。
 */
export const projectorBlendWeight = (p: Projector, dir: Vec3): number => {
  const uv = projectIntoProjector(p, dir);
  if (!uv) return 0;
  if (p.blendWidthDeg <= 0) return 1;
  // 归一化边缘距离 → 角距离（弧度）：切平面半角 atan(tan(覆盖半角))
  const edgeN = Math.min(1 - Math.abs(uv.nx), 1 - Math.abs(uv.ny));
  const edgeRad =
    (edgeN / 2) *
    Math.atan(
      Math.min(
        Math.tan(deg2rad(p.widthDeg / 2)),
        Math.tan(deg2rad(p.heightDeg / 2)),
      ),
    );
  const t = clamp(edgeRad / deg2rad(p.blendWidthDeg), 0, 1);
  return Math.pow(t, p.blendGamma);
};

/** 某世界方向被哪些启用的投影机覆盖（含各自权重） */
export const coveringProjectors = (
  projectors: Projector[],
  dir: Vec3,
): Array<{ projector: Projector; weight: number }> =>
  projectors
    .filter((p) => p.enabled)
    .map((projector) => ({
      projector,
      weight: projectorBlendWeight(projector, dir),
    }))
    .filter((x) => x.weight > 0);

/** 多机融合后的总权重（用于重叠区亮度归一判断） */
export const totalCoverage = (
  projectors: Projector[],
  dir: Vec3,
): number =>
  coveringProjectors(projectors, dir).reduce((s, x) => s + x.weight, 0);

/**
 * 座位视场：从座位位置看向球幕上某「天顶参考点」时的局部观察方向。
 * 球幕半径 R = diameter/2；球心在原点，座位 s（z 通常为负）。
 * 给定世界方向 d（球心指向幕面点），幕面点 = R·d；
 * 座位视线 = normalize(R·d − s)，再转换回「以座位为中心、z 向上」的观察方向。
 */
export const seatViewDir = (
  seat: Seat,
  domeDir: Vec3,
  settings: Settings,
): Vec3 => {
  const r = settings.domeDiameterM / 2;
  const surface = v3(
    domeDir.x * r,
    domeDir.y * r,
    domeDir.z * r,
  );
  const eye = v3(seat.x, seat.y, seat.z);
  return normalize({
    x: surface.x - eye.x,
    y: surface.y - eye.y,
    z: surface.z - eye.z,
  });
};

/** 座位到球幕顶点的方向（用于座位预览画面中心对齐） */
export const seatZenithDir = (seat: Seat, settings: Settings): Vec3 =>
  seatViewDir(seat, v3(0, 0, 1), settings);

/** 座位处观察球幕某点的角畸变：座位视线与球心法线（domeDir）的夹角（度） */
export const seatDistortionAngle = (
  seat: Seat,
  domeDir: Vec3,
  settings: Settings,
): number => {
  const view = seatViewDir(seat, domeDir, settings);
  return (angleBetween(view, normalize(domeDir)) * 180) / Math.PI;
};

/** 生成座位网格（矩形排列），用于默认工程与设置页快速布置 */
export const generateSeatGrid = (
  rows: number,
  cols: number,
  spacingM: number,
  z = -3,
): Seat[] => {
  const seats: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      seats.push({
        id: `seat-${r}-${c}`,
        name: `${r + 1}排${c + 1}座`,
        x: (c - (cols - 1) / 2) * spacingM,
        y: (r - (rows - 1) / 2) * spacingM,
        z,
      });
    }
  }
  return seats;
};

/** 球幕倾角参数透传（供 UI 与 warp 复用同一约定） */
export const applyTilt = (dir: Vec3, settings: Settings): Vec3 =>
  localToWorld(dir, {
    fovDeg: settings.fov,
    tiltDeg: settings.domeTiltDeg,
    tiltAzimuthDeg: settings.domeTiltAzimuthDeg,
  });

export const removeTilt = (dir: Vec3, settings: Settings): Vec3 =>
  worldToLocal(dir, {
    fovDeg: settings.fov,
    tiltDeg: settings.domeTiltDeg,
    tiltAzimuthDeg: settings.domeTiltAzimuthDeg,
  });

export { toHoriz };
