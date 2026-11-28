// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// The Develop "White Balance" panel: the eyedropper (Picker), Auto, the preset
// menu, the Temp and Tint sliders, the as-shot line and the adaptation menu
// (docs/SPEC-3.2.0.md); and its per-mask instance, relative warm/cool and
// magenta/green shifts. Picker and Auto act on the whole photo, so the mask
// instance has neither, and both wait for the first rendered frame. presets.ts
// decides what the preset menu offers.

import { ADAPTATION, ADAPTATION_LABELS, asAdaptation, type Adaptation } from "./adaptation";
import { React, api } from "./rt";
import type { MaskPanelContribution, PickDragTool, SelectGroup } from "./safelight";
import {
  kelvinForRelative,
  photoKind,
  presetMenu,
  relativeTemp,
  selectedEntry,
  type PhotoKind,
} from "./presets";
import { ADAPTATION_KEY } from "./stages";
import { cls } from "./styles";

/** The eyedropper: the press makes that point of the image neutral, then the
 *  tool puts itself down. */
export const EYEDROPPER: PickDragTool = {
  onPress(point) {
    api.develop.setPickDrag(null);
    void api.develop.autoAdjust.whiteBalanceAt(point);
  },
};

/** What Auto last set on each photo this session, so the menu can show Auto. */
const autoResults = new Map<string, { temperature: number; tint: number }>();

const ADAPTATION_OPTIONS = Object.values(ADAPTATION).map((a: Adaptation) => ({
  value: String(a),
  label: ADAPTATION_LABELS[a],
}));

const ADAPTATION_TITLE =
  "How the white balance changes colours: RGB gains scale each channel; CAT16, Bradford and XYZ adapt the light in a cone-response space and compress the gamut toward white";

function asShotLine(kind: PhotoKind, asShot: number, mode: string | undefined): string | null {
  if (kind === "rendered") return mode ? `As shot · ${mode}` : null;
  return mode ? `As shot ${asShot} K · ${mode}` : `As shot ${asShot} K`;
}

export function WhiteBalancePanel() {
  const { Panel, Slider, PickerIcon, AutoButton } = api.components;
  const { Button, Row, Select } = api.ui;
  const useDevelopStore = api.stores.useDevelopStore;
  const temperature = useDevelopStore((s) => s.params.temperature);
  const tint = useDevelopStore((s) => s.params.tint);
  const setParam = useDevelopStore((s) => s.setParam);
  const commitEdit = useDevelopStore((s) => s.commitEdit);
  const hasHistogram = useDevelopStore((s) => s.histogram != null);
  const asShotTemperature = useDevelopStore((s) => s.asShotTemperature);
  const adaptation = useDevelopStore((s) => asAdaptation(s.paramBag[ADAPTATION_KEY]));
  const setDynParams = useDevelopStore((s) => s.setDynParams);
  const picking = api.develop.usePickDragHeld();
  const photo = api.catalog.useActivePhoto();
  const [, noteAuto] = React.useReducer((n: number) => n + 1, 0);

  const kind = photoKind(photo);
  const menu = React.useMemo(() => presetMenu(photo), [photo]);
  const auto = photo ? (autoResults.get(photo.id) ?? null) : null;
  const entry = selectedEntry({ temperature, tint }, asShotTemperature, menu.presets, auto);
  const line = asShotLine(kind, asShotTemperature, photo?.exif.whiteBalance);

  const runAuto = async () => {
    if (!hasHistogram) return;
    const before = useDevelopStore.getState();
    await api.develop.autoAdjust.whiteBalance();
    const after = useDevelopStore.getState();
    const { temperature: t, tint: g } = after.params;
    const moved = t !== before.params.temperature || g !== before.params.tint;
    if (!before.photoId || after.photoId !== before.photoId || !moved) return;
    autoResults.set(before.photoId, { temperature: t, tint: g });
    noteAuto();
  };
  const onAuto = hasHistogram ? () => void runAuto() : undefined;

  const apply = (label: string, nextTemperature: number, nextTint: number) => {
    setParam("temperature", nextTemperature);
    setParam("tint", nextTint);
    void commitEdit(`White Balance: ${label}`);
  };

  const choose = (value: string) => {
    if (value === "auto") return void runAuto();
    if (value === "as-shot") return apply("As Shot", asShotTemperature, 0);
    const chosen = menu.presets.find((p) => p.id === value);
    if (chosen) apply(chosen.label, chosen.temperature, chosen.tint);
  };

  const chooseAdaptation = (value: string) => {
    const next = asAdaptation(Number(value));
    if (next === adaptation) return;
    setDynParams({ [ADAPTATION_KEY]: next });
    void commitEdit(`White Balance: ${ADAPTATION_LABELS[next]}`);
  };

  const groups: SelectGroup[] = [
    {
      items: [
        { value: "as-shot", label: "As Shot" },
        { value: "auto", label: "Auto", disabled: !hasHistogram },
      ],
    },
  ];
  if (menu.presets.length > 0) {
    groups.push({ title: menu.title, items: menu.presets.map((p) => ({ value: p.id, label: p.label })) });
  }
  if (menu.missing) {
    groups.push({ items: [{ value: "none", label: "No presets for this camera", disabled: true }] });
  }
  groups.push({ items: [{ value: "custom", label: "Custom", disabled: true }] });

  const relative = kind === "rendered";

  return (
    <Panel title="White Balance">
      <div className={cls.toolbar}>
        <Button
          size="sm"
          active={picking}
          onClick={() => api.develop.setPickDrag(picking ? null : EYEDROPPER)}
          disabled={!hasHistogram}
          title="White balance selector — click a neutral grey in the image"
          aria-pressed={picking}
        >
          <Row gap={4} align="center">
            <PickerIcon size={12} />
            Picker
          </Row>
        </Button>
        <AutoButton onClick={() => void runAuto()} disabled={!hasHistogram} title="Auto white balance (grey-world)" />
      </div>
      <div className={cls.preset}>
        <Select value={entry} onChange={choose} groups={groups} ariaLabel="White balance preset" />
      </div>
      <div className={cls.sliders}>
        {relative ? (
          <Slider
            label="Temp"
            value={relativeTemp(temperature, asShotTemperature)}
            min={-100}
            max={100}
            step={1}
            defaultValue={0}
            onChange={(v) => setParam("temperature", kelvinForRelative(v, asShotTemperature))}
            onCommit={() => void commitEdit("Temperature")}
            onAuto={onAuto}
          />
        ) : (
          <Slider
            label="Temp"
            value={temperature}
            min={2000}
            max={50000}
            step={10}
            defaultValue={asShotTemperature}
            onChange={(v) => setParam("temperature", v)}
            onCommit={() => void commitEdit("Temperature")}
            onAuto={onAuto}
          />
        )}
        <Slider
          label="Tint"
          value={tint}
          min={-150}
          max={150}
          defaultValue={0}
          onChange={(v) => setParam("tint", v)}
          onCommit={() => void commitEdit("Tint")}
          onAuto={onAuto}
        />
      </div>
      {line && <p className={cls.asShot}>{line}</p>}
      <div className={cls.preset}>
        <Select
          value={String(adaptation)}
          onChange={chooseAdaptation}
          options={ADAPTATION_OPTIONS}
          ariaLabel="White balance adaptation"
          title={ADAPTATION_TITLE}
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
