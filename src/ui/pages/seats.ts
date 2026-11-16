/** 座位预览页: 从任意座位看球幕上的实际变形 */
import { sampleProps } from '../../core/animation';
import { SeatViewRenderer, seatLayout } from '../../render/domeView';
import { DomeRenderer, contentFromProps, skyUniforms } from '../../render/renderer';
import { el, field, numberInput, section, select } from '../widgets';
import { AppContext } from '../router';

export function mountSeats(root: HTMLElement, ctx: AppContext): (() => void) | void {
  const maybeShow = ctx.currentShow();
  if (!maybeShow) {
    root.append(el('p', { class: 'empty', text: '请先在「节目列表」中创建或选择一个节目。' }));
    return;
  }
  const show = maybeShow;

  const viewBox = el('div', { class: 'preview-box seat-view-box' });
  const viewCanvas = el('canvas', { class: 'preview-canvas', width: '800', height: '560' }) as HTMLCanvasElement;
  viewBox.append(viewCanvas);
  const rightPanels = el('div', { class: 'side-panels' });
  const hint = el('p', { class: 'muted', text: '拖动画面可转动视线。红点为当前座位。' });

  root.append(
    el('div', { class: 'page-header' }, el('h2', { text: `座位预览 — ${show.name}` })),
    el('div', { class: 'scene-layout' },
      el('div', { class: 'scene-main' }, viewBox, hint),
      rightPanels,
    ),
  );

  // 同一画布同一 GL 上下文: 先渲染天空到立方体贴图, 再从座位透视渲染
  const domeRenderer = new DomeRenderer(viewCanvas, ctx.settings.cubeSize);
  domeRenderer.setStars(ctx.stars.map((s) => [s[0], s[1], s[2]] as [number, number, number]));

  const seatView = new SeatViewRenderer(domeRenderer.gl, viewCanvas);
  let seats = seatLayout(show.seats);
  let selected = Math.min(Math.floor(seats.length / 2), seats.length - 1);

  seatView.buildDome(show.dome.fovDeg);
  seatView.buildFloor(show.seats.domeRadius + 1);
  seatView.setSeats(seats);

  function renderSky() {
    const props = sampleProps(show, 0, ctx.settings.magLimit);
    const sky = skyUniforms(props);
    const content = contentFromProps(props, {
      planets: show.planets, showSun: show.showSun, showMoon: show.showMoon,
      showGrid: show.showGrid, exposure: ctx.settings.starExposure,
    });
    // 只渲染到立方体贴图(不合成)
    domeRenderer.renderCubeMap(sky, content);
  }

  function renderView() {
    const seat = seats[selected];
    if (!seat) return;
    seatView.render(domeRenderer.cubeTexture, seat, show.seats, show.dome.tiltDeg, selected);
  }

  function refresh() {
    seats = seatLayout(show.seats);
    if (selected >= seats.length) selected = seats.length - 1;
    seatView.buildDome(show.dome.fovDeg);
    seatView.buildFloor(show.seats.domeRadius + 1);
    seatView.setSeats(seats);
    renderSky();
    renderView();
    buildSeatSelector();
  }

  /* 鼠标拖动转视线 */
  let dragging = false, lastX = 0, lastY = 0;
  viewCanvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    viewCanvas.setPointerCapture(e.pointerId);
  });
  viewCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    seatView.yaw += (e.clientX - lastX) * 0.3;
    seatView.pitch = Math.max(-30, Math.min(89, seatView.pitch + (e.clientY - lastY) * -0.3));
    lastX = e.clientX; lastY = e.clientY;
    renderView();
  });
  viewCanvas.addEventListener('pointerup', () => { dragging = false; });

  let seatSelectEl: HTMLSelectElement | null = null;
  function buildSeatSelector() {
    if (!seatSelectEl) return;
    seatSelectEl.innerHTML = '';
    seats.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `第 ${s.row + 1} 排 ${s.col + 1} 号`;
      seatSelectEl!.append(opt);
    });
    seatSelectEl.value = String(selected);
  }

  function buildPanels() {
    rightPanels.innerHTML = '';
    const cfg = show.seats;
    seatSelectEl = select(
      seats.map((s, i) => ({ value: String(i), label: `第 ${s.row + 1} 排 ${s.col + 1} 号` })),
      String(selected) as string,
      (v) => { selected = Number(v); renderView(); },
    ) as HTMLSelectElement;

    const num = (label: string, get: () => number, set: (v: number) => void, step = 1, min = 0) =>
      field(label, numberInput(get(), { min, step, onchange: (v) => { set(v); ctx.store.update(show); refresh(); } }));

    rightPanels.append(
      section('座位选择', seatSelectEl),
      section('座位布局',
        num('排数', () => cfg.rows, (v) => { cfg.rows = Math.max(1, Math.round(v)); }),
        num('每排座位', () => cfg.seatsPerRow, (v) => { cfg.seatsPerRow = Math.max(1, Math.round(v)); }),
        num('首排距离(米)', () => cfg.firstRowDist, (v) => { cfg.firstRowDist = v; }, 0.1),
        num('排距(米)', () => cfg.rowSpacing, (v) => { cfg.rowSpacing = v; }, 0.1),
        num('座位间距(米)', () => cfg.seatSpacing, (v) => { cfg.seatSpacing = v; }, 0.05),
        num('眼高(米)', () => cfg.eyeHeight, (v) => { cfg.eyeHeight = v; }, 0.1),
        num('球幕半径(米)', () => cfg.domeRadius, (v) => { cfg.domeRadius = v; }, 0.5, 1),
      ),
      section('视线',
        field('偏航(°)', numberInput(seatView.yaw, { step: 1, onchange: (v) => { seatView.yaw = v; renderView(); } })),
        field('俯仰(°)', numberInput(seatView.pitch, { min: -30, max: 89, step: 1, onchange: (v) => { seatView.pitch = v; renderView(); } })),
      ),
    );
    buildSeatSelector();
  }

  buildPanels();
  refresh();
  return () => {};
}
