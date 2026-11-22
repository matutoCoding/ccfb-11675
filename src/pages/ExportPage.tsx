import { useRef, useState } from 'react';
import { useActiveShow } from '../state/store';
import { Card, NumberField, Pill } from '../ui/controls';
import { useToast } from '../ui/Toast';
import { buildScene } from '../renderer/scene-builder';
import { DomeEngine } from '../renderer/dome-engine';
import {
  exportFrameSequence,
  ExportProgress,
} from '../renderer/export-png';
import { ExportJob } from '../types';

export const ExportPage = () => {
  const show = useActiveShow();
  const scene =
    show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DomeEngine | null>(null);
  const cancelRef = useRef(false);

  const [job, setJob] = useState<ExportJob>({
    startFrame: 0,
    endFrame: Math.min(60, Math.floor(scene.durationSec * show.settings.fps) - 1),
    resolution: show.settings.exportResolution,
    prefix: 'dome',
  });
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [asZip, setAsZip] = useState(true);

  const totalFrames = Math.floor(scene.durationSec * show.settings.fps);

  const ensureEngine = (resolution: number): DomeEngine => {
    const canvas = canvasRef.current!;
    if (!engineRef.current) {
      engineRef.current = new DomeEngine(canvas, resolution);
    } else if (engineRef.current.cubeSize !== resolution) {
      engineRef.current.resizeCube(resolution);
    }
    canvas.width = resolution;
    canvas.height = resolution;
    return engineRef.current;
  };

  const start = async () => {
    if (job.endFrame < job.startFrame) {
      toast('结束帧不能小于起始帧', 'err');
      return;
    }
    setBusy(true);
    cancelRef.current = false;
    try {
      const engine = ensureEngine(job.resolution);
      const frameToTime = (frame: number) => frame / show.settings.fps;

      const result = await exportFrameSequence(
        {
          startFrame: job.startFrame,
          endFrame: Math.min(job.endFrame, totalFrames - 1),
          resolution: job.resolution,
          prefix: job.prefix || 'dome',
          asZip,
        },
        {
          canvas: canvasRef.current!,
          renderFrame: (frame) => {
            const t = frameToTime(frame);
            const absDate = new Date(
              new Date(show.observer.utcIso).getTime() +
                t * 1000 * show.observer.timeRate,
            );
            const rs = buildScene(
              scene,
              show.observer,
              show.settings,
              t,
              absDate,
            );
            // 直接输出到 canvas（模式 0：标准鱼眼）
            engine.setOutputTarget(null);
            engine.renderFrame(rs, show.settings, 0, show.projectors, null);
            // 强制刷新，保证 toBlob 拿到最新帧
            const gl = canvasRef.current!.getContext('webgl2');
            gl?.finish();
          },
        },
        (p) => setProgress({ ...p }),
        () => cancelRef.current,
      );

      if (result.cancelled) {
        toast(`已取消，已完成 ${result.count} 帧`, 'err');
      } else {
        toast(`导出完成：共 ${result.count} 帧${asZip ? '（ZIP）' : ''}`);
      }
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const pct = progress
    ? Math.round(
        ((progress.frame - job.startFrame + 1) /
          Math.max(1, progress.total)) *
          100,
      )
    : 0;
  const currentFrameNo = progress
    ? Math.min(job.startFrame + progress.total - 1, progress.frame)
    : 0;

  return (
    <div className="page">
      <div className="split">
        <div>
          <Card title="导出预览（离屏画布，实际输出分辨率）">
            <div className="canvas-wrap">
              <canvas ref={canvasRef} style={{ maxHeight: 480 }} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              当前输出：{job.resolution}×{job.resolution} domemaster，FOV {show.settings.fov}°，
              倾角 {show.settings.domeTiltDeg}°，帧率 {show.settings.fps} fps。
            </p>
          </Card>
        </div>

        <div>
          <Card title="PNG 序列导出">
            <div className="grid-2">
              <NumberField
                label="起始帧"
                value={job.startFrame}
                min={0}
                max={totalFrames - 1}
                onChange={(v) => setJob((j) => ({ ...j, startFrame: Math.max(0, Math.floor(v)) }))}
              />
              <NumberField
                label="结束帧"
                value={job.endFrame}
                min={0}
                max={totalFrames - 1}
                onChange={(v) =>
                  setJob((j) => ({
                    ...j,
                    endFrame: Math.min(totalFrames - 1, Math.floor(v)),
                  }))
                }
              />
            </div>
            <NumberField
              label="输出边长（像素）"
              value={job.resolution}
              step={256}
              min={512}
              max={4096}
              onChange={(v) => setJob((j) => ({ ...j, resolution: Math.floor(v) }))}
            />
            <div className="field">
              <label>文件名前缀</label>
              <input
                value={job.prefix}
                onChange={(e) => setJob((j) => ({ ...j, prefix: e.target.value }))}
              />
            </div>
            <div className="row">
              <label style={{ width: 'auto' }}>
                <input
                  type="radio"
                  checked={asZip}
                  onChange={() => setAsZip(true)}
                />{' '}
                打包 ZIP（推荐）
              </label>
              <label style={{ width: 'auto' }}>
                <input
                  type="radio"
                  checked={!asZip}
                  onChange={() => setAsZip(false)}
                />{' '}
                逐张下载
              </label>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" onClick={start} disabled={busy}>
                {busy ? '导出中…' : '▶ 开始导出'}
              </button>
              <button
                className="danger"
                disabled={!busy}
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                ■ 取消
              </button>
            </div>

            {progress && (
              <>
                <div className="progress" style={{ margin: '12px 0 6px' }}>
                  <div style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="row">
                  <Pill tone={progress.cancelled ? 'err' : progress.done ? 'ok' : undefined}>
                    {progress.cancelled ? '已取消' : progress.done ? '完成' : '进行中'}
                  </Pill>
                  <span className="mono muted">
                    第 {currentFrameNo} 帧（{pct}%）
                  </span>
                </div>
              </>
            )}
            <p className="muted">
              共 {totalFrames} 帧（{scene.durationSec}s × {show.settings.fps}fps）。
              高分辨率导出为同步渲染，期间页面会短暂占用较高 GPU。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
