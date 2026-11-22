// 帧导出：canvas → PNG Blob；ZIP（store，无压缩）打包；带进度与取消

import { ExportProgress } from '../types';

export type { ExportProgress };

export const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 编码失败'));
    }, 'image/png');
  });

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const pad4 = (n: number): number => (n + 3) & ~3;

// CRC32 表（ZIP 标准）
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const DOS_TIME = (date: Date): { time: number; date: number } => ({
  time:
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f),
  date:
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x1f) << 5) |
    (date.getDate() & 0x1f),
});

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** 极简 ZIP writer（store 模式，method=0），浏览器端零依赖 */
export const buildZip = (entries: ZipEntry[], now = new Date()): Blob => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date: dosDate } = DOS_TIME(now);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // 本地文件头 30 字节
    const local = new ArrayBuffer(30);
    const lv = new DataView(local);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // 版本
    lv.setUint16(6, 0, true); // 标志
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, time, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local), nameBytes, entry.data);

    // 中央目录头 46 字节
    const cd = new ArrayBuffer(46);
    const cv = new DataView(cd);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.push(new Uint8Array(cd), nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const centralOffset = offset;

  const end = new ArrayBuffer(22);
  const ev = new DataView(end);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  return new Blob(
    [
      ...chunks.map((c) => new Uint8Array(c)),
      ...central.map((c) => new Uint8Array(c)),
      new Uint8Array(end),
    ],
    {
      type: 'application/zip',
    },
  );
};

const blobToBytes = async (blob: Blob): Promise<Uint8Array> =>
  new Uint8Array(await blob.arrayBuffer());

export interface FrameRenderContext {
  /** 渲染第 frame 帧到 engine 的当前 canvas（由调用方实现） */
  renderFrame: (frame: number) => Promise<void> | void;
  canvas: HTMLCanvasElement;
}

/**
 * 逐帧导出 PNG 序列。
 * @returns 取消或完成时结束；每帧回调 onProgress
 */
export const exportFrameSequence = async (
  job: {
    startFrame: number;
    endFrame: number;
    resolution: number;
    prefix: string;
    asZip: boolean;
  },
  ctx: FrameRenderContext,
  onProgress: (p: ExportProgress) => void,
  shouldCancel: () => boolean,
): Promise<{ cancelled: boolean; count: number }> => {
  const total = job.endFrame - job.startFrame + 1;
  const entries: ZipEntry[] = [];
  let count = 0;

  for (let frame = job.startFrame; frame <= job.endFrame; frame++) {
    if (shouldCancel()) {
      onProgress({
        frame,
        total,
        cancelled: true,
        done: true,
      });
      return { cancelled: true, count };
    }

    await ctx.renderFrame(frame);
    // 等待 GPU 提交完成，保证 readPixels/toBlob 数据就绪
    const blob = await canvasToPngBlob(ctx.canvas);
    const name = `${job.prefix}_${String(frame).padStart(5, '0')}.png`;

    if (job.asZip) {
      entries.push({ name, data: await blobToBytes(blob) });
    } else {
      downloadBlob(blob, name);
      // 浏览器多文件下载节流
      await new Promise((r) => setTimeout(r, 120));
    }

    count++;
    onProgress({ frame, total, cancelled: false, done: frame === job.endFrame });
  }

  if (job.asZip && entries.length > 0) {
    const zip = buildZip(entries);
    downloadBlob(zip, `${job.prefix}_frames.zip`);
  }
  return { cancelled: false, count };
};

export { pad4 };
