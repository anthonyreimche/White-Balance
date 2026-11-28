// The chromatic adaptation the adapt stage runs (docs/SPEC-3.2.0.md): the
// colour Temp and Tint make neutral is adapted to neutral in an LMS space
// instead of by per-channel gains, then the gamut is compressed toward the
// white and negatives clipped, as libre-dt-lab's hidden cat module does. RGB
// gains leaves the colour as the balance stage made it.

import { describe, expect, it } from "vitest";
import {
  ADAPTATION,
  D65_UV,
  REC2020_TO_REC709,
  REC709_TO_REC2020,
  REC709_TO_XYZ,
  XYZ_TO_CAT16,
  XYZ_TO_REC709,
  adaptPixel,
  apply3,
  asAdaptation,
  gamutMapping,
  inv3,
  mul3,
  type Adaptation,
  type Vec3,
} from "../src/adaptation";
import { blackbodyLinear } from "../src/blackbody";

const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];
const luma = (v: Vec3) => v[0] * LUMA[0] + v[1] * LUMA[1] + v[2] * LUMA[2];
const times = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
/** CIE Y of a linear Rec.709 colour: the luminance the adaptation keeps. */
const lum = (v: Vec3) => apply3(REC709_TO_XYZ, v)[1];

/** Core's applyWhiteBalance(vec3(1.0), …): the gains the balance stage multiplies by. */
function classicGains(kelvin: number, tint: number, asShot: number, processVersion: number): Vec3 {
  const ref = blackbodyLinear(asShot);
  const bb = blackbodyLinear(kelvin);
  const g: Vec3 = [ref[0] / bb[0], ref[1] / bb[1], ref[2] / bb[2]];
  const out: Vec3 = [g[0] / g[1], 1 - (tint / 150) * 0.6, g[2] / g[1]];
  return processVersion < 2 ? out : scale(out, 1 / luma(out));
}

const CATS: Adaptation[] = [ADAPTATION.cat16, ADAPTATION.bradford, ADAPTATION.xyz];

const uv = (xyz: Vec3): [number, number] => {
  const d = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
  return [(4 * xyz[0]) / d, (9 * xyz[1]) / d];
};

function expectClose(actual: Vec3, expected: Vec3, tolerance: number) {
  for (let c = 0; c < 3; c++) expect(Math.abs(actual[c] - expected[c])).toBeLessThanOrEqual(tolerance);
}

describe("asAdaptation", () => {
  it("reads the bag's value, and anything else as RGB gains", () => {
    expect(asAdaptation(1)).toBe(ADAPTATION.cat16);
    expect(asAdaptation(2)).toBe(ADAPTATION.bradford);
    expect(asAdaptation(3)).toBe(ADAPTATION.xyz);
    for (const v of [0, undefined, "1", 4, -1, 1.5, Number.NaN]) expect(asAdaptation(v)).toBe(ADAPTATION.rgb);
  });
});

describe("the colour spaces", () => {
  it("put Rec.709's white at D65", () => {
    expectClose(apply3(REC709_TO_XYZ, [1, 1, 1]), [0.950456, 1, 1.089058], 1e-6);
    expectClose(apply3(XYZ_TO_REC709, apply3(REC709_TO_XYZ, [0.3, 0.5, 0.7])), [0.3, 0.5, 0.7], 1e-12);
    expect(D65_UV[0]).toBeCloseTo(0.19783, 4);
    expect(D65_UV[1]).toBeCloseTo(0.46832, 4);
  });

  it("round-trip Rec.709 through Rec.2020", () => {
    expectClose(apply3(REC2020_TO_REC709, apply3(REC709_TO_REC2020, [0.2, -0.1, 0.9])), [0.2, -0.1, 0.9], 1e-12);
  });
});

describe("gamutMapping", () => {
  it("leaves the white and its greys where they are", () => {
    const white = apply3(REC709_TO_XYZ, [1, 1, 1]);
    for (const k of [0.01, 0.18, 1, 4]) expectClose(gamutMapping(scale(white, k)), scale(white, k), 1e-9 * Math.max(k, 1));
  });

  it("pulls a colour toward the white by Y times its squared distance, keeping Y", () => {
    const xyz = apply3(REC709_TO_XYZ, [0.6, 0.15, 0.05]);
    const before = uv(xyz);
    const out = gamutMapping(xyz);
    const after = uv(out);
    const d2 = (before[0] - D65_UV[0]) ** 2 + (before[1] - D65_UV[1]) ** 2;
    const k = 1 - xyz[1] * d2;
    expect(out[1]).toBeCloseTo(xyz[1], 12);
    expect(after[0] - D65_UV[0]).toBeCloseTo((before[0] - D65_UV[0]) * k, 9);
    expect(after[1] - D65_UV[1]).toBeCloseTo((before[1] - D65_UV[1]) * k, 9);
  });

  it("never carries a bright colour past the white", () => {
    const xyz = scale(apply3(REC709_TO_XYZ, [1, 0.05, 0.02]), 100);
    expectClose(gamutMapping(xyz), scale(apply3(REC709_TO_XYZ, [1, 1, 1]), xyz[1]), 1e-6 * xyz[1]);
  });

  it("is black for black", () => {
    expect(gamutMapping([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("adaptPixel", () => {
  it("leaves RGB gains to the balance stage", () => {
    const g = classicGains(3200, 20, 5600, 2);
    expect(adaptPixel([0.4, -0.02, 0.1], g, ADAPTATION.rgb)).toEqual([0.4, -0.02, 0.1]);
  });

  it.each(CATS)("adapts nothing at as-shot: greys stay (adaptation %i)", (a) => {
    for (const k of [0.01, 0.18, 1, 4]) expectClose(adaptPixel([k, k, k], [1, 1, 1], a), [k, k, k], 1e-6 * Math.max(k, 1));
  });

  it.each(CATS)("makes the colour Temp and Tint neutralize exactly neutral, at its luminance (adaptation %i)", (a) => {
    for (const [kelvin, tint, asShot, version] of [
      [3200, 0, 5600, 2],
      [9000, -40, 5000, 2],
      [2600, 60, 7350, 2],
      [4100, 25, 6500, 1],
    ]) {
      const g = classicGains(kelvin, tint, asShot, version);
      const inv: Vec3 = [1 / g[0], 1 / g[1], 1 / g[2]];
      for (const k of [0.05, 0.18, 0.9]) {
        const scene = scale(inv, k / lum(inv));
        expectClose(adaptPixel(times(scene, g), g, a), [k, k, k], 2e-6);
      }
    }
  });

  it("adapts in CAT16's cone space, then compresses the gamut, as upstream's order has it", () => {
    const g = classicGains(3000, 10, 5500, 2);
    const scene: Vec3 = [0.25, 0.12, 0.06];
    const inv: Vec3 = [1 / g[0], 1 / g[1], 1 / g[2]];
    const w = scale(inv, 1 / lum(inv));
    const toLms = mul3(XYZ_TO_CAT16, REC709_TO_XYZ);
    const lmsWhite = apply3(toLms, [1, 1, 1]);
    const lmsW = apply3(toLms, w);
    const gain: Vec3 = [lmsWhite[0] / lmsW[0], lmsWhite[1] / lmsW[1], lmsWhite[2] / lmsW[2]];
    const adapted = apply3(inv3(XYZ_TO_CAT16), times(gain, apply3(toLms, scene)));
    const expected = apply3(XYZ_TO_REC709, gamutMapping(adapted));
    expectClose(adaptPixel(times(scene, g), g, ADAPTATION.cat16), expected, 1e-9);
  });

  it("lands a saturated colour away from where RGB gains put it", () => {
    const g = classicGains(2800, 0, 5600, 2);
    const scene: Vec3 = [0.05, 0.3, 0.04];
    const classic = times(scene, g);
    const adapted = adaptPixel(classic, g, ADAPTATION.cat16);
    expect(Math.max(...adapted.map((v, c) => Math.abs(v - classic[c])))).toBeGreaterThan(5e-3);
  });

  it.each(CATS)("keeps colours outside sRGB that Rec.2020 holds (adaptation %i)", (a) => {
    const wide = apply3(REC2020_TO_REC709, [0.05, 0.4, 0.05]);
    expect(Math.min(...wide)).toBeLessThan(0);
    const out = adaptPixel(wide, [1, 1, 1], a);
    expect(Math.min(...out)).toBeLessThan(0);
    expect(lum(out)).toBeCloseTo(lum(wide), 9);
  });

  it.each(CATS)("clips what Rec.2020 can't hold (adaptation %i)", (a) => {
    const out = apply3(REC709_TO_REC2020, adaptPixel([-2, 0.1, 0.1], [1, 1, 1], a));
    for (const v of out) expect(v).toBeGreaterThanOrEqual(-1e-12);
  });
});
