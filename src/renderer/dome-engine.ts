// DomeEngine：WebGL2 渲染管线
// 场景 → cubemap（6 面 90° 透视）→ 等距鱼眼 warp → 画布 / 离屏目标
// 四种 warp 模式：预览 / 方向编码（精度校验）/ 投影融合遮罩 / 座位视角

import { Vec3, v3, deg2rad, scale as vScale } from '../math/vec3';
import {
  Mat4,
  identity,
  perspective,
  lookAt,
  multiply,
  translation,
  scaling,
} from '../math/mat4';
import { tiltAxis, DomeGeometry } from '../math/fisheye';
import {
  makeSphere,
  makeQuad,
  Geometry,
} from '../math/geometry';
import { Projector, Seat, Settings } from '../types';
import {
  createProgram,
  createVAO,
  drawVAO,
  createCubeTarget,
  createTextureTarget,
  checkWebGL2,
  GLProgram,
  VAO,
  CubeTarget,
  TextureTarget,
} from './gl-utils';
import {
  FULLSCREEN_VS,
  DOME_WARP_FS,
  MESH_VS,
  MESH_FS,
  STAR_VS,
  STAR_FS,
  LINE_VS,
  LINE_FS,
} from './shaders';
import { RenderScene, StarInstance } from './scene-builder';
import { projectorAxis } from '../math/projection';

export type WarpMode = 0 | 1 | 2 | 3;

const MAX_PROJECTORS = 8;

export class DomeEngine {
  private gl: WebGL2RenderingContext;
  private warpProg!: GLProgram;
  private meshProg!: GLProgram;
  private starProg!: GLProgram;
  private lineProg!: GLProgram;
  private quadVAO!: VAO;
  private sphereGeo: Geometry;
  private sphereVAO!: VAO;
  private cube!: CubeTarget;
  private outTarget: TextureTarget | null = null;
  private starVAO: VAO | null = null;
  private starCount = 0;
  private orbitVAOs = new Map<string, VAO>();
  private proj!: Mat4;
  private faceViews: Mat4[] = [];

  constructor(canvas: HTMLCanvasElement, cubeSize: number) {
    this.gl = checkWebGL2(canvas);
    this.sphereGeo = makeSphere(28, 18);
    this.initPrograms();
    this.initGeometry();
    this.resizeCube(cubeSize);
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
  }

  private initPrograms(): void {
    const gl = this.gl;
    this.warpProg = createProgram(gl, FULLSCREEN_VS, DOME_WARP_FS);
    this.meshProg = createProgram(gl, MESH_VS, MESH_FS);
    this.starProg = createProgram(gl, STAR_VS, STAR_FS);
    this.lineProg = createProgram(gl, LINE_VS, LINE_FS);
  }

  private initGeometry(): void {
    const gl = this.gl;
    // 属性位置与着色器 layout(location=) 一一对应
    this.quadVAO = createVAO(
      gl,
      { ...makeQuad(), normals: new Float32Array(0) },
      gl.TRIANGLES,
      { aPosition: 0 },
    );
    this.sphereVAO = createVAO(
      gl,
      this.sphereGeo,
      gl.TRIANGLES,
      { aPosition: 0, aNormal: 1 },
    );
  }

  /** 调整 cubemap 分辨率（设置页切换时调用） */
  resizeCube(size: number): void {
    const gl = this.gl;
    if (this.cube) {
      gl.deleteTexture(this.cube.texture);
      this.cube.framebuffers.forEach((f) => gl.deleteFramebuffer(f));
    }
    this.cube = createCubeTarget(gl, size);
    // 90° 透视，aspect=1，near 给极小值以容纳单位球面上的星点
    this.proj = perspective(Math.PI / 2, 1, 0.05, 200);
    // 六个面的观察方向（WebGL2 规范 9.2.1，texture(cube, dir) 与朝向严格对应）
    const eyes: Array<{ c: Vec3; up: Vec3 }> = [
      { c: v3(1, 0, 0), up: v3(0, -1, 0) }, // +X
      { c: v3(-1, 0, 0), up: v3(0, -1, 0) }, // -X
      { c: v3(0, 1, 0), up: v3(0, 0, 1) }, // +Y
      { c: v3(0, -1, 0), up: v3(0, 0, -1) }, // -Y
      { c: v3(0, 0, 1), up: v3(0, -1, 0) }, // +Z
      { c: v3(0, 0, -1), up: v3(0, -1, 0) }, // -Z
    ];
    this.faceViews = eyes.map((e) => lookAt(v3(0, 0, 0), e.c, e.up));
  }

  /** 离屏导出目标（null = 直接画到 canvas） */
  setOutputTarget(target: TextureTarget | null): void {
    this.outTarget = target;
  }

  createOffscreenTarget(size: number): TextureTarget {
    return createTextureTarget(this.gl, size);
  }

  deleteTarget(t: TextureTarget): void {
    this.gl.deleteTexture(t.texture);
    this.gl.deleteFramebuffer(t.framebuffer);
  }

  /** 读取当前绑定目标的像素（导出/校验用） */
  readPixels(size: number): Uint8Array {
    const gl = this.gl;
    const px = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  private uploadStars(stars: StarInstance[]): void {
    const gl = this.gl;
    const n = stars.length;
    const vertsPerStar = 4;
    const positions = new Float32Array(n * vertsPerStar * 3);
    const corners = new Float32Array(n * vertsPerStar * 2);
    const bright = new Float32Array(n * vertsPerStar);
    const colors = new Float32Array(n * vertsPerStar * 3);
    const cornerOffset = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    stars.forEach((s, i) => {
      for (let k = 0; k < vertsPerStar; k++) {
        const vi = i * vertsPerStar + k;
        positions[vi * 3] = s.dir.x * 50;
        positions[vi * 3 + 1] = s.dir.y * 50;
        positions[vi * 3 + 2] = s.dir.z * 50;
        corners[vi * 2] = cornerOffset[k][0];
        corners[vi * 2 + 1] = cornerOffset[k][1];
        bright[vi] = s.brightness;
        colors[vi * 3] = s.color.x;
        colors[vi * 3 + 1] = s.color.y;
        colors[vi * 3 + 2] = s.color.z;
      }
    });
    // 每颗星两个三角形
    const indices = new Uint32Array(n * 6);
    stars.forEach((_, i) => {
      const b = i * 4;
      const o = i * 6;
      indices[o] = b;
      indices[o + 1] = b + 1;
      indices[o + 2] = b + 2;
      indices[o + 3] = b;
      indices[o + 4] = b + 2;
      indices[o + 5] = b + 3;
    });
    if (this.starVAO) gl.deleteVertexArray(this.starVAO.vao);
    this.starVAO = createVAO(
      gl,
      {
        positions,
        normals: new Float32Array(0),
        indices,
        pointAttributes: [
          { name: 'aCorner', size: 2, data: corners },
          { name: 'aBrightness', size: 1, data: bright },
          { name: 'aColor', size: 3, data: colors },
        ],
      },
      gl.TRIANGLES,
      {
        aPosition: 0,
        aCorner: 2,
        aBrightness: 3,
        aColor: 4,
      },
    );
    this.starCount = n * vertsPerStar;
  }

  private getOrbitVAO(points: Vec3[]): VAO {
    const gl = this.gl;
    const key = points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|');
    const existing = this.orbitVAOs.get(key);
    if (existing) return existing;
    const positions = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    });
    const vao = createVAO(
      gl,
      {
        positions,
        normals: new Float32Array(0),
        indices: new Uint16Array(0),
      },
      gl.LINE_STRIP,
      { aPosition: 0 },
    );
    // 只保留最近 16 条，避免长期编辑时膨胀
    if (this.orbitVAOs.size > 16) {
      const firstKey = this.orbitVAOs.keys().next().value;
      if (firstKey) this.orbitVAOs.delete(firstKey);
    }
    this.orbitVAOs.set(key, vao);
    return vao;
  }

  /** 第一遍：场景渲染进 cubemap 六个面 */
  private renderToCube(scene: RenderScene): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.uploadStars([...scene.stars, ...scene.milkyWay]);

    for (let face = 0; face < 6; face++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cube.framebuffers[face]);
      gl.viewport(0, 0, this.cube.size, this.cube.size);
      gl.clearColor(0.012, 0.014, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const vp = multiply(this.proj, this.faceViews[face]);

      // 通道 1：星点作为背景先画，禁用深度写入避免被后续实体遮挡
      if (this.starCount > 0 && this.starVAO) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // 加法混合，星光叠加
        gl.useProgram(this.starProg.program);
        gl.uniformMatrix4fv(this.starProg.uniforms.uViewProj, false, vp);
        // 裁剪空间四边形半边长（NDC 单位）：基础尺寸 6 像素 / 面宽，
        // 着色器内再按亮度（星等）放大 0.8~2.4 倍
        gl.uniform1f(
          this.starProg.uniforms.uPointScale,
          6 / this.cube.size,
        );
        drawVAO(gl, this.starVAO);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
      }

      // 通道 2：行星（球体），正常深度测试
      gl.useProgram(this.meshProg.program);
      gl.uniformMatrix4fv(this.meshProg.uniforms.uViewProj, false, vp);
      gl.uniform3fv(this.meshProg.uniforms.uLightDir, [
        scene.sunDir.x,
        scene.sunDir.y,
        scene.sunDir.z,
      ]);
      for (const p of scene.planets) {
        const model = multiply(
          translation(p.position),
          scaling(v3(p.radius, p.radius, p.radius)),
        );
        gl.uniformMatrix4fv(this.meshProg.uniforms.uModel, false, model);
        gl.uniform3fv(this.meshProg.uniforms.uColor, [
          p.color.x,
          p.color.y,
          p.color.z,
        ]);
        gl.uniform1f(this.meshProg.uniforms.uOpacity, p.opacity);
        gl.uniform1f(this.meshProg.uniforms.uEmissive, p.emissive);
        drawVAO(gl, this.sphereVAO);
      }

      // 太阳（发光球）
      if (scene.showSun) {
        const sunPos = vScale(scene.sunDir, 30);
        const model = multiply(
          translation(sunPos),
          scaling(v3(2.2, 2.2, 2.2)),
        );
        gl.uniformMatrix4fv(this.meshProg.uniforms.uModel, false, model);
        gl.uniform3fv(this.meshProg.uniforms.uColor, [
          scene.sunColor.x,
          scene.sunColor.y,
          scene.sunColor.z,
        ]);
        gl.uniform1f(this.meshProg.uniforms.uOpacity, 1);
        gl.uniform1f(this.meshProg.uniforms.uEmissive, 1);
        drawVAO(gl, this.sphereVAO);
      }

      // 通道 3：轨道线叠加
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.lineProg.program);
      gl.uniformMatrix4fv(this.lineProg.uniforms.uViewProj, false, vp);
      gl.uniformMatrix4fv(this.lineProg.uniforms.uModel, false, identity());
      gl.uniform4fv(this.lineProg.uniforms.uColor, [0.45, 0.6, 0.85, 0.55]);
      for (const p of scene.planets) {
        if (!p.orbitPoints) continue;
        drawVAO(gl, this.getOrbitVAO(p.orbitPoints));
      }
      gl.disable(gl.BLEND);
    }
  }

  /** 第二遍：鱼眼 warp 到 canvas 或离屏目标 */
  private warp(
    settings: Settings,
    mode: WarpMode,
    projectors: Projector[],
    seat: Seat | null,
  ): void {
    const gl = this.gl;
    const size = this.outTarget ? this.outTarget.size : this.canvasSize();
    if (this.outTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.outTarget.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const g: DomeGeometry = {
      fovDeg: settings.fov,
      tiltDeg: settings.domeTiltDeg,
      tiltAzimuthDeg: settings.domeTiltAzimuthDeg,
    };
    const axis = tiltAxis(g);

    gl.useProgram(this.warpProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cube.texture);
    gl.uniform1i(this.warpProg.uniforms.uCube, 0);
    gl.uniform2f(this.warpProg.uniforms.uResolution, size, size);
    gl.uniform1i(this.warpProg.uniforms.uMode, mode);
    gl.uniform1f(
      this.warpProg.uniforms.uHalfFovRad,
      deg2rad(settings.fov / 2),
    );
    gl.uniform1f(this.warpProg.uniforms.uTiltRad, deg2rad(settings.domeTiltDeg));
    gl.uniform3fv(this.warpProg.uniforms.uTiltAxis, [axis.x, axis.y, axis.z]);

    const radius = settings.domeDiameterM / 2;
    if (seat) {
      gl.uniform3fv(this.warpProg.uniforms.uSeatEye, [
        seat.x,
        seat.y,
        seat.z,
      ]);
    } else {
      gl.uniform3fv(this.warpProg.uniforms.uSeatEye, [0, 0, 0]);
    }
    gl.uniform1f(this.warpProg.uniforms.uDomeRadius, radius);

    // 投影机数组（标量展开，兼容软件渲染器）
    const count = Math.min(projectors.length, MAX_PROJECTORS);
    gl.uniform1i(this.warpProg.uniforms.uProjectorCount, count);
    const axes: number[] = [];
    const rects: number[] = [];
    const enabled: number[] = [];
    for (let i = 0; i < MAX_PROJECTORS; i++) {
      const p = projectors[i];
      if (p) {
        const ax = projectorAxis(p);
        axes.push(ax.x, ax.y, ax.z);
        rects.push(
          Math.tan(deg2rad(p.widthDeg / 2)),
          Math.tan(deg2rad(p.heightDeg / 2)),
          deg2rad(p.blendWidthDeg),
          p.blendGamma,
        );
        enabled.push(p.enabled ? 1 : 0);
      } else {
        axes.push(0, 0, 1);
        rects.push(1, 1, 0, 1);
        enabled.push(0);
      }
    }
    gl.uniform3fv(this.warpProg.uniforms.uProjAxis, axes);
    gl.uniform4fv(this.warpProg.uniforms.uProjRect, rects);
    gl.uniform1fv(this.warpProg.uniforms.uProjEnabled, enabled);

    drawVAO(gl, this.quadVAO);
    gl.enable(gl.DEPTH_TEST);
  }

  private canvasSize(): number {
    return this.gl.canvas.width;
  }

  /** 完整一帧 */
  renderFrame(
    scene: RenderScene,
    settings: Settings,
    mode: WarpMode,
    projectors: Projector[],
    seat: Seat | null,
  ): void {
    this.renderToCube(scene);
    this.warp(settings, mode, projectors, seat);
  }

  /** 只跑 warp（方向编码校验时复用已有 cubemap 亦可，独立方法供校验器） */
  renderWarpOnly(
    settings: Settings,
    mode: WarpMode,
    projectors: Projector[],
    seat: Seat | null,
  ): void {
    this.warp(settings, mode, projectors, seat);
  }

  get cubeSize(): number {
    return this.cube.size;
  }

  /** 诊断：读回指定 cubemap 面的像素（面索引 0..5） */
  readCubeFace(face: number): Uint8Array {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cube.framebuffers[face]);
    const s = this.cube.size;
    const px = new Uint8Array(s * s * 4);
    gl.readPixels(0, 0, s, s, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px;
  }

  dispose(): void {
    const gl = this.gl;
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
