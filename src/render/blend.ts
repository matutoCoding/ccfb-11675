/**
 * 多投影机分区与边缘融合计算。
 * 每台投影机覆盖 domemaster 上一个矩形区域(归一化坐标),
 * 融合带内权重按余弦滚降 + 伽马调整, 叠加后理想情况全画面总增益 ≈ 1。
 */
import { Projector } from '../core/types';

/** 单台投影机在归一化坐标 (x, y) 处的权重 */
export function projectorWeight(pj: Projector, x: number, y: number, resolution: number): number {
  if (!pj.enabled) return 0;
  const x0 = pj.cx - pj.w / 2, x1 = pj.cx + pj.w / 2;
  const y0 = pj.cy - pj.h / 2, y1 = pj.cy + pj.h / 2;
  const d = Math.min(x - x0, x1 - x, y - y0, y1 - y);
  if (d <= 0) return 0;
  const b = pj.blendPx / resolution; // 融合带宽(归一化)
  const t = b > 0 ? Math.min(1, d / b) : 1;
  const roll = 0.5 - 0.5 * Math.cos(Math.PI * t); // 余弦滚降 0..1
  return Math.pow(roll, pj.gamma) * pj.gain;
}

/** 所有投影机在该点的总增益 */
export function totalGain(projectors: Projector[], x: number, y: number, resolution: number): number {
  let sum = 0;
  for (const pj of projectors) sum += projectorWeight(pj, x, y, resolution);
  return sum;
}

/** 把总增益图画到 2D canvas(热力图: 不足=蓝, 正常=绿, 过曝=红) */
export function drawGainMap(
  canvas: HTMLCanvasElement,
  projectors: Projector[],
  resolution: number,
  samples = 200,
): void {
  canvas.width = samples;
  canvas.height = samples;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(samples, samples);
  for (let j = 0; j < samples; j++) {
    for (let i = 0; i < samples; i++) {
      const x = (i + 0.5) / samples;
      const y = (j + 0.5) / samples;
      const g = totalGain(projectors, x, y, resolution);
      const idx = (j * samples + i) * 4;
      let r = 0, gg = 0, b = 0;
      if (g <= 0) { r = 0; gg = 0; b = 0; }
      else if (g < 1) { const t = g; r = 0; gg = Math.round(180 * t); b = Math.round(255 * (1 - t) + 60 * t); }
      else if (g <= 1.15) { r = 40; gg = 220; b = 40; }
      else { const t = Math.min(1, (g - 1.15) / 0.85); r = Math.round(40 + 215 * t); gg = Math.round(220 * (1 - t)); b = 40; }
      img.data[idx] = r; img.data[idx + 1] = gg; img.data[idx + 2] = b; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** 在 2D 叠加层上画投影机分区框与融合带 */
export function drawProjectorOverlay(
  ctx: CanvasRenderingContext2D,
  projectors: Projector[],
  size: number,
  resolution: number,
  selectedId: string | null,
): void {
  ctx.clearRect(0, 0, size, size);
  for (const pj of projectors) {
    if (!pj.enabled) continue;
    const x = (pj.cx - pj.w / 2) * size, y = (pj.cy - pj.h / 2) * size;
    const w = pj.w * size, h = pj.h * size;
    const b = (pj.blendPx / resolution) * size;

    // 融合带(半透明渐变填充)
    ctx.fillStyle = pj.color + '33';
    ctx.fillRect(x, y, w, h);
    // 融合带内边界(实色区)
    ctx.fillStyle = pj.color + '55';
    ctx.fillRect(x + b, y + b, Math.max(0, w - 2 * b), Math.max(0, h - 2 * b));

    ctx.strokeStyle = pj.color;
    ctx.lineWidth = pj.id === selectedId ? 3 : 1.5;
    ctx.strokeRect(x, y, w, h);
    if (b > 1) {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + b, y + b, Math.max(0, w - 2 * b), Math.max(0, h - 2 * b));
      ctx.setLineDash([]);
    }
    ctx.fillStyle = pj.color;
    ctx.font = '12px system-ui';
    ctx.fillText(pj.name, x + 4, y + 14);
  }
}
