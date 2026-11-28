// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.
//
// Ported from libre-dt-lab, a darktable fork, GPL v3 or later:
//   src/iop/cat.c and src/common/wb_gamut_mapping.h,
//     Copyright (C) 2026 darktable developers,
//     Libre DT-lab Edition (C) 2026 Christian Bouhon;
//   src/common/chromatic_adaptation.h (the cone matrices),
//     Copyright (C) 2020-2025 darktable developers.

// The adapt stage's arithmetic on the CPU: the reference its GLSL is written
// from (stages.ts) and the tests check. Upstream adapts the scene illuminant
// to its pipeline white. Here the decode is already balanced to as-shot, so
// the adaptation is relative to it: the colour Temp and Tint make neutral is
// adapted to the as-shot white in a cone space, in place of the balance
// stage's per-channel gains. Then, as upstream's hidden module does, the gamut
// is compressed toward the white and negatives are clipped, in linear
// Rec.2020 (upstream's working space) and in the cone space. Safelight's white
// is D65, where upstream's is D50.

export type Vec3 = readonly [number, number, number];
/** Row-major. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export function apply3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
  }
  return out as unknown as Mat3;
}

export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, (c * h - b * i) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, (c * d - a * f) / det,
    C / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}

type Xy = readonly [number, number];

const D65_XY: Xy = [0.3127, 0.329];

/** An RGB space's matrix to XYZ, from its primaries and white, white at Y = 1. */
function rgbToXyz(primaries: readonly [Xy, Xy, Xy], white: Xy): Mat3 {
  const col = ([x, y]: Xy): Vec3 => [x / y, 1, (1 - x - y) / y];
  const [r, g, b] = primaries.map(col);
  const p: Mat3 = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
  const s = apply3(inv3(p), col(white));
  return [p[0] * s[0], p[1] * s[1], p[2] * s[2], p[3] * s[0], p[4] * s[1], p[5] * s[2], p[6] * s[0], p[7] * s[1], p[8] * s[2]];
}

export const REC709_TO_XYZ = rgbToXyz([[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]], D65_XY);
export const XYZ_TO_REC709 = inv3(REC709_TO_XYZ);
export const REC2020_TO_XYZ = rgbToXyz([[0.708, 0.292], [0.17, 0.797], [0.131, 0.046]], D65_XY);
export const XYZ_TO_REC2020 = inv3(REC2020_TO_XYZ);
export const REC709_TO_REC2020 = mul3(XYZ_TO_REC2020, REC709_TO_XYZ);
export const REC2020_TO_REC709 = inv3(REC709_TO_REC2020);

/** Upstream's cone matrices. The inverses are worked out rather than taken from
 *  upstream's rounded pair, so the white the adaptation lands on is exact. */
export const XYZ_TO_CAT16: Mat3 = [
  0.401288, 0.650173, -0.051461,
  -0.250268, 1.204414, 0.045854,
  -0.002079, 0.048952, 0.953127,
];
export const XYZ_TO_BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
export const CAT16_TO_XYZ = inv3(XYZ_TO_CAT16);
export const BRADFORD_TO_XYZ = inv3(XYZ_TO_BRADFORD);

/** The adaptation choices, as the bag stores them. Upstream's non-linear
 *  Bradford is left out: it can't be undone relative to as-shot. */
export const ADAPTATION = { rgb: 0, cat16: 1, bradford: 2, xyz: 3 } as const;
export type Adaptation = (typeof ADAPTATION)[keyof typeof ADAPTATION];

export const ADAPTATION_LABELS: Readonly<Record<Adaptation, string>> = {
  0: "RGB gains",
  1: "CAT16",
  2: "Bradford",
  3: "XYZ",
};

/** A bag value as an adaptation: anything that isn't one is RGB gains. */
export function asAdaptation(v: unknown): Adaptation {
  return v === 1 || v === 2 || v === 3 ? v : ADAPTATION.rgb;
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function toLms(a: Adaptation): Mat3 {
  if (a === ADAPTATION.cat16) return XYZ_TO_CAT16;
  if (a === ADAPTATION.bradford) return XYZ_TO_BRADFORD;
  return IDENTITY;
}

export function fromLms(a: Adaptation): Mat3 {
  if (a === ADAPTATION.cat16) return CAT16_TO_XYZ;
  if (a === ADAPTATION.bradford) return BRADFORD_TO_XYZ;
  return IDENTITY;
}

/** NORM_MIN (darktable math.h): 2^-16. */
export const NORM_MIN = 1.52587890625e-5;

export const D65_WHITE = apply3(REC709_TO_XYZ, [1, 1, 1]);

/** CIE 1976 u'v' of an XYZ colour. */
function uvOf(xyz: Vec3): [number, number] {
  const d = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
  return [(4 * xyz[0]) / d, (9 * xyz[1]) / d];
}

/** D65 in CIE 1976 u'v', where the gamut compression pulls colours. */
export const D65_UV: readonly [number, number] = uvOf(D65_WHITE);

const D65_WHITE_XY: Xy = [D65_WHITE[0] / (D65_WHITE[0] + 1 + D65_WHITE[2]), 1 / (D65_WHITE[0] + 1 + D65_WHITE[2])];

/** dt_vector_clipneg_nan: negatives and NaN to zero. */
const clipNeg = (v: Vec3): Vec3 => [v[0] > 0 ? v[0] : 0, v[1] > 0 ? v[1] : 0, v[2] > 0 ? v[2] : 0];

/** dt_wb_gamut_mapping() at the hidden module's compression 1 with clipping
 *  on: pull the chromaticity toward the white by Y·Δu'v'², never past it. */
export function gamutMapping(xyz: Vec3): Vec3 {
  const sum = xyz[0] + xyz[1] + xyz[2];
  const Y = xyz[1];
  let x = sum > 0 ? xyz[0] / sum : D65_WHITE_XY[0];
  let y = sum > 0 ? xyz[1] / sum : D65_WHITE_XY[1];
  const den = -2 * x + 12 * y + 3;
  let u = (4 * x) / den;
  let v = (9 * y) / den;
  const du = D65_UV[0] - u;
  const dv = D65_UV[1] - v;
  const correction = Y * (du * du + dv * dv);
  const tu = correction * du + u;
  const tv = correction * dv + v;
  u = u > D65_UV[0] ? Math.max(tu, D65_UV[0]) : Math.min(tu, D65_UV[0]);
  v = v > D65_UV[1] ? Math.max(tv, D65_UV[1]) : Math.min(tv, D65_UV[1]);
  const xyDen = 6 * u - 16 * v + 12;
  x = Math.max((9 * u) / xyDen, 0);
  y = Math.max((4 * v) / xyDen, 0);
  y = Math.max(y, NORM_MIN);
  const s = x + y;
  if (s >= 1) {
    x /= s;
    y /= s;
  }
  return [(Y * x) / y, Y, (Y * (1 - x - y)) / y];
}

/** The adapt stage on one pixel: `lin` as the balance stage left it (the
 *  scene colour times `gains`, core's applyWhiteBalance of white). */
export function adaptPixel(lin: Vec3, gains: Vec3, a: Adaptation): Vec3 {
  if (a === ADAPTATION.rgb) return lin;
  const m = toLms(a);
  const mi = fromLms(a);
  const inv: Vec3 = [1 / gains[0], 1 / gains[1], 1 / gains[2]];
  const y = apply3(REC709_TO_XYZ, inv)[1];
  const lmsWhite = apply3(m, D65_WHITE);
  const lmsLight = apply3(m, apply3(REC709_TO_XYZ, [inv[0] / y, inv[1] / y, inv[2] / y]));
  const gain: Vec3 = [lmsWhite[0] / lmsLight[0], lmsWhite[1] / lmsLight[1], lmsWhite[2] / lmsLight[2]];
  const scene: Vec3 = [lin[0] * inv[0], lin[1] * inv[1], lin[2] * inv[2]];
  const lms = apply3(m, apply3(REC2020_TO_XYZ, clipNeg(apply3(REC709_TO_REC2020, scene))));
  const adapted = clipNeg(apply3(mi, [lms[0] * gain[0], lms[1] * gain[1], lms[2] * gain[2]]));
  const back = clipNeg(apply3(mi, clipNeg(apply3(m, gamutMapping(adapted)))));
  return apply3(REC2020_TO_REC709, clipNeg(apply3(XYZ_TO_REC2020, back)));
}
