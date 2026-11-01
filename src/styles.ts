// Safelight — founded and principally authored by Anthony Reimche.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 with an
// attribution-preservation term (GPL v3 §7b) — see LICENSE. This notice must
// be preserved in derived versions.

// The look core gave the White Balance panel with Tailwind utilities, as plain
// CSS (the app's Tailwind build never scans an extension). `:where()` drops
// every rule to zero specificity, so a stylesheet that restyles the panel or
// its buttons wins over them. The `html.sl-larger-text` and
// `html.sl-title-headings` rules repeat core's Accessibility rules for 10 px,
// uppercase and widely tracked text.

import type { UiTokens } from "./safelight";

const P = "safelight-white-balance";

export const cls = {
  toolbar: `${P}-toolbar`,
  picker: `${P}-picker`,
  on: `${P}-on`,
  sliders: `${P}-sliders`,
} as const;

export function whiteBalanceCss(t: UiTokens): string {
  return `
:where(.${cls.toolbar}) { margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; }
:where(.${cls.picker}) { display: flex; align-items: center; gap: 0.25rem; border-radius: 0.25rem; border: 1px solid ${t.borderSubtle}; padding: 0.125rem 0.5rem; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${t.textSecondary}; }
:where(.${cls.picker}:hover) { border-color: ${t.border}; color: ${t.textPrimary}; }
:where(.${cls.picker}.${cls.on}) { border-color: ${t.accent}; background-color: color-mix(in srgb, ${t.accent} 30%, transparent); color: ${t.textPrimary}; }
:where(.${cls.picker}:disabled) { cursor: default; opacity: 0.4; }
:where(.${cls.sliders} > :not(:last-child)) { margin-block: 0 0.125rem; }
html.sl-larger-text .${cls.picker} { font-size: 12px !important; text-transform: none !important; letter-spacing: normal !important; }
html.sl-title-headings .${cls.picker} { text-transform: capitalize !important; }
`;
}
