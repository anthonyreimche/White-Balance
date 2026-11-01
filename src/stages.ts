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
