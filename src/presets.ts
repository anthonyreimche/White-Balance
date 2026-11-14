// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// The preset menu's entries for the open photo, and which one the current Temp
// and Tint show. Core bakes the as-shot white balance into the decoded pixels
// and measures Temp against the photo's as-shot Kelvin, so a preset has to be
// on the same scale as that Kelvin:
// - a camera RAW's as-shot came from its multipliers through core's blackbody
//   fit, so its camera's own presets go through the same fit;
// - a DNG's as-shot is a real CCT from its colour matrices, so it gets the
//   standard Kelvin presets;
// - a rendered photo (JPEG and the like) has no as-shot Kelvin to measure from,
//   so it gets no light-source presets and a relative Temp.
// docs/SPEC.md has the reasoning and the numbers.

import { kelvinFromWhiteBalanceGains, tintForGreenGain, whiteBalanceGain } from "./blackbody";
import { CANON_ALIASES } from "./camera-aliases.data";
import { CAMERA_PRESETS, type CameraPresetRow } from "./camera-presets.data";
import type { DevelopParams, ExifData } from "./safelight";

export type PhotoKind = "camera-raw" | "dng" | "rendered";

export interface WbPreset {
  id: string;
  label: string;
  temperature: number;
  tint: number;
}

export interface PresetMenu {
  /** The heading over the presets: the camera's name, for a camera's own. */
  title?: string;
  presets: readonly WbPreset[];
  /** A camera RAW whose body the table doesn't list. */
  missing: boolean;
}


type WbValues = Pick<DevelopParams, "temperature" | "tint">;
type Multipliers = NonNullable<ExifData["asShotMultipliers"]>;

interface PhotoLike {
  filename: string;
  exif: ExifData;
}

const preset = (label: string, temperature: number, tint: number): WbPreset => ({
  id: `preset:${label}`,
  label,
  temperature,
  tint,
});

/** A DNG's presets, on the CCT scale its as-shot Kelvin is on. */
export const DNG_PRESETS: readonly WbPreset[] = [
  preset("Daylight", 5500, 0),
  preset("Cloudy", 6500, 0),
  preset("Shade", 7500, 0),
  preset("Tungsten", 2850, 0),
  preset("Fluorescent", 3800, 16),
  preset("Flash", 5500, 0),
];

export function photoKind(photo: PhotoLike | undefined): PhotoKind {
  if (!photo || !((photo.exif.colorTemperature ?? 0) > 0)) return "rendered";
  return /\.dng$/i.test(photo.filename) ? "dng" : "camera-raw";
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** EXIF makes and table makers that name the same camera line. */
const FAMILIES: readonly (readonly [family: string, tokens: readonly string[]])[] = [
  ["olympus", ["olympus", "omdigital", "omsystem"]],
  ["pentax", ["pentax", "ricoh"]],
  ["minolta", ["minolta"]],
  ["fujifilm", ["fuji"]],
  ["phaseone", ["phaseone"]],
  ["canon", ["canon"]],
  ["nikon", ["nikon"]],
  ["kodak", ["kodak"]],
  ["leaf", ["leaf"]],
  ["leica", ["leica"]],
  ["panasonic", ["panasonic"]],
  ["samsung", ["samsung"]],
  ["sony", ["sony"]],
];

/** Maker names an EXIF model often starts with ("NIKON Z 6", "Canon EOS R5"). */
const MAKER_PREFIX = /^(konicaminolta|minolta|canon|nikon|pentax|ricoh|leica|olympus|panasonic|sony|samsung|kodak|fujifilm|phaseone|leaf)(?=.)/;

function family(make: string): string | undefined {
  const key = squash(make);
  return FAMILIES.find(([, tokens]) => tokens.some((t) => key.includes(t)))?.[0];
}

const modelKey = (model: string) => squash(model).replace(MAKER_PREFIX, "");

let index: Map<string, CameraPresetRow> | undefined;

function cameraIndex(): Map<string, CameraPresetRow> {
  if (index) return index;
  index = new Map();
  for (const row of CAMERA_PRESETS) {
    const key = `${family(row[0])}|${modelKey(row[1])}`;
    if (!index.has(key)) index.set(key, row);
  }
  for (const [alias, model] of CANON_ALIASES) {
    const row = index.get(`canon|${modelKey(model)}`);
    const key = `canon|${modelKey(alias)}`;
    if (row && !index.has(key)) index.set(key, row);
  }
  return index;
}

/** The table's row for a camera, by its EXIF make and model; a Canon body's
 *  Rebel or Kiss name finds its EOS row. */
export function findCamera(make: string | undefined, model: string | undefined): CameraPresetRow | undefined {
  if (!make || !model) return undefined;
  const fam = family(make);
  if (!fam) return undefined;
  return cameraIndex().get(`${fam}|${modelKey(model)}`);
}

const DAYLIGHT = ["Daylight", "Direct Sunlight", "Sunny"];

/** The multipliers Tint is measured from: the photo's as-shot ones, or the
 *  camera's daylight preset for a photo without them. */
function tintReference(rows: CameraPresetRow[2], asShot: Multipliers | undefined): readonly [red: number, blue: number] | undefined {
  if (asShot) return [asShot[0] / asShot[1], asShot[2] / asShot[1]];
  const daylight = rows.find(([name]) => DAYLIGHT.includes(name));
  return daylight && [daylight[1], daylight[2]];
}

/**
 * A camera's presets as Temp and Tint. Temp is the Kelvin core's fit reads from
 * the preset's multipliers. Tint is the green the preset asks for beyond what
 * the fit predicts between the photo's as-shot multipliers and the preset's.
 */
export function cameraPresets(row: CameraPresetRow, asShot?: Multipliers): WbPreset[] {
  const [, , rows] = row;
  const ref = tintReference(rows, asShot);
  const refKelvin = ref && kelvinFromWhiteBalanceGains(ref[0], 1, ref[1]);
  const out: WbPreset[] = [];
  for (const [name, red, blue] of rows) {
    const kelvin = kelvinFromWhiteBalanceGains(red, 1, blue);
    if (kelvin === undefined) continue;
    let tint = 0;
    if (ref && refKelvin !== undefined) {
      const [gr, , gb] = whiteBalanceGain(kelvin, refKelvin);
      const excess = Math.sqrt((red / ref[0]) * (blue / ref[1])) / Math.sqrt(gr * gb);
      tint = Math.round(tintForGreenGain(1 / excess)) || 0;
    }
    out.push(preset(name, kelvin, tint));
  }
  return out;
}

export function presetMenu(photo: PhotoLike | undefined): PresetMenu {
  const kind = photoKind(photo);
  if (kind === "dng") return { presets: DNG_PRESETS, missing: false };
  if (kind === "rendered" || !photo) return { presets: [], missing: false };
  const row = findCamera(photo.exif.cameraMake, photo.exif.cameraModel);
  if (!row) return { presets: [], missing: true };
  return { title: `${row[0]} ${row[1]}`, presets: cameraPresets(row, photo.exif.asShotMultipliers), missing: false };
}

const same = (a: WbValues, b: WbValues) => a.temperature === b.temperature && a.tint === b.tint;

/** The menu entry the values show: "as-shot", then a preset's id, then "auto"
 *  for what Auto last set; else "custom". */
export function selectedEntry(
  values: WbValues,
  asShot: number,
  presets: readonly WbPreset[],
  auto: WbValues | null,
): string {
  if (same(values, { temperature: asShot, tint: 0 })) return "as-shot";
  const match = presets.find((p) => same(values, p));
  if (match) return match.id;
  if (auto && same(values, auto)) return "auto";
  return "custom";
}

const MIRED = 1e6;
const KELVIN_MAX = 50000;

/** A rendered photo's Temp: mireds warmer than its as-shot, to the step. */
export function relativeTemp(kelvin: number, asShot: number): number {
  return Math.round(MIRED / asShot - MIRED / kelvin) || 0;
}

/** The Kelvin a rendered photo's relative Temp stands for. */
export function kelvinForRelative(value: number, asShot: number): number {
  if (value === 0) return asShot;
  const mired = MIRED / asShot - value;
  return mired <= MIRED / KELVIN_MAX ? KELVIN_MAX : MIRED / mired;
}
