// WebGL2 底层工具：编译、VAO、cubemap 帧缓冲

export interface GLProgram {
  program: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): GLProgram => {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || '(无信息)';
      const lost = gl.isContextLost();
      gl.deleteShader(sh);
      throw new Error(
        `着色器编译失败${lost ? '（WebGL 上下文已丢失）' : ''}: ${log}\n${src}`,
      );
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`着色器链接失败: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const attribs: Record<string, number> = {};
  const na = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number;
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(program, i);
    if (info) attribs[info.name] = gl.getAttribLocation(program, info.name);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const nu = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) {
      const name = info.name.replace(/\[0\]$/, '');
      uniforms[name] = gl.getUniformLocation(program, name);
    }
  }
  return { program, attribs, uniforms };
};

export interface VAO {
  vao: WebGLVertexArrayObject;
  vertexCount: number;
  indexCount: number;
  indexed: boolean;
  indexType: number;
  mode: number;
}

/** 由 Geometry 构建 VAO（位置 + 法线 + 可选点属性） */
export const createVAO = (
  gl: WebGL2RenderingContext,
  data: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint16Array | Uint32Array;
    pointAttributes?: Array<{
      name: string;
      size: number;
      data: Float32Array;
    }>;
  },
  mode: number,
  attribLocations: Record<string, number>,
): VAO => {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const bindBuffer = (loc: number, size: number, arr: Float32Array) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };

  bindBuffer(attribLocations.aPosition, 3, data.positions);
  if (attribLocations.aNormal !== undefined && data.normals.length > 0) {
    bindBuffer(attribLocations.aNormal, 3, data.normals);
  }
  for (const attr of data.pointAttributes ?? []) {
    const loc = attribLocations[attr.name];
    if (loc !== undefined) bindBuffer(loc, attr.size, attr.data);
  }

  let indexed = false;
  let indexCount = 0;
  let indexType: number = gl.UNSIGNED_SHORT;
  if (data.indices.length > 0) {
    const ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    indexed = true;
    indexCount = data.indices.length;
    indexType =
      data.indices instanceof Uint32Array
        ? gl.UNSIGNED_INT
        : gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);
  return {
    vao,
    vertexCount: data.positions.length / 3,
    indexCount,
    indexed,
    indexType,
    mode,
  };
};

export const drawVAO = (gl: WebGL2RenderingContext, v: VAO): void => {
  gl.bindVertexArray(v.vao);
  if (v.indexed) {
    gl.drawElements(v.mode, v.indexCount, v.indexType, 0);
  } else {
    gl.drawArrays(v.mode, 0, v.vertexCount);
  }
};

/** 创建立方体纹理 + 6 面帧缓冲（离屏渲染目标） */
export interface CubeTarget {
  texture: WebGLTexture;
  framebuffers: WebGLFramebuffer[];
  size: number;
}

export const createCubeTarget = (
  gl: WebGL2RenderingContext,
  size: number,
): CubeTarget => {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  for (let i = 0; i < 6; i++) {
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
      0,
      gl.RGBA8,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffers = [];
  for (let i = 0; i < 6; i++) {
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
      texture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Cubemap 面 ${i} 帧缓冲不完整`);
    }
    framebuffers.push(fb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffers, size };
};

/** 2D 纹理渲染目标（鱼眼输出 / 导出） */
export interface TextureTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  size: number;
}

export const createTextureTarget = (
  gl: WebGL2RenderingContext,
  size: number,
): TextureTarget => {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('2D 帧缓冲不完整');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer: fb, size };
};

export const checkWebGL2 = (
  canvas: HTMLCanvasElement,
): WebGL2RenderingContext => {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    preserveDrawingBuffer: true, // 导出 PNG 需要
    alpha: false,
  });
  if (!gl) {
    throw new Error('当前浏览器不支持 WebGL2，请使用最新版 Chrome/Edge/Firefox');
  }
  return gl;
};
