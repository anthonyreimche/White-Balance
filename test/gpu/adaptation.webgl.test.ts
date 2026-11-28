// The adapt stage on the real renderer. Run via `npm run test:gpu` (run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • installing 3.2 changes no photo: at RGB gains every frame is
//    bit-identical with and without the adapt stage, on process versions 1, 2
//    and 3, with Temp and Tint moved;
//  • the stage compiles beside core's white balance block (the frozen balance
//    stage from core's fixtures, as the app runs it) and renders adaptation.ts
//    adaptPixel for each adaptation, from the gains core works out.
//
// Stage output is read at "scene", the linear colour the display transform
// receives, without Basic, so nothing after the white-balance anchor changes
// it. The open probe skips the core shoulder. The model's input is the frame
// at RGB gains, so the RGBA16F upload doesn't count.

import { describe, expect, it } from "vitest";
import { ADAPTATION, adaptPixel, type Adaptation, type Vec3 } from "@wb/adaptation";
import { ADAPTATION_KEY, adaptationStage } from "@wb/stages";
import { whiteBalanceGains } from "@/rendering/blackbody";
import type { DevelopParams } from "@/catalog/types";
import type { ProcessingStageContribution } from "@/extensions/types";
import type { ResolvedPipeline } from "@/rendering/webgl/renderer";
import {
  LINEAR_PROBE_PIPELINE,
  OPEN_PROBE,
  builtinStages,
  floatImage,
  identityParams,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const W = 96;
const H = 64;
const AS_SHOT = 5600;
const SCENE_SPACE = { encoding: "linear", primaries: "rec709" } as const;
const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;
const BASIC = "safelight.basic";

/** Linear Rec.709 from 0.002 to 2: a grey ramp across, colour growing down,
 *  and a band whose red sits below zero. */
const SCENE = floatImage(W, H, (x, y) => {
  const t = x / (W - 1);
  const u = y / (H - 1);
  const L = 0.002 * 1000 ** t;
  if (u > 0.85) return [-0.02 + 0.01 * t, L, L * 0.6];
  const chroma = u < 0.2 ? 0 : 0.6 * Math.min(1, (u - 0.2) / 0.5);
  const ang = u * Math.PI * 4;
  return [L * (1 + chroma * Math.cos(ang)), L * (1 + chroma * Math.cos(ang - 2.094)), L * (1 + chroma * Math.cos(ang + 2.094))];
});

type Bag = Record<string, unknown>;
type Installed = ProcessingStageContribution & { extensionId?: string };

const ADAPT: Installed = {
  ...(adaptationStage() as unknown as ProcessingStageContribution),
  extensionId: "safelight.white-balance",
};

interface RenderOptions {
  base?: Installed[];
  stages?: Installed[];
  pipeline?: ResolvedPipeline;
  params?: Partial<DevelopParams>;
  point?: "scene" | "pre-output";
}

function frames(bags: Record<string, Bag>, o: RenderOptions = {}): Record<string, Float32Array> {
  const {
    base = builtinStages().filter((s) => s.extensionId !== BASIC),
    stages = [ADAPT],
    pipeline = OPEN_PROBE,
    point = "scene",
  } = o;
  const out: Record<string, Float32Array> = {};
  withRenderer({ stages: [...base, ...stages], pipeline, processVersionCap: 3 }, (renderer) => {
    renderer.setAsShotTemperature(AS_SHOT);
    renderer.setImage(SCENE);
    renderer.setParams(identityParams({ processVersion: 3, temperature: AS_SHOT, tint: 0, ...o.params }));
    for (const [name, bag] of Object.entries(bags)) {
      renderer.setContributedParams(bag);
      const frame = renderer.readFloatFrame(point, Infinity, point === "scene" ? SCENE_SPACE : AS_DRAWN);
      if (!frame) throw new Error(`no frame for ${name}`);
      out[name] = frame.data;
    }
  });
  return out;
}

const pixel = (data: Float32Array, k: number): Vec3 => [data[4 * k], data[4 * k + 1], data[4 * k + 2]];
const differing = (a: Float32Array, b: Float32Array) => a.reduce((n, v, i) => (v === b[i] ? n : n + 1), 0);

describe("existing photos are unchanged by the adapt stage", () => {
  it.each([1, 2, 3])("version %i, at RGB gains: bit-identical", (processVersion) => {
    for (const params of [{}, { temperature: 3900, tint: 25 }, { temperature: 9100, tint: -40 }]) {
      const o = { base: builtinStages(), pipeline: LINEAR_PROBE_PIPELINE, params: { processVersion, ...params }, point: "pre-output" as const };
      const without = frames({ without: {} }, { ...o, stages: [] }).without;
      const installed = frames({ empty: {}, rgb: { [ADAPTATION_KEY]: ADAPTATION.rgb } }, o);
      expect(differing(installed.empty, without)).toBe(0);
      expect(differing(installed.rgb, without)).toBe(0);
    }
  });
});

const CASES: [string, number, number, number][] = [
  ["tungsten, version 3", 3200, 0, 3],
  ["cool and green, version 3", 8500, -35, 3],
  ["warm and magenta, version 2", 2600, 60, 2],
  ["as shot, version 3", AS_SHOT, 0, 3],
  ["version 1", 4100, 25, 1],
];

const ADAPTATIONS: [string, Adaptation][] = [
  ["CAT16", ADAPTATION.cat16],
  ["Bradford", ADAPTATION.bradford],
  ["XYZ", ADAPTATION.xyz],
];

describe("the adapt stage renders the model", () => {
  it.each(CASES)("%s", (name, temperature, tint, processVersion) => {
    const bags: Record<string, Bag> = { rgb: {} };
    for (const [label, a] of ADAPTATIONS) bags[label] = { [ADAPTATION_KEY]: a };
    const rendered = frames(bags, { params: { temperature, tint, processVersion } });
    const gains = whiteBalanceGains(temperature, tint, AS_SHOT, processVersion) as Vec3;
    for (const [label, a] of ADAPTATIONS) {
      let worst = 0;
      let change = 0;
      let where = "";
      for (let k = 0; k < W * H; k++) {
        const input = pixel(rendered.rgb, k);
        const want = adaptPixel(input, gains, a);
        const got = pixel(rendered[label], k);
        // Float32 error scales with the pixel's largest channel, in or out: a
        // dark channel adapted out of a bright one carries the bright one's.
        const size = Math.max(0.01, ...input.map(Math.abs), ...want.map(Math.abs));
        for (let c = 0; c < 3; c++) {
          const e = Math.abs(got[c] - want[c]) / size;
          change = Math.max(change, Math.abs(want[c] - input[c]));
          if (e > worst) {
            worst = e;
            where = `(${k % W},${Math.floor(k / W)}) ch${c}: in ${input[c].toFixed(6)} gpu ${got[c].toFixed(6)} ref ${want[c].toFixed(6)}`;
          }
        }
      }
      console.log(`[wb-gpu] ${name}, ${label}: worst error ${worst.toExponential(2)} at ${where}; largest change ${change.toFixed(4)}`);
      expect(change).toBeGreaterThan(1e-3);
      expect(worst).toBeLessThan(1e-4);
    }
  });
});
