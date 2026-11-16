/**
 * 鱼眼映射精度自检:
 * 用自检着色器把每个输出像素对应的方向 (theta, az 各 16 位编码) 渲染出来,
 * 读回解码得到方向, 再用 CPU 参考公式 directionToPixel 计算该方向应在的像素,
 * 与实际像素坐标比较。整个 GPU 映射链路的误差必须 < 0.5 像素。
 */
import { directionToPixel, FisheyeParams, pixelToDirection } from '../core/fisheye';
import { DomeRenderer } from './renderer';

export interface SelfTestResult {
  params: FisheyeParams;
  samples: number;
  maxErrPx: number;
  meanErrPx: number;
  worst: { px: number; py: number; err: number } | null;
  pass: boolean;
}

export function runGpuSelfTest(
  params: FisheyeParams,
  step = 7,
): SelfTestResult {
  // 自检需要读回 alpha 通道(16 位编码的字节), 必须用 alpha:true + 非预乘上下文
  const canvas = document.createElement('canvas');
  canvas.width = params.size;
  canvas.height = params.size;
  const renderer = new DomeRenderer(canvas, 256, { alpha: true, premultipliedAlpha: false });
  renderer.renderSelfTest(params, 0); // x, y
  const bufXY = renderer.readPixels();
  renderer.renderSelfTest(params, 1); // z
  const bufZ = renderer.readPixels();
  const { width: w, height: h } = renderer.canvasSize;
  const side = Math.min(w, h);
  const ox = Math.floor((w - side) / 2), oy = Math.floor((h - side) / 2);

  const p: FisheyeParams = { ...params, size: side };
  let samples = 0, maxErr = 0, sumErr = 0;
  let worst: SelfTestResult['worst'] = null;

  const dec16 = (hi: number, lo: number) => ((hi << 8) | lo) / 65535 * 2 - 1;

  for (let j = 0; j < side; j += step) {
    for (let i = 0; i < side; i += step) {
      const idx = ((oy + j) * w + (ox + i)) * 4;
      const x = dec16(bufXY[idx], bufXY[idx + 1]);
      const y = dec16(bufXY[idx + 2], bufXY[idx + 3]);
      const z = dec16(bufZ[idx], bufZ[idx + 1]);
      if (x === -1 && y === -1 && z === -1) continue; // 视场外(编码 0,0)
      const dir: [number, number, number] = [x, y, z];
      const expected = directionToPixel(dir, p);
      if (!expected) continue;
      // 实际像素(图像坐标, 行向下, 像素中心 i+0.5)
      const ax = i + 0.5;
      const ay = side - (j + 0.5);
      const err = Math.hypot(expected[0] - ax, expected[1] - ay);
      samples++;
      sumErr += err;
      if (err > maxErr) {
        maxErr = err;
        worst = { px: ax, py: ay, err };
      }
    }
  }

  return {
    params,
    samples,
    maxErrPx: maxErr,
    meanErrPx: samples ? sumErr / samples : 0,
    worst,
    pass: maxErr < 0.5,
  };
}

/** CPU 公式自闭环: 方向 → 像素 → 方向, 角度误差应接近 0 */
export function cpuRoundTripError(params: FisheyeParams, count = 10000): number {
  let maxErr = 0;
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let k = 0; k < count; k++) {
    // 视场内随机方向
    const halfFov = (params.fovDeg / 2) * (Math.PI / 180);
    const theta = rand() * halfFov;
    const az = rand() * 2 * Math.PI;
    const d: [number, number, number] = [
      Math.sin(theta) * Math.sin(az),
      Math.sin(theta) * Math.cos(az),
      Math.cos(theta),
    ];
    const px = directionToPixel(d, params);
    if (!px) continue;
    const d2 = pixelToDirection(px[0], px[1], params);
    if (!d2) continue;
    const dot = d[0] * d2[0] + d[1] * d2[1] + d[2] * d2[2];
    const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (ang > maxErr) maxErr = ang;
  }
  return maxErr;
}
