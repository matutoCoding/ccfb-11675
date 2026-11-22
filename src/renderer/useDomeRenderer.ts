// React 与 DomeEngine 的桥接：引擎生命周期、RAF 循环、播放时间

import { useEffect, useRef, useState, useCallback } from 'react';
import { DomeEngine, WarpMode } from './dome-engine';
import { buildScene, RenderScene } from './scene-builder';
import { Projector, SceneConfig, Seat, Settings, ObserverConfig } from '../types';

export interface RenderInputs {
  scene: SceneConfig;
  settings: Settings;
  observer: ObserverConfig;
  projectors: Projector[];
  seat: Seat | null;
  mode: WarpMode;
  playing: boolean;
}

export interface RendererHandle {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  sceneTime: number;
  setSceneTime: (t: number) => void;
  engineRef: React.MutableRefObject<DomeEngine | null>;
  renderOnce: (timeSec: number) => RenderScene | null;
}

export const useDomeRenderer = (inputs: RenderInputs): RendererHandle => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DomeEngine | null>(null);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const timeRef = useRef(0);
  const [sceneTime, setSceneTimeState] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // 引擎初始化 / 分辨率变更
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = inputs.settings.previewResolution;
    if (!engineRef.current) {
      engineRef.current = new DomeEngine(canvas, size);
      canvas.width = size;
      canvas.height = size;
      // 诊断入口（仅开发环境，浏览器控制台 / 自动化测试使用）
      if (import.meta.env.DEV) {
        (window as unknown as { __domeEngine?: unknown }).__domeEngine =
          engineRef.current;
      }
    } else {
      engineRef.current.resizeCube(size);
      canvas.width = size;
      canvas.height = size;
    }
  }, [inputs.settings.previewResolution]);

  const build = useCallback((timeSec: number): RenderScene | null => {
    const engine = engineRef.current;
    const inp = inputsRef.current;
    if (!engine) return null;
    const absDate = new Date(
      new Date(inp.observer.utcIso).getTime() + timeSec * 1000 * inp.observer.timeRate,
    );
    const rs = buildScene(inp.scene, inp.observer, inp.settings, timeSec, absDate);
    engine.renderFrame(rs, inp.settings, inp.mode, inp.projectors, inp.seat);
    return rs;
  }, []);

  const renderOnce = useCallback(
    (timeSec: number): RenderScene | null => {
      timeRef.current = timeSec;
      setSceneTimeState(timeSec);
      return build(timeSec);
    },
    [build],
  );

  const setSceneTime = useCallback(
    (t: number) => {
      timeRef.current = t;
      setSceneTimeState(t);
      build(t);
    },
    [build],
  );

  // RAF 循环
  useEffect(() => {
    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const inp = inputsRef.current;
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;

      if (inp.playing) {
        const duration = inp.scene.durationSec;
        let t = timeRef.current + dt;
        if (t >= duration) t = t % duration; // 循环播放
        timeRef.current = t;
        setSceneTimeState(t);
      }
      build(timeRef.current);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [build]);

  // 暂停时也立即渲染一次（参数修改后即时反馈）
  useEffect(() => {
    if (!inputs.playing) build(timeRef.current);
  });

  return { canvasRef, sceneTime, setSceneTime, engineRef, renderOnce };
};
