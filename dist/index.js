//#region src/rt.ts
var e, t;
function n(n) {
	t = n, e = n.react;
}
//#endregion
//#region src/stages.ts
var r = (e) => ({
	key: e,
	glslType: "float",
	default: 0
});
function i(e) {
	return {
		id: "safelight.white-balance.balance",
		name: "White Balance",
		phase: "scene-linear",
		anchor: "white-balance",
		glsl: "lin = applyWhiteBalance(lin, uTemperature, uTint, uAsShotTemperature);",
		uniforms: [r("uTemperature"), r("uTint")],
		derive: (e) => ({
			uTemperature: e.temperature,
			uTint: e.tint
		})
	};
}
//#endregion
//#region src/styles.ts
var a = "safelight-white-balance", o = {
	toolbar: `${a}-toolbar`,
	picker: `${a}-picker`,
	on: `${a}-on`,
	sliders: `${a}-sliders`
};
function s(e) {
	return `
:where(.${o.toolbar}) { margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; }
:where(.${o.picker}) { display: flex; align-items: center; gap: 0.25rem; border-radius: 0.25rem; border: 1px solid ${e.borderSubtle}; padding: 0.125rem 0.5rem; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${e.textSecondary}; }
:where(.${o.picker}:hover) { border-color: ${e.border}; color: ${e.textPrimary}; }
:where(.${o.picker}.${o.on}) { border-color: ${e.accent}; background-color: color-mix(in srgb, ${e.accent} 30%, transparent); color: ${e.textPrimary}; }
:where(.${o.picker}:disabled) { cursor: default; opacity: 0.4; }
:where(.${o.sliders} > :not(:last-child)) { margin-block: 0 0.125rem; }
html.sl-larger-text .${o.picker} { font-size: 12px !important; text-transform: none !important; letter-spacing: normal !important; }
html.sl-title-headings .${o.picker} { text-transform: capitalize !important; }
`;
}
//#endregion
//#region src/WhiteBalancePanel.tsx
var c = { onPress(e) {
	t.develop.setPickDrag(null), t.develop.autoAdjust.whiteBalanceAt(e);
} };
function l() {
	let { Panel: n, Slider: r, PickerIcon: i, AutoButton: a } = t.components, s = t.stores.useDevelopStore, l = s((e) => e.params.temperature), u = s((e) => e.params.tint), d = s((e) => e.setParam), f = s((e) => e.commitEdit), p = s((e) => e.histogram != null), m = s((e) => e.asShotTemperature), h = t.develop.usePickDragHeld();
	return /* @__PURE__ */ e.createElement(n, { title: "White Balance" }, /* @__PURE__ */ e.createElement("div", { className: o.toolbar }, /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.develop.setPickDrag(h ? null : c),
		disabled: !p,
		title: "White balance selector — click a neutral grey in the image",
		"aria-pressed": h,
		className: `${o.picker}${h ? ` ${o.on}` : ""}`
	}, /* @__PURE__ */ e.createElement(i, null), "Picker"), /* @__PURE__ */ e.createElement(a, {
		onClick: () => void t.develop.autoAdjust.whiteBalance(),
		disabled: !p,
		title: "Auto white balance (grey-world)"
	})), /* @__PURE__ */ e.createElement("div", { className: o.sliders }, /* @__PURE__ */ e.createElement(r, {
		label: "Temp",
		value: l,
		min: 2e3,
		max: 5e4,
		step: 10,
		defaultValue: m,
		onChange: (e) => d("temperature", e),
		onCommit: () => void f("Temperature")
	}), /* @__PURE__ */ e.createElement(r, {
		label: "Tint",
		value: u,
		min: -150,
		max: 150,
		defaultValue: 0,
		onChange: (e) => d("tint", e),
		onCommit: () => void f("Tint")
	})));
}
function u() {
	let { Slider: n } = t.components, r = t.develop.useMaskScope();
	return /* @__PURE__ */ e.createElement("div", { className: o.sliders }, /* @__PURE__ */ e.createElement(n, {
		label: "Temp",
		value: r.adj.temperature,
		min: -100,
		max: 100,
		step: 1,
		defaultValue: 0,
		onChange: (e) => r.setAdj({ temperature: e }),
		onCommit: () => r.commit("Mask Temp")
	}), /* @__PURE__ */ e.createElement(n, {
		label: "Tint",
		value: r.adj.tint,
		min: -100,
		max: 100,
		step: 1,
		defaultValue: 0,
		onChange: (e) => r.setAdj({ tint: e }),
		onCommit: () => r.commit("Mask Tint")
	}));
}
var d = {
	component: u,
	order: 20,
	owns: ["temperature", "tint"]
}, f = "core.white-balance", p = "safelight.white-balance.styles", m = 3;
function h(e) {
	n(e), e.registerStylesheet({
		id: p,
		css: s(e.ui.tokens)
	}), e.registerProcessingStage(i(3)), e.registerPanel({
		id: f,
		title: "White Balance",
		component: l,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 4,
			width: 280,
			height: 120
		},
		onReset: () => void e.stores.useDevelopStore.getState().resetParams(["temperature", "tint"], "Reset White Balance"),
		mask: d
	});
}
//#endregion
export { m as LINE, f as PANEL_ID, p as STYLESHEET_ID, h as activate };

//# sourceMappingURL=index.js.map