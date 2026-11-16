/** 投影校正页: 球幕参数(FOV/倾角/分辨率)、多投影机分区、边缘融合 */
import { drawGainMap, drawProjectorOverlay } from '../../render/blend';
import { PROJECTOR_COLORS, Projector } from '../../core/types';
import { button, checkbox, el, field, numberInput, section, select, slider } from '../widgets';
import { AppContext } from '../router';
import { PreviewCanvas } from '../preview';
import { sampleProps } from '../../core/animation';

export function mountCalibration(root: HTMLElement, ctx: AppContext): (() => void) | void {
  const maybeShow = ctx.currentShow();
  if (!maybeShow) {
    root.append(el('p', { class: 'empty', text: '请先在「节目列表」中创建或选择一个节目。' }));
    return;
  }
  const show = maybeShow;

  let selectedId: string | null = show.projectors[0]?.id ?? null;
  let viewMode: 'overlay' | 'gainmap' = 'overlay';

  const previewBox = el('div', { class: 'preview-box' });
  const overlay = el('canvas', { class: 'label-overlay' }) as HTMLCanvasElement;
  previewBox.append(overlay);

  const rightPanels = el('div', { class: 'side-panels' });
  const modeHint = el('span', { class: 'muted' });

  root.append(
    el('div', { class: 'page-header' },
      el('h2', { text: `投影校正 — ${show.name}` }),
      modeHint),
    el('div', { class: 'scene-layout' },
      el('div', { class: 'scene-main' }, previewBox),
      rightPanels,
    ),
  );

  const preview = new PreviewCanvas(previewBox, ctx, 640);
  previewBox.insertBefore(preview.canvas, overlay);

  function save() { ctx.store.update(show); }

  function refresh() {
    const props = sampleProps(show, 0, ctx.settings.magLimit);
    preview.renderShow(show, props, ctx, false);
    drawOverlay();
  }

  function drawOverlay() {
    const size = preview.canvas.width;
    overlay.width = size;
    overlay.height = size;
    const g = overlay.getContext('2d');
    if (!g) return;
    if (viewMode === 'overlay') {
      drawProjectorOverlay(g, show.projectors, size, show.dome.resolution, selectedId);
      modeHint.textContent = '实线=投影区域, 虚线=融合带内界';
    } else {
      // 增益图
      const tmp = document.createElement('canvas');
      drawGainMap(tmp, show.projectors, show.dome.resolution, 200);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, size, size);
      g.globalAlpha = 0.85;
      g.drawImage(tmp, 0, 0, size, size);
      g.globalAlpha = 1;
      modeHint.textContent = '增益图: 蓝=欠曝, 绿=正常(≈1.0), 红=过曝';
    }
  }

  function projectorEditor(pj: Projector): HTMLElement {
    const refreshSlider = () => { save(); refresh(); };
    return el('div', { class: `projector-card ${pj.id === selectedId ? 'selected' : ''}` },
      el('div', { class: 'projector-head' },
        el('span', { class: 'planet-color', style: { background: pj.color } }),
        el('input', {
          class: 'pj-name', value: pj.name,
          onchange: (e: Event) => { pj.name = (e.target as HTMLInputElement).value; save(); },
        }),
        checkbox('启用', pj.enabled, (v) => { pj.enabled = v; refreshSlider(); }),
        button('选中', () => { selectedId = pj.id; buildPanels(); drawOverlay(); }, 'small'),
        button('删除', () => {
          show.projectors = show.projectors.filter((p) => p.id !== pj.id);
          if (selectedId === pj.id) selectedId = show.projectors[0]?.id ?? null;
          save(); buildPanels(); refresh();
        }, 'small danger'),
      ),
      el('div', { class: 'projector-grid' },
        field('中心 X', slider(pj.cx, 0, 1, 0.005, (v) => { pj.cx = v; refreshSlider(); }).wrap),
        field('中心 Y', slider(pj.cy, 0, 1, 0.005, (v) => { pj.cy = v; refreshSlider(); }).wrap),
        field('宽度', slider(pj.w, 0.05, 1, 0.005, (v) => { pj.w = v; refreshSlider(); }).wrap),
        field('高度', slider(pj.h, 0.05, 1, 0.005, (v) => { pj.h = v; refreshSlider(); }).wrap),
        field('融合带(px)', numberInput(pj.blendPx, {
          min: 0, max: 1024, onchange: (v) => { pj.blendPx = v; refreshSlider(); },
        })),
        field('伽马', numberInput(pj.gamma, {
          min: 0.5, max: 4, step: 0.1, onchange: (v) => { pj.gamma = v; refreshSlider(); },
        })),
        field('增益', numberInput(pj.gain, {
          min: 0.1, max: 2, step: 0.05, onchange: (v) => { pj.gain = v; refreshSlider(); },
        })),
      ),
    );
  }

  function buildPanels() {
    rightPanels.innerHTML = '';
    rightPanels.append(
      section('球幕参数',
        field('视场角', select(
          [{ value: '180', label: '180° (半球)' }, { value: '210', label: '210° (超半球)' }],
          String(show.dome.fovDeg) as '180' | '210',
          (v) => { show.dome.fovDeg = Number(v); save(); refresh(); },
        )),
        field('倾角(°)', slider(show.dome.tiltDeg, 0, 45, 0.5, (v) => { show.dome.tiltDeg = v; save(); refresh(); }).wrap),
        field('输出分辨率', select(
          ['1024', '2048', '4096'].map((r) => ({ value: r, label: `${r} × ${r}` })),
          String(show.dome.resolution) as '1024' | '2048' | '4096',
          (v) => { show.dome.resolution = Number(v); save(); refresh(); },
        )),
        checkbox('显示地平网格(测试图)', show.showGrid, (v) => { show.showGrid = v; save(); refresh(); }),
      ),
      section('显示模式',
        select(
          [{ value: 'overlay', label: '分区叠加' }, { value: 'gainmap', label: '融合增益图' }],
          viewMode,
          (v) => { viewMode = v; drawOverlay(); },
        ),
      ),
      section(`投影机分区 (${show.projectors.length} 台)`,
        ...show.projectors.map(projectorEditor),
        button('＋ 添加投影机', () => {
          const i = show.projectors.length;
          show.projectors.push({
            id: `pj-${Date.now().toString(36)}`,
            name: `投影机 ${i + 1}`,
            enabled: true,
            color: PROJECTOR_COLORS[i % PROJECTOR_COLORS.length],
            cx: 0.5, cy: 0.5, w: 0.5, h: 0.5,
            blendPx: 128, gamma: 2.2, gain: 1,
          });
          save(); buildPanels(); refresh();
        }),
      ),
    );
  }

  buildPanels();
  refresh();
  return () => {};
}
