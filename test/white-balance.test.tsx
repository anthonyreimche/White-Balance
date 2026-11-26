// What activate() registers, the stage every line carries, and the panel: the
// Picker holds the canvas's pick tool and hands its press to core's eyedropper
// run, Auto runs core's grey-world balance, both wait for a frame, and the
// sliders write Temp and Tint around the photo's as-shot temperature. The
// preset menu writes a camera's, a DNG's or the as-shot values as one step, and
// shows which entry the values equal; a rendered photo gets a relative Temp;
// the as-shot line reads the photo's as-shot Kelvin and EXIF white balance. The
// mask instance shifts the mask's own relative Temp and Tint.

import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LINE, PANEL_ID, STYLESHEET_ID, activate } from "../src/index";
import { React, initRuntime } from "../src/rt";
import type { Line, ProcessingStageContribution } from "../src/safelight";
import { STAGE_ID, whiteBalanceStage } from "../src/stages";
import { EYEDROPPER, WHITE_BALANCE_MASK_PANEL, WhiteBalancePanel } from "../src/WhiteBalancePanel";
import manifest from "../safelight.json";
import { AS_SHOT, AUTO_RESULT, Z6_RAW, fakeApi } from "./support/fake-api";

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
        modules: ["develop"],
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

  it("draws Picker as the app's small button, lit while it is on", () => {
    panel();
    expect(picker().dataset.kit).toBe("button");
    expect(picker().dataset.active).toBeUndefined();
    fireEvent.click(picker());
    expect(picker().dataset.active).toBe("true");
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

describe("the sliders", () => {
  it("draw plain tracks", () => {
    const { rig, view } = panel();
    expect(rig.sliders(view.container).map((s) => s.trackBackground)).toEqual([undefined, undefined]);
  });

  it("run core's Auto on Shift+double-click", async () => {
    const { rig, view } = panel();
    const [temp, tint] = rig.sliders(view.container);
    await act(async () => temp.onAuto?.());
    await act(async () => tint.onAuto?.());
    expect(rig.autos).toEqual(["whiteBalance", "whiteBalance"]);
  });

  it("offer no Shift+double-click Auto until a frame has rendered", () => {
    const { rig, view } = panel({ histogram: false });
    expect(rig.sliders(view.container).map((s) => s.onAuto)).toEqual([undefined, undefined]);
  });

  it("give a rendered photo a relative Temp, one mired a step, still stored in Kelvin", () => {
    const { rig, view } = panel({ photo: { filename: "IMG_0001.jpg", exif: {} }, asShot: 6500, temperature: 6500 });
    const [temp] = rig.sliders(view.container);
    expect(temp).toMatchObject({ label: "Temp", value: 0, min: -100, max: 100, step: 1, defaultValue: 0 });
    act(() => temp.onChange(100));
    const write = rig.calls[0];
    expect(write).toMatchObject({ setParam: "temperature" });
    expect("value" in write && write.value).toBeCloseTo(18571.43, 2);
    expect(rig.sliders(view.container)[0].value).toBe(100);
  });
});

const entries = (rig: ReturnType<typeof fakeApi>) =>
  rig.select().groups?.flatMap((g) => g.items.map((i) => ({ group: g.title, ...i }))) ?? [];

describe("the preset menu", () => {
  it("offers As Shot, Auto, the camera's own presets under its name, and Custom", () => {
    const { rig } = panel();
    const items = entries(rig);
    expect(items.slice(0, 2).map((i) => i.label)).toEqual(["As Shot", "Auto"]);
    expect(items.filter((i) => i.group === "Nikon Z 6").map((i) => i.label).slice(0, 3)).toEqual([
      "Direct Sunlight",
      "Cloudy",
      "Shade",
    ]);
    expect(items.at(-1)).toMatchObject({ value: "custom", label: "Custom", disabled: true });
  });

  it("writes a preset's Temp and Tint as one step", () => {
    const { rig } = panel();
    act(() => rig.select().onChange("preset:Cool White Fluorescent"));
    expect(rig.calls).toEqual([
      { setParam: "temperature", value: 5770 },
      { setParam: "tint", value: 22 },
      { commitEdit: "White Balance: Cool White Fluorescent" },
    ]);
    expect(rig.select().value).toBe("preset:Cool White Fluorescent");
  });

  it("measures a preset's Tint against the camera's as-shot multipliers", () => {
    const { rig } = panel({ photo: { ...Z6_RAW, exif: { ...Z6_RAW.exif, asShotMultipliers: [1.623, 1, 1.9531] } } });
    act(() => rig.select().onChange("preset:Direct Sunlight"));
    expect(rig.calls.slice(0, 2)).toEqual([
      { setParam: "temperature", value: 7350 },
      { setParam: "tint", value: -24 },
    ]);
  });

  it("goes back to the as-shot values", () => {
    const { rig } = panel({ temperature: 8000, tint: 12 });
    expect(rig.select().value).toBe("custom");
    act(() => rig.select().onChange("as-shot"));
    expect(rig.calls).toEqual([
      { setParam: "temperature", value: AS_SHOT },
      { setParam: "tint", value: 0 },
      { commitEdit: "White Balance: As Shot" },
    ]);
    expect(rig.select().value).toBe("as-shot");
  });

  it("runs core's Auto, then shows Auto until the values move", async () => {
    const { rig, view } = panel();
    await act(async () => rig.select().onChange("auto"));
    expect(rig.autos).toEqual(["whiteBalance"]);
    expect(rig.develop.getState().params).toMatchObject(AUTO_RESULT);
    expect(rig.select().value).toBe("auto");
    act(() => rig.sliders(view.container)[1].onChange(AUTO_RESULT.tint + 1));
    expect(rig.select().value).toBe("custom");
  });

  it("keeps showing Custom when Auto changes nothing", async () => {
    const { rig } = panel({ ...AUTO_RESULT });
    await act(async () => rig.select().onChange("auto"));
    expect(rig.autos).toEqual(["whiteBalance"]);
    expect(rig.select().value).toBe("custom");
  });

  it("disables Auto until a frame has rendered", () => {
    const { rig } = panel({ histogram: false });
    expect(entries(rig).find((i) => i.value === "auto")?.disabled).toBe(true);
  });

  it("says when the camera is not in the table", () => {
    const { rig } = panel({ photo: { filename: "X.NEF", exif: { cameraMake: "Acme", cameraModel: "One", colorTemperature: AS_SHOT } } });
    expect(entries(rig).find((i) => i.value === "none")).toMatchObject({ label: "No presets for this camera", disabled: true });
  });

  it("offers a DNG the standard presets", () => {
    const { rig } = panel({ photo: { filename: "L1.DNG", exif: { colorTemperature: 5430 } }, asShot: 5430, temperature: 5430 });
    act(() => rig.select().onChange("preset:Shade"));
    expect(rig.calls).toEqual([
      { setParam: "temperature", value: 7500 },
      { setParam: "tint", value: 0 },
      { commitEdit: "White Balance: Shade" },
    ]);
  });

  it("offers a rendered photo As Shot and Auto only", () => {
    const { rig } = panel({ photo: { filename: "IMG.jpg", exif: {} }, asShot: 6500, temperature: 6500 });
    expect(entries(rig).map((i) => i.value)).toEqual(["as-shot", "auto", "custom"]);
  });
});

describe("the as-shot line", () => {
  it("reads a RAW's as-shot Kelvin and its EXIF white balance", () => {
    panel();
    expect(screen.getByText(`As shot ${AS_SHOT} K · Auto`)).toBeTruthy();
  });

  it("reads the Kelvin alone when the EXIF has no white balance", () => {
    panel({ photo: { ...Z6_RAW, exif: { ...Z6_RAW.exif, whiteBalance: undefined } } });
    expect(screen.getByText(`As shot ${AS_SHOT} K`)).toBeTruthy();
  });

  it("reads only the EXIF white balance on a rendered photo, and nothing without it", () => {
    panel({ photo: { filename: "IMG.jpg", exif: { whiteBalance: "Daylight" } }, asShot: 6500 });
    expect(screen.getByText("As shot · Daylight")).toBeTruthy();
    cleanup();
    panel({ photo: { filename: "IMG.jpg", exif: {} }, asShot: 6500 });
    expect(screen.queryByText(/As shot/)).toBeNull();
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

  it("draws plain tracks", () => {
    const rig = fakeApi();
    initRuntime(rig.api);
    const Mask = WHITE_BALANCE_MASK_PANEL.component;
    const view = render(<Mask />);
    expect(rig.sliders(view.container).map((s) => s.trackBackground)).toEqual([undefined, undefined]);
  });
});
