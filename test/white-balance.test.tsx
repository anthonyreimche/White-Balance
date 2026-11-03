// What activate() registers, the stage every line carries, and the panel: the
// Picker holds the canvas's pick tool and hands its press to core's eyedropper
// run, Auto runs core's grey-world balance, both wait for a frame, and the
// sliders write Temp and Tint around the photo's as-shot temperature. The mask
// instance shifts the mask's own relative Temp and Tint.

import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LINE, PANEL_ID, STYLESHEET_ID, activate } from "../src/index";
import { React, initRuntime } from "../src/rt";
import type { Line, ProcessingStageContribution } from "../src/safelight";
import { STAGE_ID, whiteBalanceStage } from "../src/stages";
import { EYEDROPPER, WHITE_BALANCE_MASK_PANEL, WhiteBalancePanel } from "../src/WhiteBalancePanel";
import manifest from "../safelight.json";
import { AS_SHOT, fakeApi } from "./support/fake-api";

/** The app's hash of this stage's text (src/rendering/webgl/essential-stages.test.ts). */
const LINE_HASH = "3d219c7b3496d44c42b88403910030e33bb3ce40aaab9411e1846d661ae4c998";

/** What a line's hash covers, as the app's stageText writes it. */
const stageText = (s: ProcessingStageContribution): string =>
  JSON.stringify([s.id, s.phase, s.priority ?? null, s.anchor ?? null, s.glsl, s.helpers ?? null, s.uniforms, s.textures ?? null]);

const text = ({ derive: _, ...rest }: ProcessingStageContribution) => rest;

afterEach(cleanup);

describe("whiteBalanceStage", () => {
  it.each([1, 2, 3] as Line[])("registers the same text on line %i, as the app froze it", (line) => {
    expect(createHash("sha256").update(stageText(whiteBalanceStage(line))).digest("hex")).toBe(LINE_HASH);
  });

  it("runs at the white-balance anchor on the scene colour, from the photo's Temp and Tint", () => {
    const stage = whiteBalanceStage(3);
    expect(stage).toMatchObject({ id: STAGE_ID, phase: "scene-linear", anchor: "white-balance" });
    expect(stage.derive?.({ temperature: 5100, tint: -12 }, { settings: (_k, f) => f })).toEqual({
      uTemperature: 5100,
      uTint: -12,
    });
  });
});

describe("activate", () => {
  it("registers the White Balance panel, as core's core.white-balance did", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels).toEqual([
      {
        id: "core.white-balance",
        title: "White Balance",
        component: WhiteBalancePanel,
        defaultDock: { module: "develop", direction: "right", order: 4, width: 280, height: 120 },
        onReset: expect.any(Function),
        mask: WHITE_BALANCE_MASK_PANEL,
      },
    ]);
    expect(PANEL_ID).toBe("core.white-balance");
    expect(WHITE_BALANCE_MASK_PANEL).toMatchObject({ order: 20, owns: ["temperature", "tint"] });
  });

  it("resets Temp and Tint as one step from the dock header", () => {
    const rig = fakeApi({ temperature: 6100, tint: 20 });
    activate(rig.api);
    rig.panels[0].onReset?.();
    expect(rig.calls).toEqual([{ resetParams: ["temperature", "tint"], label: "Reset White Balance" }]);
  });

  it("registers the stage of its line and its stylesheet", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(LINE).toBe(Number(manifest.version.split(".")[0]));
    expect(LINE).toBe(3);
    expect(rig.stages.map(text)).toEqual([text(whiteBalanceStage(LINE))]);
    expect(rig.stylesheets.map((s) => s.id)).toEqual([STYLESHEET_ID]);
  });
});

function panel(opts?: Parameters<typeof fakeApi>[0]) {
  const rig = fakeApi(opts);
  initRuntime(rig.api);
  const view = render(<WhiteBalancePanel />);
  return { rig, view };
}

const picker = () => screen.getByRole("button", { name: /Picker/ });

describe("the White Balance panel", () => {
  it("holds the eyedropper while Picker is on", () => {
    const { rig } = panel();
    fireEvent.click(picker());
    expect(rig.held()).toBe(EYEDROPPER);
    expect(picker().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(picker());
    expect(rig.held()).toBeNull();
  });

  it("makes the pressed point neutral through core, and puts the eyedropper down", () => {
    const { rig } = panel();
    fireEvent.click(picker());
    act(() => rig.held()?.onPress?.({ x: 40, y: 30 }));
    expect(rig.autos).toEqual([{ whiteBalanceAt: { x: 40, y: 30 } }]);
    expect(rig.held()).toBeNull();
  });

  it("runs core's Auto White Balance", () => {
    const { rig } = panel();
    act(() => rig.auto().onClick());
    expect(rig.autos).toEqual(["whiteBalance"]);
  });

  it("waits for a rendered frame before Picker and Auto", () => {
    const { rig } = panel({ histogram: false });
    expect((picker() as HTMLButtonElement).disabled).toBe(true);
    expect(rig.auto().disabled).toBe(true);
  });

  it("draws Temp in Kelvin around the as-shot value, and Tint", () => {
    const { rig, view } = panel({ temperature: 5600, tint: 7 });
    const [temp, tint] = rig.sliders(view.container);
    expect(temp).toMatchObject({ label: "Temp", value: 5600, min: 2000, max: 50000, step: 10, defaultValue: AS_SHOT });
    expect(tint).toMatchObject({ label: "Tint", value: 7, min: -150, max: 150, defaultValue: 0 });
  });

  it("writes each slider and commits it under its name", () => {
    const { rig, view } = panel();
    const [temp, tint] = rig.sliders(view.container);
    act(() => {
      temp.onChange(6000);
      temp.onCommit?.();
      tint.onChange(-20);
      tint.onCommit?.();
    });
    expect(rig.calls).toEqual([
      { setParam: "temperature", value: 6000 },
      { commitEdit: "Temperature" },
      { setParam: "tint", value: -20 },
      { commitEdit: "Tint" },
    ]);
  });
});

describe("the mask instance", () => {
  it("shifts the mask's relative Temp and Tint, and commits under the mask", () => {
    const rig = fakeApi();
    initRuntime(rig.api);
    const Mask = WHITE_BALANCE_MASK_PANEL.component;
    const view = render(<Mask />);
    const [temp, tint] = rig.sliders(view.container);
    expect(temp).toMatchObject({ label: "Temp", value: 0, min: -100, max: 100, defaultValue: 0 });
    expect(tint).toMatchObject({ label: "Tint", value: 0, min: -100, max: 100, defaultValue: 0 });
    act(() => {
      temp.onChange(30);
      temp.onCommit?.();
    });
    expect(rig.mask.adj).toEqual({ temperature: 30, tint: 0 });
    expect(rig.mask.commits).toEqual(["Mask Temp"]);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
