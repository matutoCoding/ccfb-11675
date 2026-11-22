// 鱼眼映射 GPU 校验：
// 1) 用 warp 着色器以「方向编码模式」离屏渲染一帧（每个像素颜色 = GLSL 算出的世界方向）
// 2) readPixels 解码，与 src/math/fisheye.ts 的 pixelToDir 逐像素比对
// 3) 以「输出像素」为单位报告最大/平均/RMS 误差，并核对 FOV 圆外黑场
//
// 这是「球面上任意方向在 domemaster 里的像素位置误差 < 半个像素」的直接验证：
// GLSL 与 TS 共享同一公式，二者偏差只可能来自着色器实现差异或精度问题。

import { Settings } from '../types';
import { DomeEngine } from './dome-engine';
import { pixelToDir, DomeGeometry, dirToPixel } from '../math/fisheye';
import { Vec3 } from '../math/vec3';

export interface ValidationResult {
  size: number;
  samples: number;
  /** 方向不一致的角度误差（度） */
  maxAngleErrorDeg: number;
  meanAngleErrorDeg: number;
  rmsAngleErrorDeg: number;
  /** 换算成输出像素的位置误差（角误差 ÷ 每像素角分辨率） */
  maxPixelError: number;
  meanPixelError: number;
  rmsPixelError: number;
  /** 圆外黑场像素是否全部正确 */
  outsideCircleCorrect: boolean;
  outsideCircleSamples: number;
  passed: boolean;
  thresholdPx: number;
}

const angleBetweenEncoded = (a: Vec3, b: Vec3): number => {
  const dot = Math.max(
    -1,
    Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z),
  );
  return Math.acos(dot);
};

/**
 * 执行 GPU 校验。
 * @param size 校验画幅边长（建议 512/1024，全像素扫描）
 * @param stride 像素抽样步长（1 = 全量）
 */
export const validateFisheyeOnGPU = (
  engine: DomeEngine,
  settings: Settings,
  size = 512,
  stride = 1,
): ValidationResult => {
  const target = engine.createOffscreenTarget(size);
  engine.setOutputTarget(target);
  // 模式 1：方向编码，不依赖场景内容
  engine.renderWarpOnly(settings, 1, [], null);
  const pixels = engine.readPixels(size);
  engine.setOutputTarget(null);
  engine.deleteTarget(target);

  const g: DomeGeometry = {
    fovDeg: settings.fov,
    tiltDeg: settings.domeTiltDeg,
    tiltAzimuthDeg: settings.domeTiltAzimuthDeg,
  };

  // 每像素角分辨率（度/像素）：等距鱼眼下全画面恒定
  const radiusPx = (size - 1) / 2;
  const degPerPx = settings.fov / 2 / radiusPx;

  let maxAng = 0;
  let sumAng = 0;
  let sumSq = 0;
  let samples = 0;
  let outsideOk = true;
  let outsideCount = 0;

  for (let py = 0; py < size; py += stride) {
    for (let px = 0; px < size; px += stride) {
      const i = (py * size + px) * 4;
      // readPixels 原点在左下，而公式像素坐标原点在左上 → 翻转 y
      const glY = size - 1 - py;
      const j = (glY * size + px) * 4;
      const gpuDir: Vec3 = {
        x: (pixels[j] / 255) * 2 - 1,
        y: (pixels[j + 1] / 255) * 2 - 1,
        z: (pixels[j + 2] / 255) * 2 - 1,
      };
      void i;

      const tsDir = pixelToDir(px, py, size, g);
      const nx = (px / (size - 1)) * 2 - 1;
      const ny = 1 - (py / (size - 1)) * 2;
      const r = Math.hypot(nx, ny);

      if (r > 1 || !tsDir) {
        // 圆外：编码着色器输出黑色 (0,0,0) → 解码为 (-1,-1,-1)
        outsideCount++;
        const isBlack =
          pixels[j] === 0 && pixels[j + 1] === 0 && pixels[j + 2] === 0;
        if (!isBlack) outsideOk = false;
        continue;
      }

      const ang = angleBetweenEncoded(gpuDir, tsDir);
      maxAng = Math.max(maxAng, ang);
      sumAng += ang;
      sumSq += ang * ang;
      samples++;
    }
  }

  const maxAngDeg = (maxAng * 180) / Math.PI;
  const meanAngDeg = samples ? (sumAng / samples) * (180 / Math.PI) : 0;
  const rmsAngDeg = samples
    ? Math.sqrt(sumSq / samples) * (180 / Math.PI)
    : 0;

  const maxPx = maxAngDeg / degPerPx;
  const meanPx = meanAngDeg / degPerPx;
  const rmsPx = rmsAngDeg / degPerPx;

  return {
    size,
    samples,
    maxAngleErrorDeg: maxAngDeg,
    meanAngleErrorDeg: meanAngDeg,
    rmsAngleErrorDeg: rmsAngDeg,
    maxPixelError: maxPx,
    meanPixelError: meanPx,
    rmsPixelError: rmsPx,
    outsideCircleCorrect: outsideOk,
    outsideCircleSamples: outsideCount,
    thresholdPx: 0.5,
    passed: maxPx < 0.5 && outsideOk,
  };
};

/**
 * 反向核对：取一组已知世界方向，TS 算像素位置，再读该像素 GLSL 编码的方向，
 * 检查二者是否一致（面向用户的「任意球面方向」验证）。
 */
export const validateKnownDirections = (
  engine: DomeEngine,
  settings: Settings,
  dirs: Vec3[],
  size = 512,
): Array<{ dir: Vec3; pixel: { px: number; py: number }; errorPx: number; inFrame: boolean }> => {
  const target = engine.createOffscreenTarget(size);
  engine.setOutputTarget(target);
  engine.renderWarpOnly(settings, 1, [], null);
  const pixels = engine.readPixels(size);
  engine.setOutputTarget(null);
  engine.deleteTarget(target);

  const g: DomeGeometry = {
    fovDeg: settings.fov,
    tiltDeg: settings.domeTiltDeg,
    tiltAzimuthDeg: settings.domeTiltAzimuthDeg,
  };
  const degPerPx = settings.fov / 2 / ((size - 1) / 2);

  return dirs.map((dir) => {
    const pixel = dirToPixel(dir, size, g);
    if (!pixel) return { dir, pixel: { px: -1, py: -1 }, errorPx: NaN, inFrame: false };
    const px = Math.round(pixel.px);
    const py = Math.round(pixel.py);
    const glY = size - 1 - py;
    const j = (glY * size + px) * 4;
    const gpuDir: Vec3 = {
      x: (pixels[j] / 255) * 2 - 1,
      y: (pixels[j + 1] / 255) * 2 - 1,
      z: (pixels[j + 2] / 255) * 2 - 1,
    };
    const ang = angleBetweenEncoded(gpuDir, dir);
    return {
      dir,
      pixel: { px, py },
      errorPx: ((ang * 180) / Math.PI) / degPerPx,
      inFrame: true,
    };
  });
};
