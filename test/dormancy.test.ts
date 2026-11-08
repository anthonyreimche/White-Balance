// White Balance declares no dormantWhen, on purpose. Its block changes nothing
// only when the temperature equals the photo's as-shot temperature (with a
// tint of 0), and that is a different value on every photo. A rule is a fixed
// uniform value, so it can't say that.

import { describe, expect, it } from "vitest";
import { whiteBalanceStage } from "../src/stages";

describe("dormantWhen", () => {
  it.each([1, 2, 3] as const)("is not declared on line %i", (line) => {
    expect(whiteBalanceStage(line)).not.toHaveProperty("dormantWhen");
  });
});
