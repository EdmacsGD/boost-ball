// Shared GLSL snippets.
export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

export const HEX = /* glsl */ `
const vec2 HEX_S = vec2(1.0, 1.7320508);
vec4 hexCoords(vec2 uv) {
  vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / HEX_S.xyxy) + 0.5;
  vec4 h = vec4(uv - hC.xy * HEX_S, uv - (hC.zw + 0.5) * HEX_S);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + vec2(0.5, 1.0));
}
float hexEdge(vec2 p) {
  p = abs(p);
  return 0.5 - max(dot(p, HEX_S * 0.5), p.x);
}
`;
