import { useState } from 'react';
import { studioStore, useActiveShow } from '../state/store';
import { Card, NumberField, Slider, Pill } from '../ui/controls';
import { DomePreview } from '../ui/DomePreview';
import { useToast } from '../ui/Toast';
import { Projector } from '../types';
import {
  validateFisheyeOnGPU,
  validateKnownDirections,
  ValidationResult,
} from '../renderer/fisheyeValidate';
import { useDomeRenderer } from '../renderer/useDomeRenderer';
import { fromHoriz, deg2rad } from '../math/vec3';

const ProjectorForm = ({ p }: { p: Projector }) => {
  const update = (mut: (x: Projector) => void) =>
    studioStore.updateProjector(p.id, mut);
  return (
    <div className="card" style={{ background: 'var(--bg)' }}>
      <h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => update((x) => (x.enabled = e.target.checked))}
          />
          <input
            value={p.name}
            onChange={(e) => update((x) => (x.name = e.target.value))}
          />
          <button
            className="danger"
            style={{ marginLeft: 'auto' }}
            onClick={() => studioStore.deleteProjector(p.id)}
          >
            删除
          </button>
        </label>
      </h3>
      <Slider
        label="方位角"
        value={p.azimuthDeg}
        min={0}
        max={360}
        step={1}
        unit="°"
        decimals={0}
        onChange={(v) => update((x) => (x.azimuthDeg = v))}
      />
      <Slider
        label="高度角"
        value={p.elevationDeg}
        min={-30}
        max={90}
        step={1}
        unit="°"
        decimals={0}
        onChange={(v) => update((x) => (x.elevationDeg = v))}
      />
      <div className="grid-2">
        <NumberField
          label="水平覆盖"
          value={p.widthDeg}
          min={10}
          max={180}
          suffix="°"
          onChange={(v) => update((x) => (x.widthDeg = v))}
        />
        <NumberField
          label="垂直覆盖"
          value={p.heightDeg}
          min={10}
          max={180}
          suffix="°"
          onChange={(v) => update((x) => (x.heightDeg = v))}
        />
      </div>
      <Slider
        label="融合带宽"
        value={p.blendWidthDeg}
        min={0}
        max={30}
        step={0.5}
        unit="°"
        decimals={1}
        onChange={(v) => update((x) => (x.blendWidthDeg = v))}
      />
      <Slider
        label="融合 Gamma"
        value={p.blendGamma}
        min={0.5}
        max={4}
        step={0.1}
        onChange={(v) => update((x) => (x.blendGamma = v))}
      />
      <Slider
        label="画面滚转"
        value={p.rollDeg}
        min={-45}
        max={45}
        step={0.5}
        unit="°"
        decimals={1}
        onChange={(v) => update((x) => (x.rollDeg = v))}
      />
    </div>
  );
};

/** 内嵌一个模式 1（方向编码）的隐藏引擎用于 GPU 校验 */
const ValidationPanel = () => {
  const show = useActiveShow();
  const scene = show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [detail, setDetail] = useState<string>('');
  const [running, setRunning] = useState(false);
  const toast = useToast();

  // 独立的小引擎，避免干扰预览画布
  const handle = useDomeRenderer({
    scene,
    settings: show.settings,
    observer: show.observer,
    projectors: [],
    seat: null,
    mode: 1,
    playing: false,
  });

  const run = () => {
    const engine = handle.engineRef.current;
    if (!engine) {
      toast('渲染引擎尚未就绪', 'err');
      return;
    }
    setRunning(true);
    // 等一帧让引擎完成初始化渲染
    requestAnimationFrame(() => {
      try {
        const r = validateFisheyeOnGPU(engine, show.settings, 512, 2);
        setResult(r);

        // 已知方向抽查：天顶、四个方位地平线、45° 仰角八方向
        const probes: Array<{ name: string; d: { x: number; y: number; z: number } }> = [
          { name: '天顶', d: { x: 0, y: 0, z: 1 } },
          { name: '北·地平', d: fromHoriz(0, 0) },
          { name: '东·地平', d: fromHoriz(deg2rad(90), 0) },
          { name: '南·地平', d: fromHoriz(deg2rad(180), 0) },
          { name: '西·地平', d: fromHoriz(deg2rad(270), 0) },
        ];
        for (let az = 0; az < 360; az += 45) {
          probes.push({
            name: `仰角45°/方位${az}°`,
            d: fromHoriz(deg2rad(az), deg2rad(45)),
          });
        }
        const checks = validateKnownDirections(
          engine,
          show.settings,
          probes.map((p) => p.d),
          512,
        );
        const lines = checks
          .filter((c) => c.inFrame)
          .map((c, i) => {
            const name = probes[i]?.name ?? '';
            return `${name.padEnd(12)} 像素(${c.pixel.px}, ${c.pixel.py})  误差 ${c.errorPx.toExponential(2)} px`;
          });
        setDetail(lines.join('\n'));
      } catch (e) {
        toast((e as Error).message, 'err');
      } finally {
        setRunning(false);
      }
    });
  };

  return (
    <Card
      title="鱼眼映射精度校验（GPU 实测）"
      extra={<button onClick={run} disabled={running}>{running ? '校验中…' : '▶ 运行校验'}</button>}
    >
      <p className="muted">
        渲染器把每个像素的世界方向编码进颜色后读回 CPU，与 <span className="mono">src/math/fisheye.ts</span> 的
        TS 参考公式逐像素比对。等距鱼眼全画面角分辨率恒定，角度误差按「度/像素」换算为像素位置误差。
      </p>
      <div style={{ display: 'none' }}>
        <canvas ref={handle.canvasRef} width={256} height={256} />
      </div>
      {result && (
        <>
          <div className="row">
            <Pill tone={result.passed ? 'ok' : 'err'}>
              {result.passed ? '通过：最大误差 < 0.5 像素' : '未通过'}
            </Pill>
            <span className="muted">
              画幅 {result.size}px，抽样 {result.samples} 个圆内像素，
              圆外 {result.outsideCircleSamples} 点黑场{' '}
              {result.outsideCircleCorrect ? '正确' : '错误'}
            </span>
          </div>
          <div className="validation-box">
{`最大角度误差  ${result.maxAngleErrorDeg.toExponential(3)} °
平均角度误差  ${result.meanAngleErrorDeg.toExponential(3)} °
RMS 角度误差  ${result.rmsAngleErrorDeg.toExponential(3)} °
─────────────────────────────
最大像素误差  ${result.maxPixelError.toExponential(3)} px   (阈值 0.5 px)
平均像素误差  ${result.meanPixelError.toExponential(3)} px
RMS 像素误差  ${result.rmsPixelError.toExponential(3)} px`}
          </div>
          {detail && (
            <>
              <h3>已知球面方向 → domemaster 像素位置核对</h3>
              <div className="validation-box">{detail}</div>
            </>
          )}
        </>
      )}
    </Card>
  );
};

export const ProjectionPage = () => {
  const show = useActiveShow();
  const scene =
    show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];

  return (
    <div className="page">
      <div className="split wide-left">
        <div>
          <Card title="投影覆盖与边缘融合遮罩（彩色分区，重叠区加亮）">
            <DomePreview
              scene={scene}
              settings={show.settings}
              observer={show.observer}
              projectors={show.projectors}
              mode={2}
            />
          </Card>
          <ValidationPanel />
        </div>
        <div>
          <Card
            title={`投影机分区（${show.projectors.filter((p) => p.enabled).length}/${show.projectors.length} 启用）`}
            extra={
              <button onClick={() => studioStore.addProjector()}>＋ 添加</button>
            }
          >
            {show.projectors.map((p) => (
              <ProjectorForm key={p.id} p={p} />
            ))}
            {show.projectors.length === 0 && (
              <p className="muted">尚无投影机，点击「添加」创建。</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
