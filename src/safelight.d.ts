// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// The slice of Safelight's extension API this extension touches, mirrored from
// the app's src/extensions/types.ts, src/catalog/types.ts,
// src/state/develop-store.ts, src/modules/develop/{mask-scope,pick-drag}.ts,
// src/hooks/use-auto-adjust.ts and src/ui/components/{Panel,Slider,
// PickerIcon,AutoButton}.tsx. Extensions are standalone bundles, so the host's
// source is not on the type path; React types come from @types/react (dev
// only).

import type { ComponentType, ReactNode } from "react";

/** A release line: the process version its stage text was written for, and
 *  the extension's major version. */
export type Line = 1 | 2 | 3;

export interface StoreApi<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState(): T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
}

/** The develop params this extension reads. Core's carry many more fields. */
export interface DevelopParams {
  /** Kelvin, 2000-50000; a photo opens at its as-shot value. */
  temperature: number;
  /** -150 (green) to 150 (magenta). */
  tint: number;
}

export interface DevelopStoreState {
  params: DevelopParams;
  /** The open photo's as-shot temperature, Kelvin. */
  asShotTemperature: number;
  /** The last rendered frame's histogram; null before the first frame. */
  histogram: unknown | null;
  setParam<K extends keyof DevelopParams>(key: K, value: DevelopParams[K]): void;
  /** End a gesture: one undoable history step under `label`. */
  commitEdit(label: string): Promise<void>;
  /** Put `keys` back to their defaults as one undoable step under `label`. */
  resetParams(keys: (keyof DevelopParams)[], label: string): Promise<void>;
}

export interface PanelDockDefault {
  module: "library" | "develop";
  direction: "left" | "right" | "bottom";
  order?: number;
  width?: number;
  height?: number;
}

/** A panel's per-mask variant, listed among a mask's sub-panels. */
export interface MaskPanelContribution {
  component: ComponentType;
  /** Sort position among a mask's sub-panels (lower = higher up). */
  order?: number;
  /** The mask values this sub-panel edits. */
  owns: readonly string[];
}

export interface PanelContribution {
  /** Globally unique, e.g. "core.white-balance" or "my-ext.fancy-curves". */
  id: string;
  title: string;
  component: ComponentType;
  defaultDock?: PanelDockDefault;
  /** Right-clicking the panel's dock header offers "Reset to defaults". */
  onReset?: () => void;
  mask?: MaskPanelContribution;
}

export interface UniformDeclaration {
  key: string;
  glslType: "float";
  default: number;
}

export type StageValue = number;

export interface StageDeriveContext {
  /** One of this extension's settings, or `fallback`. */
  settings<T>(key: string, fallback: T): T;
}

export type StageDerive = (params: DevelopParams, ctx: StageDeriveContext) => Record<string, StageValue>;

export interface ProcessingStageContribution {
  id: string;
  name: string;
  phase: "scene-linear";
  priority?: number;
  /** Where in the develop program the block runs (official stages only). */
  anchor?: "white-balance";
  /** The stage's block in the develop program; `lin` is the scene colour. */
  glsl: string;
  /** Functions the block calls, declared ahead of main(). */
  helpers?: string;
  uniforms: UniformDeclaration[];
  /** Textures the block samples (none here; part of a line's text). */
  textures?: { key: string; kind: "photo" }[];
  /** The uniforms' values for a photo (official extensions only). */
  derive?: StageDerive;
}

export interface StylesheetContribution {
  id: string;
  css: string;
}

/** The theme's CSS variables as `var(--color-…)` strings. */
export interface UiTokens {
  readonly border: string;
  readonly borderSubtle: string;
  readonly accent: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
}

export interface PanelProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Double-clicking the track resets to this. */
  defaultValue?: number;
  onChange(value: number): void;
  onCommit?(): void;
}

export interface AutoButtonProps {
  onClick(): void;
  disabled?: boolean;
  title?: string;
}

/** A point on the develop canvas, in its pixels, from its top-left corner. */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** The canvas's pick-drag tool. `onPress` gets each press on the image at
 *  once. */
export interface PickDragTool {
  onPress?(point: CanvasPoint): void;
}

/** The mask a mask sub-panel instance belongs to: its relative adjustments. */
export interface MaskScope {
  adj: { temperature: number; tint: number };
  setAdj(partial: Partial<{ temperature: number; tint: number }>): void;
  /** End a gesture: one undoable step under `label`. */
  commit(label: string): void;
}

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  react: typeof import("react");
  registerPanel(c: PanelContribution): void;
  registerProcessingStage(c: ProcessingStageContribution): void;
  registerStylesheet(c: StylesheetContribution): void;
  components: {
    /** Core's collapsible panel; inside a dock panel of the same title it
     *  draws its content only. */
    Panel: ComponentType<PanelProps>;
    Slider: ComponentType<SliderProps>;
    /** The eyedropper icon core's pickers show. */
    PickerIcon: ComponentType;
    /** The develop panels' small Auto button. */
    AutoButton: ComponentType<AutoButtonProps>;
  };
  stores: {
    useDevelopStore: StoreApi<DevelopStoreState>;
  };
  develop: {
    /** Hold the canvas's pick-drag tool, or with null let go of it. */
    setPickDrag(tool: PickDragTool | null): void;
    /** React hook: whether this extension holds the pick-drag tool. */
    usePickDragHeld(): boolean;
    /** The mask a PanelContribution.mask component belongs to. */
    useMaskScope(): MaskScope;
    /** Core's auto adjustments, each run to convergence as one undo step. */
    autoAdjust: {
      /** Gray-world white balance ("Auto White Balance"). */
      whiteBalance(): Promise<void>;
      /** Make the canvas point neutral ("White Balance"). */
      whiteBalanceAt(point: CanvasPoint): Promise<void>;
    };
  };
  ui: { tokens: UiTokens };
}

export interface ExtensionModule {
  activate(api: SafelightAPI): void;
  deactivate?(): void;
}
