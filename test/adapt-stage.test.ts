// The adapt stage (docs/SPEC-3.2.0.md): a second block at the white-balance
// anchor, after the balance stage, whose frozen text stays as it is. It sleeps
// at RGB gains, so photos that keep it render as 3.1 did. Unit tests can't run
// GLSL; these hold the parts that keep it asleep and its constants the model's.

import { describe, expect, it } from "vitest";
import { ADAPTATION, D65_UV, REC709_TO_REC2020, XYZ_TO_BRADFORD, XYZ_TO_CAT16 } from "../src/adaptation";
import { ADAPT_STAGE_ID, ADAPTATION_KEY, adaptationStage, glslLiteral, whiteBalanceStage } from "../src/stages";

const stage = adaptationStage();

describe("adaptationStage", () => {
  it("runs at the white-balance anchor on the scene colour, after the balance stage", () => {
    expect(stage).toMatchObject({ id: "safelight.white-balance.adapt", phase: "scene-linear", anchor: "white-balance" });
    expect(ADAPT_STAGE_ID).toBe(stage.id);
    expect(stage.priority).toBeGreaterThan(whiteBalanceStage(3).priority ?? 100);
  });

  it("binds its one setting from the photo's bag, RGB gains by default", () => {
    expect(stage.uniforms).toEqual([{ key: "uWbAdaptation", glslType: "int", default: ADAPTATION.rgb, label: "Adaptation" }]);
    expect(ADAPTATION_KEY).toBe("safelight.white-balance.adapt.uWbAdaptation");
    expect(stage.derive).toBeUndefined();
  });

  it("sleeps at RGB gains", () => {
    expect(stage.dormantWhen).toEqual({ uWbAdaptation: ADAPTATION.rgb });
  });

  it("only touches the pixel inside the branch RGB gains skips", () => {
    const body = stage.glsl;
    const branch = body.indexOf("if (uWbAdaptation != 0) {");
    expect(branch).toBeGreaterThanOrEqual(0);
    expect(body.match(/\blin\s*=/g)).toHaveLength(1);
    expect(body.indexOf("lin =")).toBeGreaterThan(branch);
  });

  it("reads the balance stage's gains as core works them out", () => {
    expect(stage.glsl).toContain("applyWhiteBalance(vec3(1.0), uTemperature, uTint, uAsShotTemperature)");
  });

  it("formats its constants from the model", () => {
    const helpers = stage.helpers ?? "";
    for (const v of [REC709_TO_REC2020[0], XYZ_TO_CAT16[0], XYZ_TO_BRADFORD[4], D65_UV[0], D65_UV[1]]) {
      expect(helpers).toContain(glslLiteral(v));
    }
  });

  it("writes float literals GLSL accepts", () => {
    expect(glslLiteral(1)).toBe("1.000000000");
    expect(glslLiteral(-2)).toBe("-2.000000000");
    expect(glslLiteral(0.25)).toBe("0.2500000000");
  });
});
