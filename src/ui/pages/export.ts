/** 渲染导出页: PNG 序列导出, 带进度与取消 */
import { CancelToken, downloadBlob, exportPngSequence, ExportProgress } from '../../render/exporter';
import { button, el, field, numberInput, section, select } from '../widgets';
import { AppContext } from '../router';

export function mountExport(root: HTMLElement, ctx: AppContext): (() => void) | void {
  const maybeShow = ctx.currentShow();
  if (!maybeShow) {
    root.append(el('p', { class: 'empty', text: '请先在「节目列表」中创建或选择一个节目。' }));
    return;
  }
  const show = maybeShow;

  let token: CancelToken | null = null;

  const progressBar = el('div', { class: 'progress-bar' });
  const progressText = el('span', { class: 'muted', text: '就绪' });
  const progressWrap = el('div', { class: 'progress' }, progressBar);
  const startBtn = button('开始导出', () => void start(), 'primary');
  const cancelBtn = button('取消', () => token?.cancel(), 'danger');
  cancelBtn.disabled = true;

  const fpsInput = numberInput(show.fps, { min: 1, max: 120, onchange: () => {} });
  const startInput = numberInput(0, { min: 0, step: 0.1, onchange: () => {} });
  const endInput = numberInput(show.duration, { min: 0, step: 0.1, onchange: () => {} });
  const resSelect = select(
    ['1024', '2048', '4096'].map((r) => ({ value: r, label: `${r} × ${r}` })),
    String(show.dome.resolution) as '1024' | '2048' | '4096',
    () => {},
  );
  const prefixInput = el('input', { type: 'text', value: 'frame_' }) as HTMLInputElement;

  root.append(
    el('div', { class: 'page-header' }, el('h2', { text: `渲染导出 — ${show.name}` })),
    el('div', { class: 'export-layout' },
      section('导出参数',
        el('p', { class: 'muted', text: `球幕: ${show.dome.fovDeg}° 视场, ${show.dome.tiltDeg}° 倾角; 输出等距鱼眼 domemaster PNG 序列, 打包为 ZIP 下载。` }),
        field('帧率 (fps)', fpsInput),
        field('起始时间 (秒)', startInput),
        field('结束时间 (秒)', endInput),
        field('分辨率', resSelect),
        field('文件名前缀', prefixInput),
      ),
      section('导出',
        el('div', { class: 'toolbar' }, startBtn, cancelBtn),
        progressWrap,
        progressText,
      ),
    ),
  );

  function setProgress(p: ExportProgress) {
    progressBar.style.width = `${p.percent}%`;
    if (p.phase === 'render') progressText.textContent = `渲染帧 ${p.frame} / ${p.total} (${p.percent.toFixed(0)}%)`;
    else if (p.phase === 'compress') progressText.textContent = `打包 ZIP… ${p.percent.toFixed(0)}%`;
    else if (p.phase === 'done') progressText.textContent = `完成, 共 ${p.total} 帧`;
    else if (p.phase === 'cancelled') progressText.textContent = '已取消';
  }

  async function start() {
    const fps = Math.max(1, parseFloat(fpsInput.value) || show.fps);
    const startSec = Math.max(0, parseFloat(startInput.value) || 0);
    const endSec = Math.min(show.duration, parseFloat(endInput.value) || show.duration);
    if (endSec <= startSec) { alert('结束时间必须大于起始时间'); return; }
    const resolution = Number(resSelect.value);

    startBtn.disabled = true;
    cancelBtn.disabled = false;
    token = new CancelToken();
    try {
      const blob = await exportPngSequence({
        show, settings: ctx.settings,
        stars: ctx.stars.map((s) => [s[0], s[1], s[2]] as [number, number, number]),
        startSec, endSec, fps, resolution,
        filePrefix: prefixInput.value || 'frame_',
      }, setProgress, token);
      if (blob) {
        downloadBlob(blob, `${show.name}-${show.dome.fovDeg}deg-${resolution}px.zip`);
      }
    } catch (e) {
      progressText.textContent = `导出失败: ${e instanceof Error ? e.message : e}`;
    } finally {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      token = null;
    }
  }

  return () => { token?.cancel(); };
}
