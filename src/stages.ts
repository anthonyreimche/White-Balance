// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// White balance's block of the develop program. Until Safelight 3.2.0 it was
// core's own; its GLSL is core's, moved as written. It runs at the develop
// program's white-balance anchor, on the scene colour, and calls core's
// applyWhiteBalance with the photo's as-shot temperature, which core binds. The
// block never differed between process versions, so every line carries the
// same text. Local tone reads the two sliders too: core stands in neutral
// values for them while this extension is away.

import {
  ADAPTATION,
  BRADFORD_TO_XYZ,
  CAT16_TO_XYZ,
  D65_UV,
  D65_WHITE,
  NORM_MIN,
  REC2020_TO_REC709,
  REC2020_TO_XYZ,
  REC709_TO_REC2020,
  REC709_TO_XYZ,
  XYZ_TO_BRADFORD,
  XYZ_TO_CAT16,
  XYZ_TO_REC2020,
  type Mat3,
} from "./adaptation";
import type { Line, ProcessingStageContribution, UniformDeclaration } from "./safelight";

export const STAGE_ID = "safelight.white-balance.balance";

const float = (key: string): UniformDeclaration => ({ key, glslType: "float", default: 0 });

/** The stage of release line `_line`: the same on every line. */
export function whiteBalanceStage(_line: Line): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "White Balance",
    phase: "scene-linear",
    anchor: "white-balance",
    glsl: "lin = applyWhiteBalance(lin, uTemperature, uTint, uAsShotTemperature);",
    uniforms: [float("uTemperature"), float("uTint")],
    derive: (p) => ({ uTemperature: p.temperature, uTint: p.tint }),
  };
}

// The adapt stage: adaptation.ts's adaptPixel as a second block at the same
// anchor, run after the balance stage. The balance stage's text is frozen by
// core, and local tone reads its uniforms, so it keeps applying its gains; this
// block divides them back out before it adapts. At RGB gains the stage is
// dormant and its branch skipped, so those photos render as they did. Every
// constant is formatted from the model's numbers, so the two can't drift.

export const ADAPT_STAGE_ID = "safelight.white-balance.adapt";
const ADAPTATION_UNIFORM = "uWbAdaptation";
/** Where the photo's bag holds its adaptation (adaptation.ts ADAPTATION). */
export const ADAPTATION_KEY = `${ADAPT_STAGE_ID}.${ADAPTATION_UNIFORM}`;

/** A GLSL float literal at full single precision, always with a decimal point
 *  (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  return s.includes("e") || s.includes(".") ? s : `${s}.0`;
}

/** A row-major 3×3 as a GLSL mat3 constructor (column-major arguments). */
function glslMat3(m: Mat3): string {
  return `mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => glslLiteral(m[i])).join(", ")})`;
}

const ADAPT_HELPERS = `
const mat3 WB_709_TO_2020 = ${glslMat3(REC709_TO_REC2020)};
const mat3 WB_2020_TO_709 = ${glslMat3(REC2020_TO_REC709)};
const mat3 WB_709_TO_XYZ = ${glslMat3(REC709_TO_XYZ)};
const mat3 WB_2020_TO_XYZ = ${glslMat3(REC2020_TO_XYZ)};
const mat3 WB_XYZ_TO_2020 = ${glslMat3(XYZ_TO_REC2020)};
const mat3 WB_XYZ_TO_CAT16 = ${glslMat3(XYZ_TO_CAT16)};
const mat3 WB_CAT16_TO_XYZ = ${glslMat3(CAT16_TO_XYZ)};
const mat3 WB_XYZ_TO_BRADFORD = ${glslMat3(XYZ_TO_BRADFORD)};
const mat3 WB_BRADFORD_TO_XYZ = ${glslMat3(BRADFORD_TO_XYZ)};
const vec2 WB_WHITE_UV = vec2(${glslLiteral(D65_UV[0])}, ${glslLiteral(D65_UV[1])});
const vec2 WB_WHITE_XY = vec2(${glslLiteral(D65_WHITE[0] / (D65_WHITE[0] + 1 + D65_WHITE[2]))}, ${glslLiteral(1 / (D65_WHITE[0] + 1 + D65_WHITE[2]))});
const float WB_NORM_MIN = ${glslLiteral(NORM_MIN)};

mat3 wbToLms(int a) {
  if (a == ${ADAPTATION.cat16}) return WB_XYZ_TO_CAT16;
  if (a == ${ADAPTATION.bradford}) return WB_XYZ_TO_BRADFORD;
  return mat3(1.0);
}
mat3 wbFromLms(int a) {
  if (a == ${ADAPTATION.cat16}) return WB_CAT16_TO_XYZ;
  if (a == ${ADAPTATION.bradford}) return WB_BRADFORD_TO_XYZ;
  return mat3(1.0);
}
vec3 wbGamut(vec3 xyz) {
  float total = xyz.x + xyz.y + xyz.z;
  float Y = xyz.y;
  vec2 xy = total > 0.0 ? xyz.xy / total : WB_WHITE_XY;
  float uvDen = -2.0 * xy.x + 12.0 * xy.y + 3.0;
  vec2 uv = vec2(4.0 * xy.x, 9.0 * xy.y) / uvDen;
  vec2 d = WB_WHITE_UV - uv;
  vec2 t = Y * dot(d, d) * d + uv;
  uv.x = uv.x > WB_WHITE_UV.x ? max(t.x, WB_WHITE_UV.x) : min(t.x, WB_WHITE_UV.x);
  uv.y = uv.y > WB_WHITE_UV.y ? max(t.y, WB_WHITE_UV.y) : min(t.y, WB_WHITE_UV.y);
  float xyDen = 6.0 * uv.x - 16.0 * uv.y + 12.0;
  xy = max(vec2(9.0 * uv.x, 4.0 * uv.y) / xyDen, 0.0);
  xy.y = max(xy.y, WB_NORM_MIN);
  float s = xy.x + xy.y;
  if (s >= 1.0) xy /= s;
  return vec3(Y * xy.x / xy.y, Y, Y * (1.0 - xy.x - xy.y) / xy.y);
}
vec3 wbAdapt(vec3 balanced, vec3 gains, int a) {
  mat3 toLms = wbToLms(a);
  mat3 fromLms = wbFromLms(a);
  vec3 inv = 1.0 / gains;
  vec3 light = inv / (WB_709_TO_XYZ * inv).y;
  vec3 gain = (toLms * (WB_709_TO_XYZ * vec3(1.0))) / (toLms * (WB_709_TO_XYZ * light));
  vec3 rgb = max(WB_709_TO_2020 * (balanced * inv), 0.0);
  vec3 adapted = max(fromLms * (gain * (toLms * (WB_2020_TO_XYZ * rgb))), 0.0);
  vec3 back = max(fromLms * max(toLms * wbGamut(adapted), 0.0), 0.0);
  return WB_2020_TO_709 * max(WB_XYZ_TO_2020 * back, 0.0);
}
`;

const ADAPT_GLSL = `if (${ADAPTATION_UNIFORM} != 0) {
  lin = wbAdapt(lin, applyWhiteBalance(vec3(1.0), uTemperature, uTint, uAsShotTemperature), ${ADAPTATION_UNIFORM});
}`;

/** The adapt stage: the same on every line. */
export function adaptationStage(): ProcessingStageContribution {
  return {
    id: ADAPT_STAGE_ID,
    name: "White Balance adaptation",
    phase: "scene-linear",
    priority: 110,
    anchor: "white-balance",
    glsl: ADAPT_GLSL,
    helpers: ADAPT_HELPERS,
    uniforms: [{ key: ADAPTATION_UNIFORM, glslType: "int", default: ADAPTATION.rgb, label: "Adaptation" }],
    dormantWhen: { [ADAPTATION_UNIFORM]: ADAPTATION.rgb },
  };
}
