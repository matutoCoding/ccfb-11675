/** 页面共用的 domemaster 预览画布 */
import { AnimProps, Show } from '../core/types';
import { camRotMatrix, FisheyeParams } from '../core/fisheye';
import { contentFromProps, DomeRenderer, skyUniforms } from '../render/renderer';
import { AppContext } from './router';

export class PreviewCanvas {
  canvas: HTMLCanvasElement;
  renderer: DomeRenderer;

  constructor(parent: HTMLElement, ctx: AppContext, size = 640) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.className = 'preview-canvas';
    parent.append(this.canvas);
    this.renderer = new DomeRenderer(this.canvas, ctx.settings.cubeSize);
    this.renderer.setStars(ctx.stars.map((s) => [s[0], s[1], s[2]] as [number, number, number]));
  }

  renderShow(show: Show, props: AnimProps, ctx: AppContext, withCamRot = true): void {
    const params: FisheyeParams = {
      size: this.canvas.width,
      fovDeg: show.dome.fovDeg,
      tiltDeg: show.dome.tiltDeg,
    };
    const sky = skyUniforms(props);
    const content = contentFromProps(props, {
      planets: show.planets,
      showSun: show.showSun,
      showMoon: show.showMoon,
      showGrid: show.showGrid,
      exposure: ctx.settings.starExposure,
    });
    const camRot = withCamRot ? camRotMatrix(props.camYaw, props.camPitch) : undefined;
    this.renderer.render(params, sky, content, camRot);
  }
}
