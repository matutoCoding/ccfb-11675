/** 节目与设置的本地持久化 + 工程导入导出 */
import { AppSettings, DEFAULT_SETTINGS, Show, createShow } from './types';

const KEY_SHOWS = 'domepreview.shows.v1';
const KEY_SETTINGS = 'domepreview.settings.v1';
const KEY_CURRENT = 'domepreview.current.v1';

export const PROJECT_FILE_VERSION = 1;

interface ProjectFile {
  app: 'dome-preview';
  version: number;
  exportedAt: number;
  shows: Show[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function loadShows(): Show[] {
  const shows = readJson<Show[]>(KEY_SHOWS, []);
  return Array.isArray(shows) ? shows : [];
}

export function saveShows(shows: Show[]): void {
  localStorage.setItem(KEY_SHOWS, JSON.stringify(shows));
}

export function loadSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(KEY_SETTINGS, {}) };
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

export function getCurrentShowId(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

export function setCurrentShowId(id: string | null): void {
  if (id) localStorage.setItem(KEY_CURRENT, id);
  else localStorage.removeItem(KEY_CURRENT);
}

/** 内存中的节目仓库, 页面间共享 */
export class ShowStore {
  shows: Show[] = loadShows();
  currentId: string | null = getCurrentShowId();
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    saveShows(this.shows);
    for (const fn of this.listeners) fn();
  }

  current(): Show | null {
    return this.shows.find((s) => s.id === this.currentId) ?? this.shows[0] ?? null;
  }

  setCurrent(id: string) {
    this.currentId = id;
    setCurrentShowId(id);
    this.emit();
  }

  add(name: string): Show {
    const show = createShow(name);
    this.shows.push(show);
    this.currentId = show.id;
    setCurrentShowId(show.id);
    this.emit();
    return show;
  }

  update(show: Show) {
    const i = this.shows.findIndex((s) => s.id === show.id);
    if (i >= 0) {
      show.updatedAt = Date.now();
      this.shows[i] = show;
      this.emit();
    }
  }

  remove(id: string) {
    this.shows = this.shows.filter((s) => s.id !== id);
    if (this.currentId === id) {
      this.currentId = this.shows[0]?.id ?? null;
      setCurrentShowId(this.currentId);
    }
    this.emit();
  }

  duplicate(id: string): Show | null {
    const src = this.shows.find((s) => s.id === id);
    if (!src) return null;
    const copy: Show = JSON.parse(JSON.stringify(src));
    copy.id = `show-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    copy.name = `${src.name} 副本`;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    this.shows.push(copy);
    this.emit();
    return copy;
  }

  /** 导出全部节目为工程文件 */
  exportProject(): string {
    const file: ProjectFile = {
      app: 'dome-preview',
      version: PROJECT_FILE_VERSION,
      exportedAt: Date.now(),
      shows: this.shows,
    };
    return JSON.stringify(file, null, 2);
  }

  /** 导入工程(合并, id 冲突时生成新 id)。返回导入数量。 */
  importProject(json: string): number {
    const data = JSON.parse(json) as ProjectFile;
    if (data.app !== 'dome-preview' || !Array.isArray(data.shows)) {
      throw new Error('不是有效的工程文件');
    }
    if (data.version > PROJECT_FILE_VERSION) {
      throw new Error(`工程文件版本过新 (v${data.version}), 请升级本系统`);
    }
    let count = 0;
    const ids = new Set(this.shows.map((s) => s.id));
    for (const show of data.shows) {
      if (!show || typeof show.name !== 'string') continue;
      const s = show as Show;
      if (ids.has(s.id)) {
        s.id = `show-${Date.now().toString(36)}-${count.toString(36)}`;
      }
      this.shows.push(s);
      ids.add(s.id);
      count++;
    }
    this.emit();
    return count;
  }

  clearAll() {
    this.shows = [];
    this.currentId = null;
    setCurrentShowId(null);
    this.emit();
  }
}

export const store = new ShowStore();
