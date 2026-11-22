// 全局状态 store：useSyncExternalStore + 自动持久化

import { useSyncExternalStore } from 'react';
import { ShowProject, SceneConfig, Planet, Projector, Seat, Settings, ObserverConfig } from '../types';
import { ShowLibrary, loadLibrary, saveLibrary } from './storage';
import {
  createDefaultProject,
  duplicateProject,
  newId,
  deepClone,
} from './defaults';

class StudioStore {
  private lib: ShowLibrary;
  private listeners = new Set<() => void>();

  constructor() {
    this.lib = loadLibrary();
  }

  private emit = (): void => {
    saveLibrary(this.lib);
    this.listeners.forEach((l) => l());
  };

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): ShowLibrary => this.lib;

  get active(): ShowProject {
    return (
      this.lib.shows.find((s) => s.id === this.lib.activeId) ??
      this.lib.shows[0]
    );
  }

  // ---------- 节目级 ----------
  createShow(name?: string): ShowProject {
    const p = createDefaultProject(name);
    this.lib = {
      shows: [...this.lib.shows, p],
      activeId: p.id,
    };
    this.emit();
    return p;
  }

  deleteShow(id: string): void {
    if (this.lib.shows.length <= 1) return;
    const shows = this.lib.shows.filter((s) => s.id !== id);
    const activeId =
      this.lib.activeId === id ? shows[0].id : this.lib.activeId;
    this.lib = { shows, activeId };
    this.emit();
  }

  duplicateShow(id: string): void {
    const src = this.lib.shows.find((s) => s.id === id);
    if (!src) return;
    const copy = duplicateProject(src);
    this.lib = {
      shows: [...this.lib.shows, copy],
      activeId: copy.id,
    };
    this.emit();
  }

  selectShow(id: string): void {
    if (!this.lib.shows.some((s) => s.id === id)) return;
    this.lib = { ...this.lib, activeId: id };
    this.emit();
  }

  importShow(p: ShowProject): void {
    p.id = newId('show');
    this.lib = { shows: [...this.lib.shows, p], activeId: p.id };
    this.emit();
  }

  /** 修改当前工程（mutator 收到深拷贝，返回修改后的工程） */
  updateActive(mutator: (draft: ShowProject) => void): void {
    const draft = deepClone(this.active);
    mutator(draft);
    draft.updatedAt = new Date().toISOString();
    this.lib = {
      shows: this.lib.shows.map((s) => (s.id === draft.id ? draft : s)),
      activeId: this.lib.activeId,
    };
    this.emit();
  }

  // ---------- 场景 ----------
  addScene(): void {
    this.updateActive((d) => {
      const scene: SceneConfig = {
        id: newId('scene'),
        name: `场景 ${d.scenes.length + 1}`,
        durationSec: 20,
        planets: [],
        showSun: true,
        sunColor: [1, 0.92, 0.75],
        showMilkyWay: true,
        magnitudeLimit: 5,
        starGain: 1,
      };
      d.scenes.push(scene);
      d.activeSceneId = scene.id;
    });
  }

  updateScene(sceneId: string, mutator: (s: SceneConfig) => void): void {
    this.updateActive((d) => {
      const s = d.scenes.find((x) => x.id === sceneId);
      if (s) mutator(s);
    });
  }

  deleteScene(sceneId: string): void {
    this.updateActive((d) => {
      if (d.scenes.length <= 1) return;
      d.scenes = d.scenes.filter((s) => s.id !== sceneId);
      if (d.activeSceneId === sceneId) d.activeSceneId = d.scenes[0].id;
    });
  }

  duplicateScene(sceneId: string): void {
    this.updateActive((d) => {
      const src = d.scenes.find((s) => s.id === sceneId);
      if (!src) return;
      const copy = deepClone(src);
      copy.id = newId('scene');
      copy.name = `${src.name} 副本`;
      copy.planets.forEach((p) => (p.id = newId('planet')));
      const idx = d.scenes.findIndex((s) => s.id === sceneId);
      d.scenes.splice(idx + 1, 0, copy);
      d.activeSceneId = copy.id;
    });
  }

  // ---------- 行星 ----------
  addPlanet(sceneId: string): void {
    this.updateScene(sceneId, (s) => {
      s.planets.push({
        id: newId('planet'),
        name: `行星 ${s.planets.length + 1}`,
        orbitRadius: 2 + s.planets.length,
        periodDays: 400,
        initialPhaseDeg: 0,
        radius: 0.2,
        color: [0.6, 0.7, 0.95],
        showOrbit: true,
        autoOrbit: true,
        keyframes: [],
      });
    });
  }

  updatePlanet(sceneId: string, planetId: string, mutator: (p: Planet) => void): void {
    this.updateScene(sceneId, (s) => {
      const p = s.planets.find((x) => x.id === planetId);
      if (p) mutator(p);
    });
  }

  deletePlanet(sceneId: string, planetId: string): void {
    this.updateScene(sceneId, (s) => {
      s.planets = s.planets.filter((p) => p.id !== planetId);
    });
  }

  // ---------- 投影机 ----------
  addProjector(): void {
    this.updateActive((d) => {
      d.projectors.push({
        id: newId('proj'),
        name: `投影机 ${d.projectors.length + 1}`,
        enabled: true,
        azimuthDeg: d.projectors.length * 90,
        elevationDeg: 45,
        widthDeg: 60,
        heightDeg: 60,
        blendWidthDeg: 8,
        blendGamma: 2,
        rollDeg: 0,
      });
    });
  }

  updateProjector(id: string, mutator: (p: Projector) => void): void {
    this.updateActive((d) => {
      const p = d.projectors.find((x) => x.id === id);
      if (p) mutator(p);
    });
  }

  deleteProjector(id: string): void {
    this.updateActive((d) => {
      d.projectors = d.projectors.filter((p) => p.id !== id);
    });
  }

  // ---------- 座位 ----------
  addSeat(): void {
    this.updateActive((d) => {
      d.seats.push({
        id: newId('seat'),
        name: `座位 ${d.seats.length + 1}`,
        x: 0,
        y: 0,
        z: -3,
      });
    });
  }

  updateSeat(id: string, mutator: (s: Seat) => void): void {
    this.updateActive((d) => {
      const s = d.seats.find((x) => x.id === id);
      if (s) mutator(s);
    });
  }

  deleteSeat(id: string): void {
    this.updateActive((d) => {
      d.seats = d.seats.filter((s) => s.id !== id);
    });
  }

  // ---------- 设置 / 观测 ----------
  updateSettings(mutator: (s: Settings) => void): void {
    this.updateActive((d) => mutator(d.settings));
  }

  updateObserver(mutator: (o: ObserverConfig) => void): void {
    this.updateActive((d) => mutator(d.observer));
  }
}

export const studioStore = new StudioStore();

export const useStudio = (): ShowLibrary =>
  useSyncExternalStore(studioStore.subscribe, studioStore.getSnapshot);

export const useActiveShow = (): ShowProject => {
  const lib = useStudio();
  return lib.shows.find((s) => s.id === lib.activeId) ?? lib.shows[0];
};
