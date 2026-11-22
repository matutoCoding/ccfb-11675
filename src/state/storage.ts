// localStorage 持久化（节目库 + 全局设置）

import { ShowProject } from '../types';
import { createDefaultProject, migrateProject } from './defaults';

const LIBRARY_KEY = 'dome-studio:shows:v1';
const ACTIVE_KEY = 'dome-studio:active-show:v1';

export interface ShowLibrary {
  shows: ShowProject[];
  activeId: string;
}

export const loadLibrary = (): ShowLibrary => {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) {
      const seeded = createDefaultProject('示例节目 · 穹顶四季');
      return { shows: [seeded], activeId: seeded.id };
    }
    const parsed = JSON.parse(raw) as ShowLibrary;
    if (!Array.isArray(parsed.shows) || parsed.shows.length === 0) {
      throw new Error('empty');
    }
    parsed.shows = parsed.shows.map((s) => migrateProject(s));
    if (!parsed.shows.some((s) => s.id === parsed.activeId)) {
      parsed.activeId = parsed.shows[0].id;
    }
    return parsed;
  } catch {
    const seeded = createDefaultProject('示例节目 · 穹顶四季');
    return { shows: [seeded], activeId: seeded.id };
  }
};

export const saveLibrary = (lib: ShowLibrary): void => {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    localStorage.setItem(ACTIVE_KEY, lib.activeId);
  } catch (e) {
    // 配额超限或隐私模式写入被拒：本次改动只保留在内存，提示用户导出备份
    console.warn('节目库持久化失败（可能存储已满或处于隐私模式）：', e);
  }
};

export const exportProjectFile = (project: ShowProject): void => {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}.dome.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const importProjectFile = (file: File): Promise<ShowProject> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        resolve(migrateProject(raw));
      } catch (e) {
        reject(new Error(`工程解析失败：${(e as Error).message}`));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
