// A stand-in Safelight API over real React and zustand. The develop store holds
// Temp, Tint, the as-shot temperature and whether a frame has a histogram, the
// way core's does, and records every write; the pick-drag tool and the auto
// runs are recorded as core would receive them. Core's Panel draws its
// children, and core's Slider and AutoButton are stubs that keep the props
// they were last rendered with, so a test can drive them the way the real ones
// would.

import * as React from "react";
import { create } from "zustand";
import type {
  AutoButtonProps,
  CanvasPoint,
  DevelopParams,
  DevelopStoreState,
  MaskScope,
  PanelContribution,
  PanelProps,
  PickDragTool,
  ProcessingStageContribution,
  SafelightAPI,
  SliderProps,
  StoreApi,
  StylesheetContribution,
  UiTokens,
} from "../../src/safelight";

export type DevelopCall =
  | { setParam: keyof DevelopParams; value: number }
  | { commitEdit: string }
  | { resetParams: (keyof DevelopParams)[]; label: string };

export type AutoCall = "whiteBalance" | { whiteBalanceAt: CanvasPoint };

export const AS_SHOT = 4237;

export const TOKENS: UiTokens = {
  border: "var(--color-border)",
  borderSubtle: "var(--color-border-subtle)",
  accent: "var(--color-accent)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
};

export interface Rig {
  api: SafelightAPI;
  develop: StoreApi<DevelopStoreState>;
  calls: DevelopCall[];
  autos: AutoCall[];
  panels: PanelContribution[];
  stages: ProcessingStageContribution[];
  stylesheets: StylesheetContribution[];
  /** The tool this extension holds on the canvas, or null. */
  held(): PickDragTool | null;
  /** The latest props of each slider drawn in `root`, in document order. */
  sliders(root: ParentNode): SliderProps[];
  /** The props core's AutoButton was last rendered with. */
  auto(): AutoButtonProps;
  mask: { adj: { temperature: number; tint: number }; commits: string[] };
}

export function fakeApi({ histogram = true, temperature = AS_SHOT, tint = 0 } = {}): Rig {
  const calls: DevelopCall[] = [];
  const autos: AutoCall[] = [];
  const panels: PanelContribution[] = [];
  const stages: ProcessingStageContribution[] = [];
  const stylesheets: StylesheetContribution[] = [];
  const pick = create<{ tool: PickDragTool | null }>(() => ({ tool: null }));
  const mask: Rig["mask"] = { adj: { temperature: 0, tint: 0 }, commits: [] };
  const maskStore = create<{ adj: { temperature: number; tint: number } }>(() => ({ adj: mask.adj }));
  const sliderProps = new Map<number, SliderProps>();
  let nextSlider = 0;
  let lastAuto: AutoButtonProps | null = null;

  const develop: StoreApi<DevelopStoreState> = create<DevelopStoreState>()((set) => ({
    params: { temperature, tint },
    asShotTemperature: AS_SHOT,
    histogram: histogram ? {} : null,
    setParam: (key, value) => {
      calls.push({ setParam: key, value });
      set((s) => ({ params: { ...s.params, [key]: value } }));
    },
    commitEdit: async (label) => {
      calls.push({ commitEdit: label });
    },
    resetParams: async (keys, label) => {
      calls.push({ resetParams: keys, label });
      set({ params: { temperature: AS_SHOT, tint: 0 } });
    },
  }));

  function Panel({ children, title }: PanelProps) {
    return React.createElement("section", { "aria-label": title }, children);
  }

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }

  function AutoButton(props: AutoButtonProps) {
    lastAuto = props;
    return React.createElement("button", { type: "button", disabled: props.disabled, onClick: props.onClick }, "Auto");
  }

  const PickerIcon = () => React.createElement("svg", { "data-testid": "picker-icon" });

  const api: SafelightAPI = {
    version: 1,
    extensionId: "safelight.white-balance",
    react: React,
    registerPanel: (c) => void panels.push(c),
    registerProcessingStage: (c) => void stages.push(c),
    registerStylesheet: (c) => void stylesheets.push(c),
    components: { Panel, Slider, PickerIcon, AutoButton },
    stores: { useDevelopStore: develop },
    develop: {
      setPickDrag: (tool) => pick.setState({ tool }),
      usePickDragHeld: () => pick((s) => s.tool !== null),
      useMaskScope: (): MaskScope => {
        const adj = maskStore((s) => s.adj);
        return {
          adj,
          setAdj: (partial) => {
            mask.adj = { ...mask.adj, ...partial };
            maskStore.setState({ adj: mask.adj });
          },
          commit: (label) => void mask.commits.push(label),
        };
      },
      autoAdjust: {
        whiteBalance: async () => void autos.push("whiteBalance"),
        whiteBalanceAt: async (point) => void autos.push({ whiteBalanceAt: point }),
      },
    },
    ui: { tokens: TOKENS },
  };

  return {
    api,
    develop,
    calls,
    autos,
    panels,
    stages,
    stylesheets,
    held: () => pick.getState().tool,
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((el) => {
        const props = sliderProps.get(Number(el.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
    auto: () => {
      if (!lastAuto) throw new Error("AutoButton has not rendered");
      return lastAuto;
    },
    mask,
  };
}
