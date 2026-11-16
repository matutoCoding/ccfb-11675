/**
 * PNG 序列导出: 逐帧渲染 domemaster → PNG → ZIP 下载。
 * 支持进度回调与取消; 浏览器支持时也可直接写入用户选择的目录。
 */
import JSZip from 'jszip';
import { sampleProps } from '../core/animation';
import { AppSettings, Show } from '../core/types';
import { FisheyeParams } from '../core/fisheye';
import { contentFromProps, DomeRenderer, skyUniforms } from './renderer';

export interface ExportOptions {
  show: Show;
  settings: AppSettings;
  stars: [number, number, number][];
  startSec: number;
  endSec: number;
  fps: number;
  resolution: number;
  filePrefix: string;
}

export interface ExportProgress {
  phase: 'render' | 'compress' | 'done' | 'cancelled';
  frame: number;
  total: number;
  percent: number;
}

export class CancelToken {
  cancelled = false;
  cancel() { this.cancelled = true; }
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportPngSequence(
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  token: CancelToken,
): Promise<Blob | null> {
  const { show, settings } = opts;
  const total = Math.max(1, Math.round((opts.endSec - opts.startSec) * opts.fps));
  const canvas = document.createElement('canvas');
  canvas.width = opts.resolution;
  canvas.height = opts.resolution;
  const renderer = new DomeRenderer(canvas, settings.cubeSize);
  renderer.setStars(opts.stars);

  const params: FisheyeParams = {
    size: opts.resolution,
    fovDeg: show.dome.fovDeg,
    tiltDeg: show.dome.tiltDeg,
  };
  const zip = new JSZip();

  for (let f = 0; f < total; f++) {
    if (token.cancelled) {
      onProgress({ phase: 'cancelled', frame: f, total, percent: (f / total) * 100 });
      return null;
    }
    const t = opts.startSec + f / opts.fps;
    const props = sampleProps(show, t, settings.magLimit);
    const sky = skyUniforms(props);
    const content = contentFromProps(props, {
      planets: show.planets, showSun: show.showSun, showMoon: show.showMoon,
      showGrid: show.showGrid, exposure: settings.starExposure,
    });
    renderer.render(params, sky, content);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('帧编码失败');
    zip.file(`${opts.filePrefix}${String(f).padStart(5, '0')}.png`, blob);
    onProgress({ phase: 'render', frame: f + 1, total, percent: ((f + 1) / total) * 90 });
    await yieldToUi();
  }

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE', streamFiles: true },
    (meta) => {
      if (!token.cancelled) {
        onProgress({ phase: 'compress', frame: total, total, percent: 90 + meta.percent * 0.1 });
      }
    },
  );
  if (token.cancelled) {
    onProgress({ phase: 'cancelled', frame: total, total, percent: 0 });
    return null;
  }
  onProgress({ phase: 'done', frame: total, total, percent: 100 });
  return blob;
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
