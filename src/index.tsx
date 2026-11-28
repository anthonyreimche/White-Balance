// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// Registers the Develop "White Balance" panel with its mask instance, the
// white balance stage and the adapt stage after it. The panel was core's
// built-in `core.white-balance` until Safelight 3.2.0 and keeps that id, so
// saved layouts keep it where it was.

import { initRuntime } from "./rt";
import type { Line, SafelightAPI } from "./safelight";
import { ADAPTATION_KEY, adaptationStage, whiteBalanceStage } from "./stages";
import { whiteBalanceCss } from "./styles";
import { WHITE_BALANCE_MASK_PANEL, WhiteBalancePanel } from "./WhiteBalancePanel";

export const PANEL_ID = "core.white-balance";
export const STYLESHEET_ID = "safelight.white-balance.styles";

/** The release line: this release's major version (vite.config.ts). */
export const LINE = __SAFELIGHT_LINE__ as Line;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  host.registerStylesheet({ id: STYLESHEET_ID, css: whiteBalanceCss(host.ui.tokens) });
  host.registerProcessingStage(whiteBalanceStage(LINE));
  host.registerProcessingStage(adaptationStage());
  host.registerPanel({
    id: PANEL_ID,
    title: "White Balance",
    component: WhiteBalancePanel,
    defaultDock: { module: "develop", direction: "right", order: 4, width: 280, height: 120 },
    modules: ["develop"],
    onReset: () => {
      const develop = host.stores.useDevelopStore.getState();
      develop.setDynParams({ [ADAPTATION_KEY]: undefined });
      void develop.resetParams(["temperature", "tint"], "Reset White Balance");
    },
    mask: WHITE_BALANCE_MASK_PANEL,
  });
}
