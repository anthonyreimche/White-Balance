# White Balance 3.2.0: chromatic adaptation

Issue anthonyreimche/SafeLight#317, from discussion #304: port Christian
Bouhon's white balance rework in libre-dt-lab (commits 9a795a240..29df66323,
`src/iop/cat.c`, `src/common/wb_gamut_mapping.h`).

## What upstream does

Upstream decodes the raw channels referenced to D65. A hidden module after the
input profile then adapts the scene illuminant to the pipeline white in an LMS
space (CAT16 by default; linear or non-linear Bradford, or XYZ). It also
compresses the gamut toward the white (strength 1) and clips negatives.
White balance's Temp/Tint, presets and picker drive that illuminant.

## What Safelight can do, and the scope chosen

Core bakes the as-shot white balance into the decode. libraw-wasm gives no
camera matrix for non-DNG RAWs. So the D65-referenced decode and absolute
illuminants need core work. Anthony chose the extension-only part (2026-11-27):
adaptation **relative to as-shot**.

## Behaviour

- New per-photo setting **Adaptation**: RGB gains (default, today's
  behaviour), CAT16, Bradford, XYZ. It is stored in the bag as
  `safelight.white-balance.adapt.uWbAdaptation` (0, 1, 2, 3). Presets, Copy
  and Paste carry it.
- RGB gains renders exactly as 3.1: the new stage is dormant, and the balance
  stage's text (frozen by core) is unchanged.
- With any other choice, the colour that Temp and Tint make neutral is adapted
  to neutral in that space, instead of by per-channel gains. That colour
  comes out exactly neutral at its own luminance. So Picker, Auto and the
  presets set the same Temp and Tint as before.
- Per pixel, as upstream's cat.c does: clamp negatives in linear Rec.2020, go
  to XYZ, adapt, clip negatives, compress the gamut toward the white
  (strength 1, upstream's fixed value) and clip, clip negatives in the
  adaptation space, then back to Rec.2020 and clip. The white is D65, since
  Safelight's working space is D65 (upstream's is D50).
- At as-shot nothing is adapted, but the gamut compression and the clipping
  still apply, as upstream's hidden module does whenever it is on.
- Reset to defaults puts Adaptation back to RGB gains, in the same step as
  Temp and Tint.

## Not ported, and why

- Absolute light sources (fluorescent F1–F12, LED B1–B5, custom xy, daylight
  or blackbody by real CCT): they need the scene illuminant's real
  chromaticity. Non-DNG RAWs have no camera matrix to give it. The camera
  presets already cover named light sources per body.
- Non-linear Bradford: its blue exponent depends on the illuminant, so it
  can't be undone and redone relative to as-shot.
- The D65-referenced decode: core, and it would change as-shot colours.
- Masks' Temp and Tint stay RGB gains. Local tone's tap weights still use the
  RGB gains of the neutral, which the adaptation reproduces on neutrals.
