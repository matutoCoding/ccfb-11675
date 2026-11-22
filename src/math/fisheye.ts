// 等距鱼眼（equidistant / equidistant-azimuthal domemaster）映射 —— 全系统精度基准
//
// 输出图约定（domemaster 行业惯例）：
//   正方形画幅，圆内切于画幅；画面中心 = 球幕顶点（天顶方向）
//   归一化坐标 (nx, ny) ∈ [-1,1]，ny 向上；r = hypot(nx,ny)，圆外 r>1 为黑场
//   等距关系：theta = r * (FOV/2)，theta 为方向与天顶轴的夹角
//   局部方向 d = (sinθ·nx/r, sinθ·ny/r, cosθ)
//
// 倾斜球幕：局部球幕轴先绕水平轴旋转 tiltRad 再进入世界坐标。
// 本文件的 TS 实现与 src/renderer/shaders/dome-warp.fs 的 GLSL 实现必须逐式对应，
// 由 src/renderer/fisheyeValidate.ts 在 GPU 上逐像素核对，误差阈值 0.5 像素。

import {
  Vec3,
  v3,
  normalize,
  rotateAxis,
  cross,
  fromHoriz,
  deg2rad,
  clamp,
} from './vec3';

export interface DomeGeometry {
  /** 总视场角（度）：180 或 210 */
  fovDeg: number;
  /** 球幕倾角（度） */
  tiltDeg: number;
  /** 倾斜朝向方位角（度，北=0 顺时针），球幕轴向该方位倾斜 */
  tiltAzimuthDeg: number;
}

/** 倾斜旋转轴（世界系，水平）：球幕天顶向 tiltAzimuth 方向倾倒 */
export const tiltAxis = (g: DomeGeometry): Vec3 => {
  const tiltDir = fromHoriz(deg2rad(g.tiltAzimuthDeg), 0);
  // k = zWorld × tiltDir，使 R(k,tilt)·zWorld 偏向 tiltDir
  return normalize(cross(v3(0, 0, 1), tiltDir));
};

/** 球幕局部坐标 → 世界坐标（施加倾角） */
export const localToWorld = (dLocal: Vec3, g: DomeGeometry): Vec3 =>
  rotateAxis(dLocal, tiltAxis(g), deg2rad(g.tiltDeg));

/** 世界坐标 → 球幕局部坐标（撤销倾角） */
export const worldToLocal = (dWorld: Vec3, g: DomeGeometry): Vec3 =>
  rotateAxis(dWorld, tiltAxis(g), -deg2rad(g.tiltDeg));

/**
 * 归一化画面坐标 → 世界方向。
 * 返回 null 表示该像素在鱼眼圆外（FOV 不覆盖）。
 */
export const ndcToDir = (nx: number, ny: number, g: DomeGeometry): Vec3 | null => {
  const r = Math.hypot(nx, ny);
  if (r > 1) return null;
  const halfFov = deg2rad(g.fovDeg / 2);
  const theta = r * halfFov; // 等距鱼眼核心式
  const sinT = Math.sin(theta);
  const dLocal: Vec3 =
    r < 1e-12
      ? v3(0, 0, 1)
      : v3((sinT * nx) / r, (sinT * ny) / r, Math.cos(theta));
  return localToWorld(dLocal, g);
};

/**
 * 世界方向 → 归一化画面坐标。
 * 返回 null 表示该方向超出 FOV（不会出现在画面圆内）。
 */
export const dirToNdc = (dWorld: Vec3, g: DomeGeometry): { nx: number; ny: number } | null => {
  const d = worldToLocal(normalize(dWorld), g);
  const halfFov = deg2rad(g.fovDeg / 2);
  const cosTheta = clamp(d.z, -1, 1);
  const theta = Math.acos(cosTheta);
  if (theta > halfFov + 1e-9) return null;
  const r = theta / halfFov; // 等距鱼眼核心式的逆
  if (theta < 1e-12) return { nx: 0, ny: 0 };
  const sinT = Math.sin(theta);
  return {
    nx: (r * d.x) / sinT,
    ny: (r * d.y) / sinT,
  };
};

/** 像素坐标（原点左上，y 向下）→ 世界方向 */
export const pixelToDir = (
  px: number,
  py: number,
  size: number,
  g: DomeGeometry,
): Vec3 | null => {
  const nx = (px / (size - 1)) * 2 - 1;
  const ny = 1 - (py / (size - 1)) * 2;
  return ndcToDir(nx, ny, g);
};

/** 世界方向 → 像素坐标（原点左上，y 向下） */
export const dirToPixel = (
  dWorld: Vec3,
  size: number,
  g: DomeGeometry,
): { px: number; py: number } | null => {
  const ndc = dirToNdc(dWorld, g);
  if (!ndc) return null;
  return {
    px: ((ndc.nx + 1) / 2) * (size - 1),
    py: ((1 - ndc.ny) / 2) * (size - 1),
  };
};

/** 鱼眼圆半径（像素） */
export const circleRadiusPx = (size: number): number => (size - 1) / 2;

/** 给定角分辨率（弧度/像素），用于精度换算：
 * 等距鱼眼下每像素角距恒定 = halfFov / radiusPx */
export const angularResolutionRadPerPx = (size: number, g: DomeGeometry): number =>
  deg2rad(g.fovDeg / 2) / circleRadiusPx(size);
