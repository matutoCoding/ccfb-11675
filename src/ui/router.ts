/** 应用上下文与路由 */
import { ShowStore } from '../core/store';
import { AppSettings, Show } from '../core/types';

export type StarRow = [number, number, number, string]; // raDeg, decDeg, mag, name

export type PageId = 'shows' | 'scene' | 'calibration' | 'seats' | 'export' | 'settings';

export const PAGES: { id: PageId; label: string }[] = [
  { id: 'shows', label: '节目列表' },
  { id: 'scene', label: '场景编排' },
  { id: 'calibration', label: '投影校正' },
  { id: 'seats', label: '座位预览' },
  { id: 'export', label: '渲染导出' },
  { id: 'settings', label: '设置' },
];

export interface AppContext {
  store: ShowStore;
  settings: AppSettings;
  stars: StarRow[];
  saveSettings(): void;
  navigate(page: PageId): void;
  /** 当前节目; 没有则 null */
  currentShow(): Show | null;
}

export type PageMount = (root: HTMLElement, ctx: AppContext) => void | (() => void);

export function startRouter(
  contentEl: HTMLElement,
  ctx: AppContext,
  mounts: Record<PageId, PageMount>,
  navItems: Map<PageId, HTMLElement>,
): void {
  let cleanup: void | (() => void);

  const route = () => {
    const hash = location.hash.replace(/^#\/?/, '') as PageId;
    const page: PageId = (PAGES.some((p) => p.id === hash) ? hash : 'shows') as PageId;
    if (typeof cleanup === 'function') cleanup();
    contentEl.innerHTML = '';
    for (const [id, item] of navItems) item.classList.toggle('active', id === page);
    cleanup = mounts[page](contentEl, ctx);
  };

  window.addEventListener('hashchange', route);
  route();
}
