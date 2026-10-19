// hd2d.js — HD-2D 合成器（WebGL2）（ccline-0b）
// 「像素是骨、光影是肉」：每層 320×180 的像素畫布用 NEAREST 放大（像素邊緣保持銳利），
// 景深、移軸、動態光源、霧、泛光、體積光、調色、暗角、顆粒都在高解析度下平滑計算。
// render.js 每幀呼叫 HD2D.frame()；不支援 WebGL2 時 HD2D.init() 回傳 false，render 走 2D 退回路徑。
(function () {
  'use strict';
  const MAX_LIGHTS = 32;
  const MAX_OUT_W = 1920;
  // 圖層順序（由遠到近）與預設深度、視差；ui 層不做後製、不受鏡頭影響
  const LAYERS = [
    { name: 'sky',    depth: 0.00, parallax: 0.05 },
    { name: 'far',    depth: 0.20, parallax: 0.20 },
    { name: 'ground', depth: 0.60, parallax: 0.70 },
    { name: 'mid',    depth: 0.60, parallax: 0.50 },
    { name: 'actors', depth: 0.65, parallax: 0.75 },
    { name: 'fg',     depth: 1.00, parallax: 1.30 }
  ];
  const LAYER_DEPTH = {};
  LAYERS.forEach(function (l) { LAYER_DEPTH[l.name] = l.depth; });

  function hex(c, def) {
    if (Array.isArray(c)) return c;
    if (typeof c !== 'string') return def;
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return def;
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  // 各地區調色（DESIGN-v2 §7.3）：key=主光色、shadow=陰影色調、bloom、霧、主光位置（體積光預設來源）
  const GRADES = {
    meadow:  { ambientLevel: 0.86, key: '#fff2d0', shadow: '#3a4a7a', bloom: 0.35, fog: { color: '#dfe8f0', density: 0.18, horizon: 95 },  sun: { x: 40, y: -20, strength: 0.9 } },
    beach:   { ambientLevel: 0.82, key: '#ffb060', shadow: '#4a2a5a', bloom: 0.32, fog: { color: '#ffc890', density: 0.22, horizon: 100 }, sun: { x: 230, y: 70, strength: 1.1 } },
    volcano: { ambientLevel: 0.5, key: '#ff5a20', shadow: '#1a0808', bloom: 0.70, fog: { color: '#3a1810', density: 0.35, horizon: 170 }, sun: null, moon: '#7a9ad8' },
    snow:    { ambientLevel: 0.92, key: '#e8f4ff', shadow: '#3a5a8a', bloom: 0.30, fog: { color: '#f4f8ff', density: 0.42, horizon: 110 }, sun: null },
    sky:     { ambientLevel: 0.86, key: '#fffbe8', shadow: '#5a7ab8', bloom: 0.32, fog: { color: '#f0f4ff', density: 0.30, horizon: 150 }, sun: { x: 220, y: -30, strength: 1.4 } },
    battle:  { ambientLevel: 0.42, key: '#ffb040', shadow: '#1a1428', bloom: 0.50, fog: { color: '#2a2438', density: 0.25, horizon: 170 }, sun: null }
  };
  GRADES.dungeon = GRADES.battle;
  const GLOBAL = { vignette: 0.30, grain: 0.03, sat: 1.10, blackLift: 0.035, shadowMix: 0.25 };

  // 畫質（27 的定義）：low = 只疊層；mid = 光源＋霧＋暗角＋調色；high = 全部（景深、移軸、泛光、體積光、顆粒）
  const QUALITY = {
    low:  { scale: 3, /* 內部寬度上限 = 邏輯寬 × scale */ dof: false, taps: 0,  light: false, bloom: false, rays: false, grain: false, grade: false },
    mid:  { scale: 6, dof: false, taps: 0,  light: true,  bloom: false, rays: false, grain: false, grade: true },
    high: { scale: 6, dof: true,  taps: 16, light: true,  bloom: true,  rays: true,  grain: true,  grade: true }
  };
  const ORDER = ['low', 'mid', 'high'];
  const MAX_BLUR = 3.0; // 景深最大模糊（邏輯像素）
  // 景深曲線：離焦點的正規化距離（焦點後方以 focus 為 1、前方以 1−focus 為 1）的 1.3 次方
  // focus 0.65 時：ground/mid 0.6 → 4%、far 0.2 → 62%、sky 0 → 100%、fg 1.0 → 100%
  function blurCurve(depth, focus) {
    const d = depth < focus ? (focus - depth) / Math.max(focus, 0.01) : (depth - focus) / Math.max(1 - focus, 0.01);
    return Math.pow(Math.min(1, d), 1.3);
  }

  // ---------- 著色器 ----------
  const VS = `#version 300 es
  in vec2 aPos; out vec2 vUv;
  void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // 單層合成：鏡頭位移 → 依（深度差＋畫面 y 的移軸）決定模糊 → 光源 → 霧 → 疊到下方
  const FS_LAYER = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uLayer, uLayerSoft, uPrev;
  uniform float uModern;           // 1 = 現代插畫：linear 取樣（不對齊像素格）   // 同一張圖：uLayer 最近鄰（銳利像素）、uLayerSoft 線性＋mipmap（平滑散景）
  uniform vec2 uLogical;
  uniform vec2 uOffset;            // 這一層的鏡頭位移（邏輯像素）
  uniform float uZoom;
  uniform float uDepthBlur;        // 這一層因深度差產生的模糊（邏輯像素）
  uniform float uTilt;             // 移軸強度（邏輯像素）
  uniform int uTaps;
  uniform float uDepth;
  uniform float uLightOn;
  uniform vec3 uAmbient;
  uniform float uAmbientMin;       // 這一層環境光的最低值（暗場景讓角色浮出來；0 = 不限制）
  uniform vec4 uRim;               // 邊緣光顏色 rgb＋強度 a（只用在 actors 層）
  uniform vec2 uRimDir;            // 邊緣光來自哪個方向（圖層像素，y 向下為正，例如熔岩在下方 = (0, 1)）
  uniform int uLightCount;
  uniform vec4 uLightPos[${MAX_LIGHTS}];   // x, y（邏輯像素，y 向下）, radius, depth
  uniform vec4 uLightCol[${MAX_LIGHTS}];   // r, g, b, intensity
  uniform vec4 uFog;               // r, g, b, density
  uniform float uFogHorizon;       // 邏輯像素 y
  const float GOLDEN = 2.39996323;
  vec2 layerUv(vec2 uv){
    vec2 p = (uv - 0.5) / uZoom + 0.5;           // 以畫面中心縮放
    return p + uOffset / uLogical;
  }
  vec4 nearest(vec2 uv){
    return texture(uLayer, (floor(uv * uLogical) + 0.5) / uLogical);
  }
  void main(){
    vec2 uv = layerUv(vUv);
    // 移軸：焦點帶在畫面 y（由上往下）55%–80%，往上漸糊、最下緣也糊
    float yTop = 1.0 - vUv.y;
    float band = yTop < 0.55 ? (0.55 - yTop) / 0.55 : (yTop > 0.80 ? (yTop - 0.80) / 0.20 : 0.0);
    float blur = uDepthBlur + uTilt * band * band;
    vec4 c;
    if (uTaps == 0 || blur < 0.3) {
      c = uModern > 0.5 ? textureLod(uLayerSoft, uv, 0.0) : nearest(uv);
    } else {
      vec4 acc = vec4(0.0);
      // 每個像素隨機旋轉取樣圖案，避免亮點被模糊成一圈圈的點（改成平滑的顆粒）
      // 交錯梯度雜訊（IGN）：不用 sin，在各家 GPU 上都穩定
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float ign2 = fract(52.9829189 * fract(dot(gl_FragCoord.yx + 17.0, vec2(0.06711056, 0.00583715))));
      float rot = ign * 6.2831853;
      float jit = ign2;
      float lod = max(0.0, log2(blur * 0.6));   // 模糊越大取越粗的 mipmap，取樣點之間不會有空隙
      for (int i = 0; i < 32; i++) {
        if (i >= uTaps) break;
        float r = sqrt((float(i) + jit) / float(uTaps)) * blur;   // 半徑也要抖動，否則會落在固定的同心圓上
        float a = float(i) * GOLDEN + rot;
        vec4 s = textureLod(uLayerSoft, uv + vec2(cos(a), sin(a)) * r / uLogical, lod);
        acc += vec4(s.rgb * s.a, s.a);
      }
      acc /= float(uTaps);
      c = acc.a > 0.001 ? vec4(acc.rgb / acc.a, acc.a) : vec4(0.0);
    }
    vec2 px = vec2(uv.x, 1.0 - uv.y) * uLogical;   // 這個片段在本層的邏輯座標（y 向下）
    if (uLightOn > 0.5) {
      vec3 light = max(uAmbient, vec3(uAmbientMin));
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        if (i >= uLightCount) break;
        vec4 lp = uLightPos[i]; vec4 lc = uLightCol[i];
        float d = length(px - lp.xy) / max(lp.z, 1.0);
        float att = clamp(1.0 - d, 0.0, 1.0); att = att * att * (3.0 - 2.0 * att);
        float dz = 1.0 - clamp(abs(uDepth - lp.w) * 1.6, 0.0, 1.0);
        light += lc.rgb * lc.a * att * (0.3 + 0.7 * dz);
      }
      c.rgb *= light;
      if (uRim.a > 0.0 && c.a > 0.5) {
        vec2 st = vec2(uRimDir.x, -uRimDir.y) / uLogical;   // 紋理座標 y 向上
        // 細亮邊：只看往光源方向 1、2 個單位（uRimDir 已乘上圖層倍率，現代模式約 4、8 像素）
        float edge = 1.0 - texture(uLayerSoft, uv + st).a;
        edge = max(edge, (1.0 - texture(uLayerSoft, uv + st * 2.0).a) * 0.5);
        c.rgb += uRim.rgb * uRim.a * edge;
      }
      // 霧：越遠越濃，在地平線附近最濃（空氣透視）
      float f = uFog.a * 0.7 * exp(-abs(px.y - uFogHorizon) / 32.0) * (1.0 - uDepth * 0.85) * (uDepth < 0.05 ? 0.5 : 1.0);
      c.rgb = mix(c.rgb, uFog.rgb, clamp(f, 0.0, mix(0.85, 0.3, smoothstep(0.5, 0.62, uDepth))));
    }
    vec4 prev = texture(uPrev, vUv);
    o = vec4(c.rgb * c.a + prev.rgb * (1.0 - c.a), 1.0);
  }`;

  const FS_BRIGHT = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uTex; uniform float uThreshold;
  void main(){
    vec3 c = texture(uTex, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    o = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, l), 1.0);
  }`;

  const FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uTex; uniform vec2 uDir;
  void main(){
    vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
    c += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    c += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    o = vec4(c, 1.0);
  }`;

  // 體積光：從光源往外的徑向模糊（只取亮部），乘上主光色
  const FS_RAYS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uTex; uniform vec2 uCenter; uniform float uStrength; uniform vec3 uKey;
  void main(){
    vec2 d = (vUv - uCenter) / 48.0;
    vec2 uv = vUv; vec3 acc = vec3(0.0); float decay = 1.0;
    for (int i = 0; i < 48; i++) { uv -= d; acc += texture(uTex, uv).rgb * decay; decay *= 0.96; }
    o = vec4(acc / 48.0 * uStrength * uKey, 1.0);
  }`;

  // 輸出：泛光、體積光 → 色調映射 → 分離色調（陰影偏 shadow、亮部偏 key）→ 飽和 → 暗角 → 顆粒 → 白閃 → ui 層
  const FS_FINAL = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uScene, uBloom, uRays, uUi, uUiSoft, uActors;
  uniform float uActOn, uZoomF;
  uniform vec2 uActOff;
  uniform float uUiHiRes;
  uniform vec2 uLogical;
  uniform float uBloomAmt, uRaysOn, uGradeOn, uVignette, uGrain, uTime, uFlash, uUiOn, uSat, uLift;
  uniform vec3 uKey, uShadow;
  uniform int uHaloCount;
  uniform vec4 uHaloPos[${MAX_LIGHTS}];   // 螢幕邏輯座標 x, y（y 向下）, 半徑, 0
  uniform vec4 uHaloCol[${MAX_LIGHTS}];   // r, g, b, 強度
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec3 c = texture(uScene, vUv).rgb;
    // 光源光暈（加法）：火把、熔岩、金幣周圍可見的暖色光團
    vec2 sp = vec2(vUv.x, 1.0 - vUv.y) * uLogical;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uHaloCount) break;
      vec4 hp = uHaloPos[i];
      float d = length(sp - hp.xy) / max(hp.z, 1.0);
      vec3 h = clamp(uHaloCol[i].rgb * uHaloCol[i].a * exp(-d * d * 3.0), 0.0, 1.0);
      c = 1.0 - (1.0 - min(c, 1.0)) * (1.0 - h);   // screen 混合：亮的地方不會再被加到死白
    }
    if (uGradeOn > 0.5) {
      // 角色所在位置：泛光和光束減弱 75%，淺色角色在亮背景上不會被洗白
      float act = 0.0;
      if (uActOn > 0.5) { vec2 ap = (vUv - 0.5) / uZoomF + 0.5 + uActOff / uLogical; act = texture(uActors, (floor(ap * uLogical) + 0.5) / uLogical).a; }
      float keep = 1.0 - 0.75 * act;
      c += texture(uBloom, vUv).rgb * uBloomAmt * keep;
      vec3 ray = clamp(texture(uRays, vUv).rgb * uRaysOn, 0.0, 0.6) * keep;
      c = 1.0 - (1.0 - min(c, 1.0)) * (1.0 - ray);      // 光束也用 screen，並且設上限
      // 柔膝色調映射：0.8 以下維持原樣（保留像素原色和對比），只把泛光和強光平滑壓進 1.0
      vec3 over = max(c - 0.8, 0.0);
      c = min(c, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
      // 分離色調：陰影偏 shadow 色相、亮部偏 key 色相（正規化亮度，只改色不改明暗）
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 sh = uShadow / max(dot(uShadow, vec3(0.2126, 0.7152, 0.0722)), 0.01);
      vec3 ky = uKey / max(dot(uKey, vec3(0.2126, 0.7152, 0.0722)), 0.01);
      c *= mix(vec3(1.0), mix(sh, ky, smoothstep(0.1, 0.8, l)), 0.22);
      c = c * (1.0 - uLift) + uLift;                                                     // 黑位稍微抬高
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      vec2 v = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.30, 0.85, length(v * vec2(1.2, 1.0)));
      c += (hash(floor(vUv * 900.0) + uTime) - 0.5) * uGrain;
    }
    c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
    if (uUiOn > 0.5) {
      // ui 層和邏輯解析度相同時對齊像素（像素字）；比較大時（例如 1280×720 的清晰文字）直接平滑取樣
      vec4 u = uUiHiRes > 0.5 ? texture(uUiSoft, vUv) : texture(uUi, (floor(vUv * uLogical) + 0.5) / uLogical);
      c = mix(c, u.rgb, u.a);
    }
    o = vec4(c, 1.0);
  }`;

  // ---------- WebGL ----------
  let gl = null, canvas = null, quality = 'high', programs = {}, quad = null;
  const tex = {};   // 圖層名稱 -> texture
  const fbo = {};
  let outW = 0, outH = 0;
  let emptyTex = null, softSampler = null, uiSampler = null, measureCb = null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }
  function makeTex(filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function target(name, w, h) {
    const f = fbo[name];
    if (f && f.w === w && f.h === h) return f;
    if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
    const t = makeTex(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return (fbo[name] = { fb: fb, tex: t, w: w, h: h });
  }
  function clear(f) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
    gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function draw(prog, dst, uniforms, textures) {
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : outW, dst ? dst.h : outH);
    let unit = 0;
    Object.keys(textures || {}).forEach(function (k) {
      const t = textures[k];
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex || t);
      gl.bindSampler(unit, t.sampler || null);
      gl.uniform1i(prog.u[k], unit++);
    });
    Object.keys(uniforms || {}).forEach(function (k) {
      const loc = prog.u[k], v = uniforms[k];
      if (loc == null) return;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.int != null) gl.uniform1i(loc, v.int);
      else if (v.vec4) gl.uniform4fv(loc, v.vec4);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
    });
    gl.bindVertexArray(quad);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  const texKey = {};   // 圖層名稱 -> 上次上傳的 canvas 和 version
  function upload(name, cv, version) {
    if (!tex[name]) tex[name] = makeTex(gl.NEAREST);
    // 現代背景的靜態層會帶 version：同一張 canvas、version 沒變就不重傳（1280×720 每層每幀重傳太貴）
    const k = texKey[name];
    if (version != null && k && k.cv === cv && k.v === version) return tex[name];
    texKey[name] = { cv: cv, v: version };
    gl.bindTexture(gl.TEXTURE_2D, tex[name]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    if (name !== 'ui') gl.generateMipmap(gl.TEXTURE_2D);
    return tex[name];
  }

  // ---------- 效能：連續 2 秒低於 40fps 就降一級（高 → 中 → 低）----------
  const perf = { last: 0, low: 0, frames: 0, acc: 0, fps: 60, ms: 0 };
  function trackFps(now) {
    const raw = (now - perf.last) / 1000;
    // 單幀超過 200ms 是分頁被節流、切回分頁或一次性卡頓，不能拿來判斷 GPU 負擔
    if (!perf.last || raw > 0.2 || document.hidden) { perf.last = now; perf.low = 0; return; }
    {
      const dt = raw;
      perf.frames++; perf.acc += dt;
      if (perf.acc >= 0.5) { perf.fps = perf.frames / perf.acc; perf.frames = 0; perf.acc = 0; }
      const auto = HD2D.autoQuality && !(window.Game && Game.state && Game.state.settings && Game.state.settings.autoQuality === false);
      if (auto && perf.fps < 40) perf.low += dt; else perf.low = 0;
      if (perf.low >= 2) {
        perf.low = 0;
        const i = ORDER.indexOf(quality);
        if (i > 0) {
          HD2D.setQuality(ORDER[i - 1]);
          if (window.Game && Game.setQuality) Game.setQuality(quality, 'auto');
          if (HD2D.onQualityChange) HD2D.onQualityChange(quality, 'auto');
        }
      }
    }
    perf.last = now;
  }

  // ---------- 公開 API ----------
  const HD2D = (window.HD2D = {
    layers: LAYERS.map(function (l) { return l.name; }).concat(['ui']),
    grades: GRADES,
    qualities: ORDER.slice(),
    autoQuality: true,
    onQualityChange: null,
    stats: perf,
    supported: function () {
      try {
        const g = document.createElement('canvas').getContext('webgl2');
        return !!(g && g.getExtension('EXT_color_buffer_float'));
      } catch (e) { return false; }
    },
    init: function (displayCanvas, opts) {
      // 先用離屏 canvas 偵測：不支援時不能對顯示用的 canvas 呼叫 getContext('webgl2')，否則它就不能再拿 2D
      if (!HD2D.supported()) { console.warn('[HD2D] 不支援 WebGL2，改用 2D'); return false; }
      canvas = displayCanvas;
      try {
        gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
        if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('需要 WebGL2 + EXT_color_buffer_float');
        programs.layer = program(FS_LAYER);
        programs.bright = program(FS_BRIGHT);
        programs.blur = program(FS_BLUR);
        programs.rays = program(FS_RAYS);
        programs.final = program(FS_FINAL);
      } catch (e) {
        console.warn('[HD2D] 不支援，改用 2D：', e.message);
        gl = null;
        return false;
      }
      quad = gl.createVertexArray();
      gl.bindVertexArray(quad);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      softSampler = gl.createSampler();
      gl.samplerParameteri(softSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.samplerParameteri(softSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(softSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(softSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uiSampler = gl.createSampler();
      gl.samplerParameteri(uiSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.samplerParameteri(uiSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(uiSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(uiSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      emptyTex = makeTex(gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); gl = null; if (HD2D.onContextLost) HD2D.onContextLost(); });
      HD2D.setQuality((opts && opts.quality) || 'high');
      HD2D.resize();
      return true;
    },
    ready: function () { return !!gl; },
    // 驗收用：回傳 Promise<{white /*純白（>0.97）像素比例*/, meanLuma}>，在下一幀結束時量測
    measure: function () { return new Promise(function (r) { measureCb = r; }); },
    setQuality: function (q) { if (QUALITY[q]) { quality = q; perf.low = 0; } },
    getQuality: function () { return quality; },
    // 依 canvas 的 CSS 尺寸 × devicePixelRatio 設定輸出解析度（寬度上限 1920）
    resize: function (maxDpr) {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr || 99);
      let w = Math.max(1, Math.round((canvas.clientWidth || canvas.width) * dpr));
      let h = Math.max(1, Math.round((canvas.clientHeight || canvas.height) * dpr));
      if (w > MAX_OUT_W) { h = Math.round(h * MAX_OUT_W / w); w = MAX_OUT_W; }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      outW = w; outH = h;
    },
    /**
     * scene = {
     *   layers: {sky, far, mid, ground, actors, fg, ui}  // 320×180 canvas；也可以傳 {canvas, depth, parallax} 覆寫預設；可以缺層
     *   camera: {x, y, zoom}       // 邏輯像素；各層位移 = camera × parallax；ui 不受影響
     *   focusDepth: 0.65, tiltShift: 0–1
     *   lights: [{x, y, radius, color:'#ffb060'|[r,g,b], intensity:0–2, flicker:0–1, layer:'mid'|depth}]
     *   ambient: '#rrggbb'（省略時用 grade 的陰影色調混合）, grade: 'meadow'|'beach'|'volcano'|'snow'|'sky'|'battle'|'dungeon'
     *   godRays: {x, y, strength} | null（省略時用 grade 預設；傳 null 關閉）
     *   fog: {color, density, horizon} | null（省略時用 grade 預設）
     *   flash: 0–1, time: 秒
     * }
     */
    frame: function (scene) {
      if (!gl) return false;
      const t0 = performance.now();
      trackFps(t0);
      const Q = QUALITY[quality];
      // 圖層正規化成由後往前的清單：陣列照陣列順序；物件照 LAYERS 的預設順序。depth < 0 或名稱 ui 的是 ui 層
      const list = [];
      let ui = null;
      const depthByName = Object.assign({}, LAYER_DEPTH);
      (Array.isArray(scene.layers) ? scene.layers : LAYERS.concat([{ name: 'ui' }]).map(function (d) {
        const it = scene.layers && scene.layers[d.name];
        return it ? (it.canvas ? Object.assign({ name: d.name }, it) : { name: d.name, canvas: it }) : null;
      })).forEach(function (it) {
        if (!it || !it.canvas) return;
        const def = LAYERS.find(function (d) { return d.name === it.name; }) || { depth: 0.6, parallax: 0.7 };
        const depth = it.depth == null ? def.depth : it.depth;
        if (it.name === 'ui' || depth < 0) { ui = it.canvas; return; }
        const name = it.name || ('layer' + list.length);
        depthByName[name] = depth;
        list.push({ name: name, canvas: it.canvas, depth: depth, parallax: it.parallax == null ? def.parallax : it.parallax, version: it.version });
      });
      if (!list.length) return false;
      const firstCv = list[0].canvas;
      const lw = firstCv.width, lh = firstCv.height;
      // modern：圖層是高解析度插畫（例如 1280×720），linear 取樣；座標參數仍是 320×180 的邏輯座標，K = 圖層像素 / 邏輯像素
      const modern = scene.style === 'modern';
      const K = modern ? lw / (scene.logicalWidth || 320) : 1;
      HD2D.resize(modern ? 2 : 0);
      // 內部合成用邏輯解析度的整數倍（像素寬度一致不閃爍），最後再縮放到輸出解析度
      const sw = Math.min(outW, lw * Q.scale), sh = Math.round(sw * outH / outW);
      const G = GRADES[scene.grade] || GRADES.meadow;
      const time = scene.time || 0;
      const cam = scene.camera || {};
      const camX = cam.x || 0, camY = cam.y || 0, zoom = cam.zoom || 1;

      // 光源
      const lights = (scene.lights || []).slice(0, MAX_LIGHTS);
      const pos = new Float32Array(MAX_LIGHTS * 4), col = new Float32Array(MAX_LIGHTS * 4);
      lights.forEach(function (l, i) {
        const fl = l.flicker ? 1 - l.flicker * 0.35 * (1 + Math.sin(time * 11 + i * 7.1) * 0.6 + Math.sin(time * 23.7 + i * 3.3) * 0.4) : 1;
        const d = typeof l.layer === 'number' ? l.layer : (depthByName[l.layer] != null ? depthByName[l.layer] : 0.65);
        pos.set([l.x * K, l.y * K, (l.radius || 40) * K, d], i * 4);
        const c = hex(l.color, [1, 0.8, 0.5]);
        col.set([c[0], c[1], c[2], (l.intensity == null ? 1 : l.intensity) * fl], i * 4);
      });
      const shadow = hex(G.shadow, [0.3, 0.3, 0.4]), key = hex(G.key, [1, 1, 1]);
      // 環境光 = 白光混入 25% 陰影色調（§7.3）；render 可以用 ambient 覆寫
      const shL = Math.max(0.01, shadow[0] * 0.2126 + shadow[1] * 0.7152 + shadow[2] * 0.0722);
      const lvl = G.ambientLevel == null ? 1 : G.ambientLevel;
      const ambient = scene.ambient ? hex(scene.ambient, [1, 1, 1]) : shadow.map(function (c) {
        return lvl * (1 - GLOBAL.shadowMix + GLOBAL.shadowMix * c / shL);
      });
      const fog = scene.fog === null ? null : (scene.fog || G.fog);
      const fogV = fog ? hex(fog.color, [1, 1, 1]).concat([fog.density || 0]) : [0, 0, 0, 0];
      const focus = scene.focusDepth == null ? 0.65 : scene.focusDepth;
      const tilt = Q.dof ? 3.2 * (scene.tiltShift == null ? 0.6 : scene.tiltShift) : 0;

      // 1. 由遠到近逐層合成
      let a = target('sceneA', sw, sh), b = target('sceneB', sw, sh);
      clear(a);
      const bw = Math.max(1, sw >> 2), bh = Math.max(1, sh >> 2);
      const b1 = target('bloom1', bw, bh), b2 = target('bloom2', bw, bh), rays = target('rays', bw, bh);
      let brightDone = false, actors = null;
      // 泛光的亮部在疊上 actors 之前擷取：角色本身不發光，背景的泛光也不會從角色身上「長出來」
      function brightPass() {
        if (brightDone || !Q.bloom) return;
        draw(programs.bright, b1, { uThreshold: modern ? 0.8 : 0.85 }, { uTex: a.tex });   // 只讓真正的高光溢出（現代模式稍低，泛光較柔）
        brightDone = true;
      }
      list.forEach(function (def) {
        const cv = def.canvas, depth = def.depth, par = def.parallax;
        // 位移：像素模式取整數邏輯像素（避免柔焦）；現代模式換算成圖層像素，可以有小數（平滑運鏡）
        const off = modern ? [camX * par * K, -camY * par * K] : [Math.round(camX * par), -Math.round(camY * par)];
        if (def.name === 'actors') { brightPass(); actors = { off: off }; }
        // 焦點附近（±0.08，例如 actors、ground）完全不做景深和移軸，保證角色是銳利的 NEAREST 像素
        const inFocus = Math.abs(depth - focus) <= 0.08;
        const k = inFocus ? 0 : blurCurve(depth, focus);
        // 現代插畫解析度高、本身就有柔邊，景深強度減半，避免雲和遠景糊成一團
        // 天空層再減半：繪本風的雲要保留清楚的輪廓（a3 定調 v2.0）
        const depthBlur = Q.dof ? MAX_BLUR * k * K * (modern ? (depth < 0.05 ? 0.25 : 0.5) : 1) : 0;
        draw(programs.layer, b, {
          uLogical: [lw, lh], uOffset: off, uZoom: zoom, uModern: modern ? 1 : 0,
          uDepthBlur: depthBlur, uTilt: inFocus ? 0 : tilt * K * (modern ? 0.5 : 1) * (0.25 + 0.75 * k), uTaps: { int: Q.taps }, uDepth: depth,
          uLightOn: Q.light ? 1 : 0, uAmbient: ambient, uLightCount: { int: lights.length },
          uAmbientMin: def.name === 'actors' && scene.actorAmbientMin ? scene.actorAmbientMin : 0,
          uRim: def.name === 'actors' && scene.actorRim && Q.light ? hex(scene.actorRim.color, [1, 0.5, 0.2]).concat([scene.actorRim.strength == null ? 0.8 : scene.actorRim.strength]) : [0, 0, 0, 0],
          uRimDir: scene.actorRim && scene.actorRim.dir ? [scene.actorRim.dir[0] * K, scene.actorRim.dir[1] * K] : [0, K],
          uLightPos: { vec4: pos }, uLightCol: { vec4: col }, uFog: fogV, uFogHorizon: fog ? fog.horizon * K : 0
        }, (function () { const t = upload(def.name, cv, def.version); if (def.name === 'actors') actors.tex = t; return { uLayer: t, uLayerSoft: { tex: t, sampler: softSampler }, uPrev: a.tex }; })());
        const t = a; a = b; b = t;
      });

      // 2. 泛光（沒有 actors 層時，在全部疊完後擷取亮部）
      brightPass();
      if (Q.bloom) {
        for (let k = 0; k < (modern ? 3 : 2); k++) {
          draw(programs.blur, b2, { uDir: [1.6 / bw, 0] }, { uTex: b1.tex });
          draw(programs.blur, b1, { uDir: [0, 1.6 / bh] }, { uTex: b2.tex });
        }
      } else clear(b1);
      // 3. 體積光
      const sun = scene.godRays === null ? null : (scene.godRays || G.sun);
      if (Q.rays && sun) {
        draw(programs.rays, rays, {
          uCenter: [(sun.x - camX * 0.05) * K / lw, 1 - (sun.y + camY * 0.05) * K / lh], uStrength: sun.strength == null ? 1 : sun.strength, uKey: key
        }, { uTex: b1.tex });
      } else clear(rays);

      // 光暈：只給 mid 以上畫質；半徑 = min(50, 光源半徑 × 0.6)，強度跟著閃爍
      const hPos = new Float32Array(MAX_LIGHTS * 4), hCol = new Float32Array(MAX_LIGHTS * 4);
      const parByName = {};
      list.forEach(function (l) { parByName[l.name] = l.parallax; });
      lights.forEach(function (l, i) {
        const par = typeof l.layer === 'string' && parByName[l.layer] != null ? parByName[l.layer] : 0.7;
        // 和層的取樣方向一致：螢幕位置 = (光源座標 − camera × parallax − 中心) × zoom + 中心
        const lwL = lw / K, lhL = lh / K;   // 邏輯寬高
        const cx = modern ? camX * par : Math.round(camX * par), cy = modern ? camY * par : Math.round(camY * par);
        const sx = (l.x - cx - lwL / 2) * zoom + lwL / 2, sy = (l.y - cy - lhL / 2) * zoom + lhL / 2;
        hPos.set([sx * K, sy * K, Math.min(50, (l.radius || 40) * 0.6) * zoom * K, 0], i * 4);
        const c = hex(l.color, [1, 0.8, 0.5]);
        const a4 = col[i * 4 + 3];
        hCol.set([c[0], c[1], c[2], l.halo == null ? 0.42 * a4 : l.halo * a4], i * 4);
      });
      // 4. 輸出（含 ui 層）
      draw(programs.final, null, {
        uLogical: [lw, lh], uBloomAmt: Q.bloom ? G.bloom : 0, uRaysOn: Q.rays && sun ? 1 : 0, uGradeOn: Q.grade ? 1 : 0,
        uVignette: GLOBAL.vignette, uGrain: Q.grain ? GLOBAL.grain : 0, uTime: time % 97, uFlash: scene.flash || 0,
        uHaloCount: { int: Q.light ? lights.length : 0 }, uHaloPos: { vec4: hPos }, uHaloCol: { vec4: hCol },
        uActOn: actors ? 1 : 0, uActOff: actors ? actors.off : [0, 0], uZoomF: zoom,
        uUiOn: ui ? 1 : 0, uUiHiRes: ui && (modern || ui.width !== lw) ? 1 : 0, uSat: GLOBAL.sat, uLift: GLOBAL.blackLift, uKey: key, uShadow: shadow
      }, (function () {
        const ut = ui ? upload('ui', ui) : emptyTex;
        return { uScene: a.tex, uBloom: b1.tex, uRays: rays.tex, uUi: ut, uUiSoft: { tex: ut, sampler: uiSampler }, uActors: actors ? actors.tex : emptyTex };
      })());

      perf.ms = perf.ms * 0.9 + (performance.now() - t0) * 0.1;
      if (measureCb) {
        const px = new Uint8Array(outW * outH * 4);
        gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let white = 0, sum = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] > 247 && px[i + 1] > 247 && px[i + 2] > 247) white++;
          sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        }
        const n = px.length / 4;
        const cb = measureCb; measureCb = null;
        cb({ white: white / n, meanLuma: sum / n / 255, w: outW, h: outH });
      }
      return true;
    }
  });
})();
