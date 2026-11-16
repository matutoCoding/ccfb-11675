/** 场景编排页: 天空设置、行星与轨道、关键帧动画、实时预览 */
import { ANIM_PROP_LABELS, makeKeyframe, sampleProps } from '../../core/animation';
import { equToDome, julianDate, lst, moonEqu, planetEqu, sunEqu, PLANETS } from '../../core/astro';
import { applyCamRot, directionToPixel } from '../../core/fisheye';
import { AnimProps } from '../../core/types';
import { button, checkbox, el, field, formatTime, numberInput, section, slider } from '../widgets';
import { AppContext } from '../router';
import { PreviewCanvas } from '../preview';

export function mountScene(root: HTMLElement, ctx: AppContext): (() => void) | void {
  const maybeShow = ctx.currentShow();
  if (!maybeShow) {
    root.append(el('p', { class: 'empty', text: '请先在「节目列表」中创建或选择一个节目。' }));
    return;
  }
  const show = maybeShow;

  let timelineTime = 0;
  let playing = false;
  let raf = 0;
  let lastFrame = 0;
  let disposed = false;

  /* ---------- 布局 ---------- */
  const previewBox = el('div', { class: 'preview-box' });
  const overlay = el('canvas', { class: 'label-overlay' }) as HTMLCanvasElement;
  previewBox.append(overlay);

  const timeLabel = el('span', { class: 'time-label' });
  const playBtn = button('▶ 播放', () => togglePlay(), 'primary');
  const scrubber = el('input', { type: 'range', min: '0', max: String(show.duration), step: '0.01', value: '0', class: 'scrubber' }) as HTMLInputElement;
  const kfMarkers = el('div', { class: 'kf-markers' });

  const rightPanels = el('div', { class: 'side-panels' });
  const kfList = el('div', { class: 'kf-list' });

  root.append(
    el('div', { class: 'page-header' },
      el('h2', { text: `场景编排 — ${show.name}` }),
      el('div', { class: 'header-actions' },
        field('时长(秒)', numberInput(show.duration, { min: 1, max: 3600, onchange: (v) => { show.duration = v; scrubber.max = String(v); save(); } })),
        field('帧率', numberInput(show.fps, { min: 1, max: 120, onchange: (v) => { show.fps = v; save(); } })),
      )),
    el('div', { class: 'scene-layout' },
      el('div', { class: 'scene-main' },
        previewBox,
        el('div', { class: 'transport' },
          playBtn,
          button('⏮', () => { timelineTime = 0; refresh(); }),
          scrubber,
          timeLabel,
          button('◆ 记录关键帧', () => addKeyframe()),
        ),
        el('div', { class: 'timeline' }, kfMarkers),
        kfList,
      ),
      rightPanels,
    ),
  );

  const preview = new PreviewCanvas(previewBox, ctx, 640);
  previewBox.insertBefore(preview.canvas, overlay);

  /* ---------- 工具 ---------- */
  function save() { ctx.store.update(show); }
  function props(): AnimProps { return sampleProps(show, timelineTime, ctx.settings.magLimit); }

  function currentPropsForKeyframe(): Partial<AnimProps> {
    const p = props();
    return { ...p };
  }

  function addKeyframe() {
    const kf = makeKeyframe(timelineTime, currentPropsForKeyframe());
    show.keyframes.push(kf);
    show.keyframes.sort((a, b) => a.time - b.time);
    save();
    refreshKfUi();
  }

  function togglePlay() {
    playing = !playing;
    playBtn.textContent = playing ? '⏸ 暂停' : '▶ 播放';
    lastFrame = performance.now();
  }

  /* ---------- 右侧面板 ---------- */
  function buildPanels() {
    rightPanels.innerHTML = '';
    const p = props();

    // 天空
    const dtInput = el('input', { type: 'datetime-local', step: '1' }) as HTMLInputElement;
    const d = new Date(p.skyTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    dtInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    dtInput.addEventListener('change', () => {
      const t = new Date(dtInput.value).getTime();
      if (Number.isFinite(t)) { show.sky.time = t; save(); refresh(); }
    });

    rightPanels.append(
      section('天空',
        field('日期时间', dtInput),
        field('纬度(°)', numberInput(show.sky.lat, { min: -90, max: 90, step: 0.1, onchange: (v) => { show.sky.lat = v; save(); refresh(); } })),
        field('经度(°)', numberInput(show.sky.lon, { min: -180, max: 180, step: 0.1, onchange: (v) => { show.sky.lon = v; save(); refresh(); } })),
        field('星等上限', (() => {
          const s = slider(p.magLimit, 0, 6.5, 0.1, (v) => { ctx.settings.magLimit = v; ctx.saveSettings(); refresh(); });
          return s.wrap;
        })()),
      ),
      section('相机',
        field('偏航(°)', (() => {
          const s = slider(show.camera.yaw, -180, 180, 1, (v) => { show.camera.yaw = v; save(); refresh(); });
          return s.wrap;
        })()),
        field('俯仰(°)', (() => {
          const s = slider(show.camera.pitch, -90, 90, 1, (v) => { show.camera.pitch = v; save(); refresh(); });
          return s.wrap;
        })()),
      ),
      section('天体',
        checkbox('太阳', show.showSun, (v) => { show.showSun = v; save(); refresh(); }),
        checkbox('月亮', show.showMoon, (v) => { show.showMoon = v; save(); refresh(); }),
        checkbox('地平网格', show.showGrid, (v) => { show.showGrid = v; save(); refresh(); }),
      ),
      section('行星与轨道',
        ...show.planets.map((pc) => {
          const meta = PLANETS[pc.id];
          return el('div', { class: 'planet-row' },
            el('span', { class: 'planet-color', style: { background: meta.color } }),
            el('span', { class: 'planet-name', text: meta.nameZh }),
            checkbox('显示', pc.visible, (v) => { pc.visible = v; save(); refresh(); }),
            checkbox('轨道', pc.showOrbit, (v) => { pc.showOrbit = v; save(); refresh(); }),
            checkbox('标注', pc.showLabel, (v) => { pc.showLabel = v; save(); refresh(); }),
          );
        }),
      ),
    );
  }

  /* ---------- 关键帧 UI ---------- */
  function refreshKfUi() {
    kfMarkers.innerHTML = '';
    for (const kf of show.keyframes) {
      const marker = el('span', {
        class: 'kf-marker', title: `关键帧 @ ${formatTime(kf.time)}`,
        style: { left: `${(kf.time / show.duration) * 100}%` },
        onclick: () => { timelineTime = kf.time; refresh(); },
      });
      kfMarkers.append(marker);
    }
    kfList.innerHTML = '';
    if (show.keyframes.length === 0) {
      kfList.append(el('p', { class: 'muted', text: '暂无关键帧。移动时间轴后点击「记录关键帧」捕获当前全部属性。' }));
      return;
    }
    for (const kf of show.keyframes) {
      const propNames = Object.keys(kf.props).map((k) => ANIM_PROP_LABELS[k as keyof AnimProps]).join('、');
      kfList.append(el('div', { class: 'kf-item' },
        el('span', { class: 'kf-time', text: formatTime(kf.time) }),
        el('span', { class: 'kf-props', text: propNames || '(空)' }),
        button('跳转', () => { timelineTime = kf.time; refresh(); }, 'small'),
        button('删除', () => {
          show.keyframes = show.keyframes.filter((k) => k.id !== kf.id);
          save(); refreshKfUi();
        }, 'small danger'),
      ));
    }
  }

  /* ---------- 标签叠加层 ---------- */
  function drawLabels(p: AnimProps) {
    const size = preview.canvas.width;
    overlay.width = size;
    overlay.height = size;
    const g = overlay.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, size, size);
    const params = { size, fovDeg: show.dome.fovDeg, tiltDeg: show.dome.tiltDeg };
    const jd = julianDate(p.skyTime);
    const lstDeg = lst(jd, p.lon);

    const put = (ra: number, dec: number, label: string, color: string) => {
      let dir = equToDome(ra, dec, p.lat, lstDeg);
      dir = applyCamRot(dir, p.camYaw, p.camPitch);
      const px = directionToPixel(dir, params);
      if (!px) return;
      g.fillStyle = color;
      g.font = '12px system-ui';
      g.fillText(label, px[0] + 6, px[1] - 6);
      g.beginPath();
      g.arc(px[0], px[1], 2, 0, Math.PI * 2);
      g.fill();
    };

    for (const pc of show.planets) {
      if (!pc.visible || !pc.showLabel) continue;
      const meta = PLANETS[pc.id];
      const pos = planetEqu(pc.id, jd);
      put(pos.ra, pos.dec, meta.nameZh, meta.color);
    }
    if (show.showSun) { const s = sunEqu(jd); put(s.ra, s.dec, '太阳', '#ffdd88'); }
    if (show.showMoon) { const m = moonEqu(jd); put(m.ra, m.dec, '月亮', '#cccccc'); }
  }

  /* ---------- 刷新与主循环 ---------- */
  function refresh() {
    const p = props();
    preview.renderShow(show, p, ctx);
    drawLabels(p);
    scrubber.value = String(timelineTime);
    timeLabel.textContent = `${formatTime(timelineTime)} / ${formatTime(show.duration)}`;
  }

  scrubber.addEventListener('input', () => {
    timelineTime = parseFloat(scrubber.value);
    refresh();
  });

  const loop = (now: number) => {
    if (disposed) return;
    if (playing) {
      timelineTime += (now - lastFrame) / 1000;
      lastFrame = now;
      if (timelineTime >= show.duration) {
        timelineTime = show.duration;
        togglePlay();
      }
      refresh();
    }
    raf = requestAnimationFrame(loop);
  };

  buildPanels();
  refreshKfUi();
  refresh();
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
  };
}
