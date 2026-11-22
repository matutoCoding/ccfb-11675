// 着色器源码（GLSL ES 3.00）。
// 所有属性位置用 layout(location=) 固定，避免多 program 下 VAO location 错位。
// dome-warp 的鱼眼公式必须与 src/math/fisheye.ts 逐式对应，
// GPU 校验（fisheyeValidate.ts）会逐像素比对两者。

export const FULLSCREEN_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
void main() {
  gl_Position = vec4(aPosition.xy, 0.0, 1.0);
}`;

/**
 * 鱼眼 warp 片元着色器（domemaster 等距投影）。
 * NDC 直接由 gl_FragCoord 推导（不使用 varying，规避部分驱动的插值别名问题）。
 * uMode:
 *   0 = 正常预览（采样 cubemap 场景）
 *   1 = 方向编码（把世界方向编码为颜色，供精度校验 readPixels）
 *   2 = 投影机覆盖/融合遮罩
 *   3 = 座位视角（cubemap 内容按座位视线重采样）
 */
export const DOME_WARP_FS = `#version 300 es
precision highp float;

uniform samplerCube uCube;
uniform vec2  uResolution;    // 当前渲染目标边长（像素）
uniform int uMode;
uniform float uHalfFovRad;   // FOV/2（弧度）
uniform float uTiltRad;      // 球幕倾角（弧度）
uniform vec3  uTiltAxis;     // 倾斜旋转轴（世界系单位向量）
uniform vec3  uSeatEye;      // 座位眼睛位置（米，球心为原点）
uniform float uDomeRadius;   // 球幕半径（米）
uniform int   uProjectorCount;
// 投影机参数用标量数组元素展开（规避部分驱动对 struct/数组 uniform 的解析差异）
uniform vec3  uProjAxis[8];
uniform vec4  uProjRect[8];     // x=半宽tan, y=半高tan, z=融合带(弧度), w=gamma
uniform float uProjEnabled[8];

// Rodrigues 旋转：与 vec3.rotateAxis / fisheye.localToWorld 同一公式
vec3 rotateAxis(vec3 a, vec3 k, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  return a * c + cross(k, a) * s + k * dot(k, a) * (1.0 - c);
}

// 归一化画面坐标 -> 世界方向；严格镜像 fisheye.ndcToDir
vec3 ndcToDir(vec2 nd) {
  float r = length(nd);
  float theta = r * uHalfFovRad;
  vec3 dLocal;
  if (r < 1e-12) {
    dLocal = vec3(0.0, 0.0, 1.0);
  } else {
    float st = sin(theta);
    dLocal = vec3(st * nd.x / r, st * nd.y / r, cos(theta));
  }
  // 零倾角快速路径：避免退化叉积（cross 在平行/零向量上的驱动差异）
  if (abs(uTiltRad) < 1e-7) return dLocal;
  return rotateAxis(dLocal, uTiltAxis, uTiltRad);
}

out vec4 fragColor;

void main() {
  // 与 src/math/fisheye.ts 的 pixelToDir 严格同式：
  // gl_FragCoord 原点左下；先转左上原点像素坐标 (px,py)，再按 (size-1) 归一化。
  // ny 向上：px 向右、py 向下，故 nx 随 gl_FragCoord.x 增，ny 随 gl_FragCoord.y 增。
  float px = gl_FragCoord.x;
  float py = uResolution.y - gl_FragCoord.y;
  float nx = (px / (uResolution.x - 1.0)) * 2.0 - 1.0;
  float ny = 1.0 - (py / (uResolution.y - 1.0)) * 2.0;
  vec2 vNdc = vec2(nx, ny);
  float r = length(vNdc);
  if (r > 1.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  vec3 dirWorld = ndcToDir(vNdc);

  if (uMode == 1) {
    // 方向编码：[-1,1] -> [0,1]
    fragColor = vec4(dirWorld * 0.5 + 0.5, 1.0);
    return;
  }

  if (uMode == 2) {
    // 投影机覆盖与融合权重可视化
    vec3 axisSum = vec3(0.0);
    float totalW = 0.0;
    vec3 tint[3];
    tint[0] = vec3(0.25, 0.75, 1.0);
    tint[1] = vec3(1.0, 0.55, 0.25);
    tint[2] = vec3(0.55, 1.0, 0.35);
    for (int i = 0; i < 8; i++) {
      if (i >= uProjectorCount) break;
      if (uProjEnabled[i] < 0.5) continue;
      vec3 axis = uProjAxis[i];
      vec3 right = normalize(cross(axis, vec3(0.0, 0.0, 1.0)));
      vec3 up = normalize(cross(right, axis));
      float zc = dot(dirWorld, axis);
      if (zc <= 0.0) continue;
      float nx = dot(dirWorld, right) / zc / uProjRect[i].x;
      float ny = dot(dirWorld, up) / zc / uProjRect[i].y;
      if (abs(nx) > 1.0 || abs(ny) > 1.0) continue;
      float edgeN = min(1.0 - abs(nx), 1.0 - abs(ny));
      float edgeRad = edgeN * 0.5 * atan(min(uProjRect[i].x, uProjRect[i].y));
      float t = clamp(edgeRad / max(uProjRect[i].z, 1e-6), 0.0, 1.0);
      float w = pow(t, uProjRect[i].w);
      int ti = i - 3 * (i / 3); // i mod 3（GLSL 整数除法向零取整）
      axisSum += tint[ti] * w;
      totalW += w;
    }
    if (totalW <= 0.0) {
      fragColor = vec4(0.02, 0.02, 0.03, 1.0);
    } else {
      // 重叠区亮度提示：>1 用白色描出
      vec3 col = axisSum / max(totalW, 1e-6) * (0.35 + 0.4 * min(totalW, 1.0));
      if (totalW > 1.05) col += vec3(0.25) * clamp(totalW - 1.0, 0.0, 1.0);
      fragColor = vec4(col, 1.0);
    }
    return;
  }

  if (uMode == 3) {
    // 座位视角：幕面点 = R·dirWorld；视线 = normalize(幕面点 - 座位)
    vec3 surface = dirWorld * uDomeRadius;
    vec3 view = normalize(surface - uSeatEye);
    fragColor = texture(uCube, view);
    return;
  }

  // 默认模式：直接按世界方向采样 cubemap
  fragColor = texture(uCube, dirWorld);
}`;

/** 球体/行星：世界矩阵 + 简单方向光 */
export const MESH_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPos = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uViewProj * world;
}`;

export const MESH_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorldPos;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uOpacity;
uniform float uEmissive;
out vec4 fragColor;
void main() {
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  vec3 col = uColor * (0.18 + 0.82 * diff) * (1.0 - uEmissive)
           + uColor * uEmissive;
  fragColor = vec4(col, uOpacity);
}`;

/**
 * 星点：相机对齐的小四边形（billboard），不依赖 GL_POINTS 点精灵，
 * 在软件渲染（SwiftShader）与各厂商 GPU 上行为一致。
 * 每颗星 4 个顶点（corner.xy ∈ {-1,1}），顶点着色器内按视角右/上向量展开。
 */
export const STAR_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aCorner;   // 四边形角偏移 (-1..1)
layout(location = 3) in float aBrightness;
layout(location = 4) in vec3 aColor;
uniform mat4 uViewProj;
uniform float uPointScale;  // 世界单位尺寸系数（随距离/分辨率调整）
out float vBrightness;
out vec3 vStarColor;
out vec2 vCorner;
void main() {
  vec4 center = uViewProj * vec4(aPosition, 1.0);
  // 在裁剪空间展开：按 w 透视修正，尺寸与 gl_PointSize 等效
  float size = uPointScale * (0.8 + aBrightness * 2.2);
  vec4 corner = center + vec4(aCorner * size * center.w, 0.0, 0.0);
  gl_Position = corner;
  vBrightness = aBrightness;
  vStarColor = aColor;
  vCorner = aCorner;
}`;

export const STAR_FS = `#version 300 es
precision highp float;
in float vBrightness;
in vec3 vStarColor;
in vec2 vCorner;
out vec4 fragColor;
void main() {
  float d = length(vCorner);
  float core = smoothstep(1.0, 0.0, d);
  float halo = smoothstep(1.0, 0.2, d) * 0.35;
  float a = (core + halo) * vBrightness;
  if (a < 0.004) discard;
  fragColor = vec4(vStarColor * a, a);
}`;

/** 轨道线：纯色线条 */
export const LINE_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main() {
  gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
}`;

export const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;
