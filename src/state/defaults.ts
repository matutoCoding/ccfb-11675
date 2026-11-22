// 默认工程与工程工厂

import { ShowProject, SceneConfig, Planet, Projector, Seat } from '../types';
import { generateSeatGrid } from '../math/projection';

const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const newId = uid;

export const defaultPlanets = (): Planet[] => [
  {
    id: uid('planet'),
    name: '水星',
    orbitRadius: 1.6,
    periodDays: 88,
    initialPhaseDeg: 20,
    radius: 0.12,
    color: [0.72, 0.65, 0.55],
    showOrbit: true,
    autoOrbit: true,
    keyframes: [],
  },
  {
    id: uid('planet'),
    name: '金星',
    orbitRadius: 2.3,
    periodDays: 225,
    initialPhaseDeg: 140,
    radius: 0.2,
    color: [0.95, 0.78, 0.45],
    showOrbit: true,
    autoOrbit: true,
    keyframes: [],
  },
  {
    id: uid('planet'),
    name: '地球',
    orbitRadius: 3.2,
    periodDays: 365,
    initialPhaseDeg: 260,
    radius: 0.22,
    color: [0.35, 0.55, 0.95],
    showOrbit: true,
    autoOrbit: true,
    keyframes: [],
  },
  {
    id: uid('planet'),
    name: '火星',
    orbitRadius: 4.2,
    periodDays: 687,
    initialPhaseDeg: 60,
    radius: 0.17,
    color: [0.9, 0.42, 0.28],
    showOrbit: true,
    autoOrbit: true,
    keyframes: [],
  },
  {
    id: uid('planet'),
    name: '木星',
    orbitRadius: 6.0,
    periodDays: 4333,
    initialPhaseDeg: 310,
    radius: 0.45,
    color: [0.85, 0.72, 0.52],
    showOrbit: true,
    autoOrbit: true,
    keyframes: [],
  },
];

export const defaultScenes = (): SceneConfig[] => [
  {
    id: uid('scene'),
    name: '开场 · 星空序曲',
    durationSec: 30,
    planets: [],
    showSun: false,
    sunColor: [1, 0.92, 0.75],
    showMilkyWay: true,
    magnitudeLimit: 5.0,
    starGain: 1.0,
  },
  {
    id: uid('scene'),
    name: '太阳系巡游',
    durationSec: 60,
    planets: defaultPlanets(),
    showSun: true,
    sunColor: [1, 0.92, 0.75],
    showMilkyWay: false,
    magnitudeLimit: 4.0,
    starGain: 0.8,
  },
];

export const defaultProjectors = (): Projector[] => [
  {
    id: uid('proj'),
    name: '投影机 1（北）',
    enabled: true,
    azimuthDeg: 0,
    elevationDeg: 45,
    widthDeg: 70,
    heightDeg: 70,
    blendWidthDeg: 8,
    blendGamma: 2,
    rollDeg: 0,
  },
  {
    id: uid('proj'),
    name: '投影机 2（东南）',
    enabled: true,
    azimuthDeg: 120,
    elevationDeg: 45,
    widthDeg: 70,
    heightDeg: 70,
    blendWidthDeg: 8,
    blendGamma: 2,
    rollDeg: 0,
  },
  {
    id: uid('proj'),
    name: '投影机 3（西南）',
    enabled: true,
    azimuthDeg: 240,
    elevationDeg: 45,
    widthDeg: 70,
    heightDeg: 70,
    blendWidthDeg: 8,
    blendGamma: 2,
    rollDeg: 0,
  },
];

export const defaultSeats = (): Seat[] => generateSeatGrid(4, 5, 2.2, -3.5);

export const createDefaultProject = (name = '未命名节目'): ShowProject => {
  const scenes = defaultScenes();
  return {
    version: 1,
    id: uid('show'),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      domeDiameterM: 16,
      domeTiltDeg: 0,
      domeTiltAzimuthDeg: 0,
      fov: 180,
      previewResolution: 1024,
      exportResolution: 2048,
      fps: 30,
    },
    observer: {
      latitudeDeg: 39.9042,
      longitudeDeg: 116.4074,
      utcIso: '2026-06-21T14:00:00.000Z',
      timeRate: 1,
    },
    scenes,
    projectors: defaultProjectors(),
    seats: defaultSeats(),
    activeSceneId: scenes[0].id,
  };
};

/** 深拷贝（结构化克隆，兜底 JSON） */
export const deepClone = <T>(obj: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj)) as T;
};

/** 复制工程（新 id、新名称） */
export const duplicateProject = (
  src: ShowProject,
  name = `${src.name} 副本`,
): ShowProject => {
  const copy = deepClone(src);
  copy.id = uid('show');
  copy.name = name;
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = copy.createdAt;
  const idMap = new Map<string, string>();
  copy.scenes.forEach((s) => idMap.set(s.id, uid('scene')));
  copy.scenes.forEach((s) => {
    s.id = idMap.get(s.id)!;
    s.planets.forEach((p) => (p.id = uid('planet')));
  });
  copy.projectors.forEach((p) => (p.id = uid('proj')));
  copy.seats.forEach((s) => (s.id = uid('seat')));
  copy.activeSceneId = idMap.get(src.activeSceneId) ?? copy.scenes[0].id;
  return copy;
};

/** 迁移/校验导入的工程，补齐缺失字段 */
export const migrateProject = (raw: unknown): ShowProject => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('工程文件格式不正确');
  }
  const fallback = createDefaultProject();
  const r = raw as Partial<ShowProject>;
  const project: ShowProject = {
    ...fallback,
    ...r,
    settings: { ...fallback.settings, ...(r.settings ?? {}) },
    observer: { ...fallback.observer, ...(r.observer ?? {}) },
    scenes: Array.isArray(r.scenes) && r.scenes.length > 0 ? r.scenes : fallback.scenes,
    projectors: Array.isArray(r.projectors) ? r.projectors : fallback.projectors,
    seats: Array.isArray(r.seats) ? r.seats : fallback.seats,
  };
  if (typeof project.name !== 'string') project.name = '导入的节目';
  if (!project.scenes.some((s) => s.id === project.activeSceneId)) {
    project.activeSceneId = project.scenes[0].id;
  }
  if (project.settings.fov !== 180 && project.settings.fov !== 210) {
    project.settings.fov = 180;
  }
  project.version = 1;
  return project;
};
