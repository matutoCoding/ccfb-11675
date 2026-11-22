// 共享鱼眼预览画布：封装 useDomeRenderer，附带播放控制条

import { ReactNode } from 'react';
import { useState } from 'react';
import { useDomeRenderer } from '../renderer/useDomeRenderer';
import {
  ObserverConfig,
  Projector,
  SceneConfig,
  Seat,
  Settings,
} from '../types';
import { WarpMode } from '../renderer/dome-engine';

interface Props {
  scene: SceneConfig;
  settings: Settings;
  observer: ObserverConfig;
  projectors: Projector[];
  seat?: Seat | null;
  mode?: WarpMode;
  showControls?: boolean;
  onEngineReady?: (engine: ReturnType<typeof useDomeRenderer>) => void;
  overlay?: ReactNode;
}

export const DomePreview = ({
  scene,
  settings,
  observer,
  projectors,
  seat = null,
  mode = 0,
  showControls = true,
  overlay,
}: Props) => {
  const [playing, setPlaying] = useState(false);
  const handle = useDomeRenderer({
    scene,
    settings,
    observer,
    projectors,
    seat,
    mode,
    playing,
  });

  const duration = scene.durationSec;
  const t = handle.sceneTime;

  return (
    <div>
      <div className="canvas-wrap">
        <canvas ref={handle.canvasRef} />
        {overlay}
      </div>
      {showControls && (
        <div className="card" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="row">
            <button onClick={() => setPlaying((p) => !p)}>
              {playing ? '⏸ 暂停' : '▶ 播放'}
            </button>
            <button
              onClick={() => handle.setSceneTime(0)}
              disabled={playing}
            >
              ⏮ 回到开头
            </button>
            <span className="mono muted">
              {t.toFixed(2)}s / {duration.toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={Math.min(t, duration)}
            onChange={(e) => handle.setSceneTime(parseFloat(e.target.value))}
          />
        </div>
      )}
    </div>
  );
};
