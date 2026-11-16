/** 应用入口 */
import { loadSettings, saveSettings, store } from './core/store';
import { AppContext, PAGES, PageId, startRouter } from './ui/router';
import { el } from './ui/widgets';
import { mountShows } from './ui/pages/shows';
import { mountScene } from './ui/pages/scene';
import { mountCalibration } from './ui/pages/calibration';
import { mountSeats } from './ui/pages/seats';
import { mountExport } from './ui/pages/export';
import { mountSettings } from './ui/pages/settings';
import starsData from './data/stars.json';

const app = document.getElementById('app');
if (!app) throw new Error('缺少 #app 容器');

const navItems = new Map<PageId, HTMLElement>();
const sidebar = el('nav', { class: 'sidebar' },
  el('div', { class: 'logo' },
    el('span', { class: 'logo-icon', text: '◉' }),
    el('span', { text: '球幕预演系统' })),
  ...PAGES.map((p) => {
    const item = el('a', { class: 'nav-item', href: `#/${p.id}`, text: p.label });
    navItems.set(p.id, item);
    return item;
  }),
  el('div', { class: 'sidebar-footer', text: 'WebGL2 · 等距鱼眼' }),
);

const content = el('main', { class: 'content' });
app.append(sidebar, content);

const ctx: AppContext = {
  store,
  settings: loadSettings(),
  stars: starsData as [number, number, number, string][],
  saveSettings: () => saveSettings(ctx.settings),
  navigate: (page) => { location.hash = `#/${page}`; },
  currentShow: () => store.current(),
};

startRouter(content, ctx, {
  shows: mountShows,
  scene: mountScene,
  calibration: mountCalibration,
  seats: mountSeats,
  export: mountExport,
  settings: mountSettings,
}, navItems);
