import { useState } from 'react';
import { studioStore, useActiveShow } from '../state/store';
import { Card, NumberField, Pill } from '../ui/controls';
import { DomePreview } from '../ui/DomePreview';
import { Seat } from '../types';
import { seatDistortionAngle, generateSeatGrid } from '../math/projection';
import { fromHoriz, deg2rad } from '../math/vec3';

const SeatEditor = ({ seat }: { seat: Seat }) => {
  const update = (mut: (s: Seat) => void) =>
    studioStore.updateSeat(seat.id, mut);
  return (
    <div className="card" style={{ background: 'var(--bg)' }}>
      <h3>
        <input
          value={seat.name}
          onChange={(e) => update((s) => (s.name = e.target.value))}
        />
        <button
          className="danger"
          style={{ float: 'right' }}
          onClick={() => studioStore.deleteSeat(seat.id)}
        >
          删除
        </button>
      </h3>
      <div className="grid-3">
        <NumberField
          label="X 东 (m)"
          value={seat.x}
          step={0.1}
          onChange={(v) => update((s) => (s.x = v))}
        />
        <NumberField
          label="Y 北 (m)"
          value={seat.y}
          step={0.1}
          onChange={(v) => update((s) => (s.y = v))}
        />
        <NumberField
          label="Z 高 (m)"
          value={seat.z}
          step={0.1}
          onChange={(v) => update((s) => (s.z = v))}
        />
      </div>
    </div>
  );
};

export const SeatsPage = () => {
  const show = useActiveShow();
  const scene =
    show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
  const [selectedId, setSelectedId] = useState<string>(show.seats[0]?.id ?? '');
  const selected = show.seats.find((s) => s.id === selectedId) ?? null;
  const r = show.settings.domeDiameterM / 2;

  // 平面布置图坐标映射：场景坐标 → 百分比（覆盖 ±R 范围）
  const toPct = (v: number): number => ((v + r) / (2 * r)) * 100;

  // 选中座位在几个关键幕面点的角畸变
  const distortionProbes = selected
    ? [
        { name: '天顶', dir: { x: 0, y: 0, z: 1 } },
        { name: '北地平', dir: fromHoriz(0, 0) },
        { name: '东地平', dir: fromHoriz(deg2rad(90), 0) },
        { name: '南地平', dir: fromHoriz(deg2rad(180), 0) },
        { name: '西地平', dir: fromHoriz(deg2rad(270), 0) },
        { name: '仰角45°平均', dir: fromHoriz(deg2rad(45), deg2rad(45)) },
      ].map((p) => ({
        ...p,
        angle: seatDistortionAngle(selected, p.dir, show.settings),
      }))
    : [];

  return (
    <div className="page">
      <div className="split wide-left">
        <div>
          <Card title={`座位视角预览（${selected?.name ?? '未选择座位'}）`}>
            {selected ? (
              <DomePreview
                scene={scene}
                settings={show.settings}
                observer={show.observer}
                projectors={show.projectors}
                seat={selected}
                mode={3}
              />
            ) : (
              <p className="muted">请先在右侧添加并选择一个座位。</p>
            )}
          </Card>

          {selected && (
            <Card title="该座位看到的球幕角畸变（视线与幕面法线夹角）">
              <table className="table">
                <thead>
                  <tr>
                    <th>幕面点</th>
                    <th>角畸变</th>
                    <th>量级</th>
                  </tr>
                </thead>
                <tbody>
                  {distortionProbes.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="mono">{p.angle.toFixed(2)}°</td>
                      <td>
                        <Pill tone={p.angle > 25 ? 'err' : p.angle > 12 ? undefined : 'ok'}>
                          {p.angle > 25 ? '严重' : p.angle > 12 ? '中等' : '轻微'}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                最大理论畸变出现在座位另一侧的地平线附近；中心座位天顶处畸变恒为 0°。
              </p>
            </Card>
          )}
        </div>

        <div>
          <Card
            title="座位平面布置（俯视）"
            extra={
              <div className="row" style={{ margin: 0 }}>
                <button onClick={() => studioStore.addSeat()}>＋ 座位</button>
              </div>
            }
          >
            <div className="seat-map">
              {/* 球幕轮廓 */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '92%',
                  height: '92%',
                  transform: 'translate(-50%, -50%)',
                  border: '1px dashed var(--accent)',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                }}
              />
              {show.seats.map((s) => (
                <div
                  key={s.id}
                  className={`seat-dot ${s.id === selectedId ? 'active' : ''}`}
                  title={s.name}
                  style={{
                    left: `${Math.max(2, Math.min(98, toPct(s.x)))}%`,
                    top: `${Math.max(2, Math.min(98, 100 - toPct(s.y)))}%`,
                  }}
                  onClick={() => setSelectedId(s.id)}
                />
              ))}
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              圆点为座位（俯视，上北下南），虚线圆为球幕平面投影（半径 {r} m）。点击圆点选择。
            </p>
          </Card>

          {selected && <SeatEditor seat={selected} />}

          <Card title="快速布置">
            <div className="grid-2">
              <button
                onClick={() => {
                  if (
                    window.confirm('将按 4 排 × 5 列重置座位，现有座位会被替换。')
                  ) {
                    studioStore.updateActive((d) => {
                      d.seats = generateSeatGrid(4, 5, 2.2, -3.5);
                    });
                    setSelectedId(studioStore.active.seats[0]?.id ?? '');
                  }
                }}
              >
                重置为 4×5 网格
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
