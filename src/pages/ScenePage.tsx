import { useMemo, useState } from 'react';
import { studioStore, useActiveShow } from '../state/store';
import { Card, NumberField, Slider } from '../ui/controls';
import { DomePreview } from '../ui/DomePreview';
import { Planet, Keyframe, AnimChannel } from '../types';
import { newId } from '../state/defaults';

const CHANNELS: Array<{ key: AnimChannel; label: string; dim: number }> = [
  { key: 'position', label: '位置偏移 (x,y,z)', dim: 3 },
  { key: 'scale', label: '缩放 (x,y,z)', dim: 3 },
  { key: 'color', label: '颜色 (r,g,b)', dim: 3 },
  { key: 'opacity', label: '不透明度 (a)', dim: 1 },
];

const PlanetEditor = ({
  sceneId,
  planet,
  duration,
}: {
  sceneId: string;
  planet: Planet;
  duration: number;
}) => {
  const [channel, setChannel] = useState<AnimChannel>('position');
  const update = (mut: (p: Planet) => void) =>
    studioStore.updatePlanet(sceneId, planet.id, mut);

  const addKeyframe = () => {
    const kf: Keyframe = {
      id: newId('kf'),
      t: 0,
      channel,
      value:
        channel === 'opacity'
          ? [1]
          : channel === 'color'
            ? [...planet.color]
            : channel === 'scale'
              ? [1, 1, 1]
              : [0, 0, 0],
      easing: 'linear',
    };
    update((p) => p.keyframes.push(kf));
  };

  return (
    <div className="card" style={{ background: 'var(--bg)' }}>
      <h3>
        {planet.name}
        <button
          className="danger"
          style={{ float: 'right', padding: '2px 8px' }}
          onClick={() => studioStore.deletePlanet(sceneId, planet.id)}
        >
          删除行星
        </button>
      </h3>
      <div className="field">
        <label>名称</label>
        <input
          value={planet.name}
          onChange={(e) => update((p) => (p.name = e.target.value))}
        />
      </div>
      <div className="grid-2">
        <NumberField
          label="轨道半径"
          value={planet.orbitRadius}
          step={0.1}
          min={0}
          onChange={(v) => update((p) => (p.orbitRadius = v))}
        />
        <NumberField
          label="公转周期（天）"
          value={planet.periodDays}
          step={1}
          min={1}
          onChange={(v) => update((p) => (p.periodDays = v))}
        />
        <NumberField
          label="初始相位（度）"
          value={planet.initialPhaseDeg}
          min={0}
          max={360}
          onChange={(v) => update((p) => (p.initialPhaseDeg = v))}
        />
        <NumberField
          label="行星半径"
          value={planet.radius}
          step={0.02}
          min={0.02}
          onChange={(v) => update((p) => (p.radius = v))}
        />
      </div>
      <div className="row">
        <label>颜色</label>
        <input
          type="color"
          value={rgbToHex(planet.color)}
          onChange={(e) =>
            update((p) => (p.color = hexToRgb(e.target.value)))
          }
          style={{ width: 60 }}
        />
        <label style={{ width: 'auto' }}>
          <input
            type="checkbox"
            checked={planet.showOrbit}
            onChange={(e) => update((p) => (p.showOrbit = e.target.checked))}
          />{' '}
          轨道线
        </label>
        <label style={{ width: 'auto' }}>
          <input
            type="checkbox"
            checked={planet.autoOrbit}
            onChange={(e) => update((p) => (p.autoOrbit = e.target.checked))}
          />{' '}
          自动公转
        </label>
      </div>

      <h3>关键帧动画（当前通道 {CHANNELS.find((c) => c.key === channel)?.label}）</h3>
      <div className="row">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as AnimChannel)}
          style={{ width: 'auto' }}
        >
          {CHANNELS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button onClick={addKeyframe}>＋ 添加关键帧</button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>时间 s</th>
            <th>通道</th>
            <th>数值</th>
            <th>缓动</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {planet.keyframes
            .filter((k) => k.channel === channel)
            .sort((a, b) => a.t - b.t)
            .map((k) => (
              <tr key={k.id}>
                <td style={{ width: 90 }}>
                  <input
                    type="number"
                    value={k.t}
                    min={0}
                    max={duration}
                    step={0.1}
                    onChange={(e) =>
                      update((p) => {
                        const f = p.keyframes.find((x) => x.id === k.id);
                        if (f) f.t = parseFloat(e.target.value);
                      })
                    }
                  />
                </td>
                <td className="muted">{k.channel}</td>
                <td>
                  <div className="row" style={{ margin: 0, gap: 4 }}>
                    {k.value.map((v, i) => (
                      <input
                        key={i}
                        type="number"
                        value={v}
                        step={0.05}
                        onChange={(e) =>
                          update((p) => {
                            const f = p.keyframes.find((x) => x.id === k.id);
                            if (f) f.value[i] = parseFloat(e.target.value);
                          })
                        }
                      />
                    ))}
                  </div>
                </td>
                <td style={{ width: 110 }}>
                  <select
                    value={k.easing}
                    onChange={(e) =>
                      update((p) => {
                        const f = p.keyframes.find((x) => x.id === k.id);
                        if (f)
                          f.easing = e.target.value as Keyframe['easing'];
                      })
                    }
                  >
                    <option value="linear">线性</option>
                    <option value="easeInOut">缓入缓出</option>
                    <option value="hold">保持</option>
                  </select>
                </td>
                <td style={{ width: 60 }}>
                  <button
                    className="danger"
                    onClick={() =>
                      update((p) => {
                        p.keyframes = p.keyframes.filter((x) => x.id !== k.id);
                      })
                    }
                  >
                    删
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {planet.keyframes.filter((k) => k.channel === channel).length === 0 && (
        <p className="muted">该通道暂无关键帧，将使用默认值。</p>
      )}
    </div>
  );
};

const rgbToHex = (c: [number, number, number] | number[]): string => {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};
const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const ScenePage = () => {
  const show = useActiveShow();
  const scene =
    show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(
    scene.planets[0]?.id ?? null,
  );

  const observerDate = useMemo(
    () => new Date(show.observer.utcIso),
    [show.observer.utcIso],
  );

  const planet = scene.planets.find((p) => p.id === selectedPlanet) ?? null;

  return (
    <div className="page">
      <div className="split wide-left">
        <div>
          <Card title="场景预览（等距鱼眼 domemaster）">
            <DomePreview
              scene={scene}
              settings={show.settings}
              observer={show.observer}
              projectors={show.projectors}
            />
          </Card>

          <Card title="场景列表">
            <div className="row">
              <select
                value={scene.id}
                onChange={(e) =>
                  studioStore.updateActive((d) => {
                    d.activeSceneId = e.target.value;
                  })
                }
              >
                {show.scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.durationSec}s）
                  </option>
                ))}
              </select>
              <button onClick={() => studioStore.addScene()}>＋ 新场景</button>
              <button onClick={() => studioStore.duplicateScene(scene.id)}>
                复制场景
              </button>
              <button
                className="danger"
                disabled={show.scenes.length <= 1}
                onClick={() => {
                  if (window.confirm('删除当前场景？'))
                    studioStore.deleteScene(scene.id);
                }}
              >
                删除
              </button>
            </div>
            <div className="field">
              <label>场景名称</label>
              <input
                value={scene.name}
                onChange={(e) =>
                  studioStore.updateScene(scene.id, (s) => (s.name = e.target.value))
                }
              />
            </div>
            <NumberField
              label="场景时长（秒）"
              value={scene.durationSec}
              min={1}
              step={1}
              onChange={(v) =>
                studioStore.updateScene(scene.id, (s) => (s.durationSec = v))
              }
            />
          </Card>
        </div>

        <div>
          <Card title="星空与时间">
            <Slider
              label="星等上限"
              value={scene.magnitudeLimit}
              min={0}
              max={6.5}
              step={0.1}
              decimals={1}
              onChange={(v) =>
                studioStore.updateScene(scene.id, (s) => (s.magnitudeLimit = v))
              }
            />
            <Slider
              label="星点亮度"
              value={scene.starGain}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) =>
                studioStore.updateScene(scene.id, (s) => (s.starGain = v))
              }
            />
            <div className="row">
              <label style={{ width: 'auto' }}>
                <input
                  type="checkbox"
                  checked={scene.showMilkyWay}
                  onChange={(e) =>
                    studioStore.updateScene(
                      scene.id,
                      (s) => (s.showMilkyWay = e.target.checked),
                    )
                  }
                />{' '}
                银河带
              </label>
              <label style={{ width: 'auto' }}>
                <input
                  type="checkbox"
                  checked={scene.showSun}
                  onChange={(e) =>
                    studioStore.updateScene(
                      scene.id,
                      (s) => (s.showSun = e.target.checked),
                    )
                  }
                />{' '}
                太阳
              </label>
            </div>
            <div className="field">
              <label>观测日期时间（UTC）</label>
              <input
                type="datetime-local"
                step={1}
                value={toLocalInput(observerDate)}
                onChange={(e) => {
                  const d = new Date(e.target.value);
                  if (!Number.isNaN(d.getTime())) {
                    studioStore.updateObserver(
                      (o) => (o.utcIso = d.toISOString()),
                    );
                  }
                }}
              />
            </div>
            <div className="grid-2">
              <NumberField
                label="纬度（°）"
                value={show.observer.latitudeDeg}
                step={0.0001}
                min={-90}
                max={90}
                onChange={(v) =>
                  studioStore.updateObserver((o) => (o.latitudeDeg = v))
                }
              />
              <NumberField
                label="经度（°）"
                value={show.observer.longitudeDeg}
                step={0.0001}
                min={-180}
                max={180}
                onChange={(v) =>
                  studioStore.updateObserver((o) => (o.longitudeDeg = v))
                }
              />
            </div>
            <Slider
              label="时间流速"
              value={show.observer.timeRate}
              min={0}
              max={3600}
              step={10}
              decimals={0}
              unit="×"
              onChange={(v) =>
                studioStore.updateObserver((o) => (o.timeRate = v))
              }
            />
          </Card>

          <Card
            title="行星与轨道"
            extra={
              <button onClick={() => studioStore.addPlanet(scene.id)}>
                ＋ 添加
              </button>
            }
          >
            {scene.planets.length === 0 && (
              <p className="muted">当前场景没有行星，点击「添加」布置。</p>
            )}
            <div className="row">
              <select
                value={selectedPlanet ?? ''}
                onChange={(e) => setSelectedPlanet(e.target.value)}
              >
                {scene.planets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {planet && (
              <PlanetEditor sceneId={scene.id} planet={planet} duration={scene.durationSec} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
