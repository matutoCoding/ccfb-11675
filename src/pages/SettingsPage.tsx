import { studioStore, useActiveShow } from '../state/store';
import { Card, NumberField, Slider, Pill } from '../ui/controls';
import { DomePreview } from '../ui/DomePreview';
import { DomeFov } from '../types';

export const SettingsPage = () => {
  const show = useActiveShow();
  const scene =
    show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
  const { settings } = show;

  return (
    <div className="page">
      <div className="split wide-left">
        <div>
          <Card title="参数实时预览">
            <DomePreview
              scene={scene}
              settings={settings}
              observer={show.observer}
              projectors={show.projectors}
            />
          </Card>
        </div>

        <div>
          <Card title="球幕几何">
            <NumberField
              label="球幕直径（米）"
              value={settings.domeDiameterM}
              step={0.5}
              min={2}
              max={60}
              onChange={(v) =>
                studioStore.updateSettings((s) => (s.domeDiameterM = v))
              }
            />
            <Slider
              label="球幕倾角"
              value={settings.domeTiltDeg}
              min={0}
              max={45}
              step={0.1}
              unit="°"
              decimals={1}
              onChange={(v) =>
                studioStore.updateSettings((s) => (s.domeTiltDeg = v))
              }
            />
            <Slider
              label="倾斜朝向方位角"
              value={settings.domeTiltAzimuthDeg}
              min={0}
              max={360}
              step={1}
              unit="°"
              decimals={0}
              onChange={(v) =>
                studioStore.updateSettings(
                  (s) => (s.domeTiltAzimuthDeg = v),
                )
              }
            />
            <p className="muted">
              倾角 {settings.domeTiltDeg}° 朝方位 {settings.domeTiltAzimuthDeg}°：
              鱼眼圆心（球幕天顶轴）已偏离世界天顶，可在预览中观察星空整体偏转。
            </p>
          </Card>

          <Card title="Domemaster 视场角">
            <div className="row">
              {([180, 210] as DomeFov[]).map((fov) => (
                <button
                  key={fov}
                  className={settings.fov === fov ? 'primary' : ''}
                  onClick={() =>
                    studioStore.updateSettings((s) => (s.fov = fov))
                  }
                >
                  {fov}° {fov === 180 ? '标准半球' : '扩展半球'}
                </button>
              ))}
            </div>
            <p className="muted">
              {settings.fov === 180
                ? '180°：画幅圆边缘对应地平线，最常见的 domemaster 格式。'
                : '210°：圆边缘对应天顶轴 105°，包含地平线以下 15° 区域，用于倾斜/扩展球幕。'}
            </p>
            <div className="row">
              <Pill>
                每像素角分辨率 ≈{' '}
                {(settings.fov / 2 / ((settings.previewResolution - 1) / 2)).toFixed(4)}°/px
              </Pill>
            </div>
          </Card>

          <Card title="渲染参数">
            <NumberField
              label="预览分辨率（边长 px）"
              value={settings.previewResolution}
              step={128}
              min={256}
              max={2048}
              onChange={(v) =>
                studioStore.updateSettings(
                  (s) => (s.previewResolution = Math.floor(v)),
                )
              }
            />
            <NumberField
              label="默认导出分辨率（边长 px）"
              value={settings.exportResolution}
              step={256}
              min={512}
              max={4096}
              onChange={(v) =>
                studioStore.updateSettings(
                  (s) => (s.exportResolution = Math.floor(v)),
                )
              }
            />
            <NumberField
              label="帧率（fps）"
              value={settings.fps}
              min={12}
              max={60}
              step={1}
              onChange={(v) =>
                studioStore.updateSettings((s) => (s.fps = Math.floor(v)))
              }
            />
            <p className="muted">
              切换预览分辨率会重建 cubemap 渲染目标；导出分辨率在「渲染导出」页单独指定。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
