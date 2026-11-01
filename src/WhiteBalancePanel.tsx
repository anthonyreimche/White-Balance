// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// The Develop "White Balance" panel: the eyedropper (Picker), Auto, and the
// Temp and Tint sliders; and its per-mask instance, relative warm/cool and
// magenta/green shifts. Picker and Auto act on the whole photo, so the mask
// instance has neither, and both wait for the first rendered frame.

import { React, api } from "./rt";
import type { MaskPanelContribution, PickDragTool } from "./safelight";
import { cls } from "./styles";

/** The eyedropper: the press makes that point of the image neutral, then the
 *  tool puts itself down. */
export const EYEDROPPER: PickDragTool = {
  onPress(point) {
    api.develop.setPickDrag(null);
    void api.develop.autoAdjust.whiteBalanceAt(point);
  },
};

export function WhiteBalancePanel() {
  const { Panel, Slider, PickerIcon, AutoButton } = api.components;
  const useDevelopStore = api.stores.useDevelopStore;
  const temperature = useDevelopStore((s) => s.params.temperature);
  const tint = useDevelopStore((s) => s.params.tint);
  const setParam = useDevelopStore((s) => s.setParam);
  const commitEdit = useDevelopStore((s) => s.commitEdit);
  const hasHistogram = useDevelopStore((s) => s.histogram != null);
  const asShotTemperature = useDevelopStore((s) => s.asShotTemperature);
  const picking = api.develop.usePickDragHeld();

  return (
    <Panel title="White Balance">
      <div className={cls.toolbar}>
        <button
          type="button"
          onClick={() => api.develop.setPickDrag(picking ? null : EYEDROPPER)}
          disabled={!hasHistogram}
          title="White balance selector — click a neutral grey in the image"
          aria-pressed={picking}
          className={`${cls.picker}${picking ? ` ${cls.on}` : ""}`}
        >
          <PickerIcon />
          Picker
        </button>
        <AutoButton
          onClick={() => void api.develop.autoAdjust.whiteBalance()}
          disabled={!hasHistogram}
          title="Auto white balance (gray-world)"
        />
      </div>
      <div className={cls.sliders}>
        <Slider
          label="Temp"
          value={temperature}
          min={2000}
          max={50000}
          step={10}
          defaultValue={asShotTemperature}
          onChange={(v) => setParam("temperature", v)}
          onCommit={() => void commitEdit("Temperature")}
        />
        <Slider
          label="Tint"
          value={tint}
          min={-150}
          max={150}
          defaultValue={0}
          onChange={(v) => setParam("tint", v)}
          onCommit={() => void commitEdit("Tint")}
        />
      </div>
    </Panel>
  );
}

function WhiteBalanceMaskPanel() {
  const { Slider } = api.components;
  const scope = api.develop.useMaskScope();
  return (
    <div className={cls.sliders}>
      <Slider
        label="Temp"
        value={scope.adj.temperature}
        min={-100}
        max={100}
        step={1}
        defaultValue={0}
        onChange={(v) => scope.setAdj({ temperature: v })}
        onCommit={() => scope.commit("Mask Temp")}
      />
      <Slider
        label="Tint"
        value={scope.adj.tint}
        min={-100}
        max={100}
        step={1}
        defaultValue={0}
        onChange={(v) => scope.setAdj({ tint: v })}
        onCommit={() => scope.commit("Mask Tint")}
      />
    </div>
  );
}

export const WHITE_BALANCE_MASK_PANEL: MaskPanelContribution = {
  component: WhiteBalanceMaskPanel,
  order: 20,
  owns: ["temperature", "tint"],
};
