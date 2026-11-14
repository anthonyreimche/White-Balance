// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// Core's blackbody model (src/rendering/blackbody.ts), copied: an extension
// can't import core. A camera preset's Temp must come out of the same fit core
// used for the photo's as-shot Kelvin, or a preset equal to the as-shot
// multipliers would move the photo. test/presets.test.ts pins it to core's
// numbers.

export type LinearRgb = readonly [number, number, number];

const BLACKBODY_MIN_K = 1000;
const BLACKBODY_MAX_K = 50000;
const TEMPERATURE_MIN_K = 2000;
const TEMPERATURE_MAX_K = 50000;
const TINT_RANGE = 150;
const TINT_GAIN_SPAN = 0.6;
const BLACKBODY_CHANNEL_FLOOR = 0.0008;
const NEUTRAL_TEMPERATURE_K = 6500;
const SEARCH_STEPS = 240;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear-light RGB of a blackbody radiator at `kelvin` (Tanner Helland's fit). */
export function blackbodyLinear(kelvin: number): LinearRgb {
  const t = Math.min(BLACKBODY_MAX_K, Math.max(BLACKBODY_MIN_K, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const encode = (v: number) => srgbToLinear(Math.min(1, Math.max(BLACKBODY_CHANNEL_FLOOR, v / 255)));
  return [encode(r), encode(g), encode(b)];
}

/** Green-normalized gain the Temp slider applies at `kelvin` over a photo
 *  balanced at `asShotKelvin`. */
export function whiteBalanceGain(kelvin: number, asShotKelvin: number): LinearRgb {
  const ref = blackbodyLinear(asShotKelvin);
  const bb = blackbodyLinear(kelvin);
  const green = ref[1] / bb[1];
  return [ref[0] / bb[0] / green, 1, ref[2] / bb[2] / green];
}

/** The tint that produces a green gain. */
export function tintForGreenGain(gain: number): number {
  return (1 - gain) * (TINT_RANGE / TINT_GAIN_SPAN);
}

function kelvinForGainRatio(logRedOverBlue: number, asShotKelvin: number = NEUTRAL_TEMPERATURE_K): number {
  const ref = blackbodyLinear(asShotKelvin);
  let best = asShotKelvin;
  let bestErr = Infinity;
  for (let i = 0; i <= SEARCH_STEPS; i++) {
    const k = TEMPERATURE_MIN_K * Math.pow(TEMPERATURE_MAX_K / TEMPERATURE_MIN_K, i / SEARCH_STEPS);
    const bb = blackbodyLinear(k);
    const err = Math.abs(Math.log(ref[0] / bb[0] / (ref[2] / bb[2])) - logRedOverBlue);
    if (err < bestErr) {
      bestErr = err;
      best = k;
    }
  }
  return best;
}

/** The Kelvin core reads from a camera's white balance multipliers, to 10 K. */
export function kelvinFromWhiteBalanceGains(gainR: number, gainG: number, gainB: number): number | undefined {
  if (!(gainR > 0) || !(gainG > 0) || !(gainB > 0)) return undefined;
  const kelvin = kelvinForGainRatio(Math.log(gainR / gainG / (gainB / gainG)));
  return Math.round(kelvin / 10) * 10;
}
