// The preset menu's arithmetic: the blackbody fit copied from core, which kind
// of photo is open, finding the camera in the preset table, a camera preset's
// Temp and Tint, the entry the current values show, and the relative Temp a
// rendered photo gets. Expected numbers come from core's own
// src/rendering/blackbody.ts, run on the same inputs.

import { describe, expect, it } from "vitest";
import { kelvinFromWhiteBalanceGains, tintForGreenGain, whiteBalanceGain } from "../src/blackbody";
import {
  DNG_PRESETS,
  cameraPresets,
  findCamera,
  kelvinForRelative,
  photoKind,
  presetMenu,
  relativeTemp,
  selectedEntry,
} from "../src/presets";

const photo = (filename: string, exif: Record<string, unknown> = {}) => ({ filename, exif });

describe("the blackbody fit", () => {
  it("reads the Kelvin core reads from a camera's multipliers", () => {
    expect(
      [
        [1.726563, 1, 1.335938],
        [2.0, 1, 1.5],
        [1.2448, 1, 3.1758],
        [2.469, 1, 1.2999],
      ].map(([r, g, b]) => kelvinFromWhiteBalanceGains(r, g, b)),
    ).toEqual([7350, 7550, 3960, 10980]);
  });

  it("gives core's gains and tint", () => {
    const [r, g, b] = whiteBalanceGain(8400, 7350);
    expect(r).toBeCloseTo(1.0776595251020518, 12);
    expect(g).toBe(1);
    expect(b).toBeCloseTo(0.9063564761281175, 12);
    expect(tintForGreenGain(0.95)).toBeCloseTo(12.5, 12);
  });

  it("has no Kelvin for missing multipliers", () => {
    expect(kelvinFromWhiteBalanceGains(0, 1, 1)).toBeUndefined();
  });
});

describe("photoKind", () => {
  it("tells a camera RAW, a DNG and a rendered photo apart by the as-shot Kelvin and the file", () => {
    expect(photoKind(photo("DSC_0001.NEF", { colorTemperature: 7350 }))).toBe("camera-raw");
    expect(photoKind(photo("L1000001.DNG", { colorTemperature: 5430 }))).toBe("dng");
    expect(photoKind(photo("IMG_0001.jpg", {}))).toBe("rendered");
    expect(photoKind(photo("DSC_0002.NEF", {}))).toBe("rendered");
    expect(photoKind(undefined)).toBe("rendered");
  });
});

describe("findCamera", () => {
  it.each([
    ["NIKON CORPORATION", "NIKON Z 6_2", "Nikon", "Z 6_2"],
    ["Canon", "Canon EOS 5D Mark III", "Canon", "EOS 5D Mark III"],
    ["OM Digital Solutions", "OM-1", "OM System", "OM-1"],
    ["SONY", "ILCE-7M3", "Sony", "ILCE-7M3"],
    ["FUJIFILM", "X-T3", "Fujifilm", "X-T3"],
    ["PENTAX", "PENTAX K-1", "Pentax", "K-1"],
    ["RICOH IMAGING COMPANY, LTD.", "RICOH GR III", "Ricoh", "GR III"],
  ])("finds %s %s", (make, model, maker, tableModel) => {
    expect(findCamera(make, model)?.slice(0, 2)).toEqual([maker, tableModel]);
  });

  it.each([
    ["Canon EOS REBEL T2i", "EOS 550D"],
    ["Canon EOS Kiss X4", "EOS 550D"],
    ["Canon EOS DIGITAL REBEL XTi", "EOS 400D"],
    ["Canon EOS Kiss Digital X", "EOS 400D"],
    ["Canon EOS Rebel SL2", "EOS 200D"],
    ["Canon EOS Rebel T6s", "EOS 760D"],
    ["Canon EOS KISS M", "EOS M50"],
  ])("finds Canon's regional name %s as the %s", (model, tableModel) => {
    expect(findCamera("Canon", model)?.slice(0, 2)).toEqual(["Canon", tableModel]);
  });

  it("finds a regional name only for a body the table lists", () => {
    expect(findCamera("Canon", "Canon EOS Rebel T100")).toBeUndefined();
  });

  it("needs the make's family to agree", () => {
    expect(findCamera("Canon", "Z 6")).toBeUndefined();
  });

  it("finds nothing for an unknown body or a missing make or model", () => {
    expect(findCamera("NIKON CORPORATION", "NIKON Z 99")).toBeUndefined();
    expect(findCamera(undefined, "Z 6")).toBeUndefined();
    expect(findCamera("NIKON CORPORATION", undefined)).toBeUndefined();
  });
});

describe("cameraPresets", () => {
  const z6 = () => {
    const row = findCamera("NIKON CORPORATION", "NIKON Z 6");
    if (!row) throw new Error("no Z 6 in the table");
    return cameraPresets(row);
  };

  it("keeps the camera's own presets in its menu order, with unique ids", () => {
    const presets = z6();
    expect(presets.map((p) => p.label)).toEqual([
      "Direct Sunlight",
      "Cloudy",
      "Shade",
      "Incandescent",
      "Sodium-Vapor Fluorescent",
      "Warm White Fluorescent",
      "White Fluorescent",
      "Cool White Fluorescent",
      "Day White Fluorescent",
      "Daylight Fluorescent",
      "High Temp. Mercury-Vapor Fluorescent",
      "Flash",
    ]);
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
  });

  it("puts Temp where core puts an as-shot Kelvin, and Tint relative to Daylight", () => {
    const byLabel = new Map(z6().map((p) => [p.label, p]));
    expect(byLabel.get("Direct Sunlight")).toMatchObject({ temperature: 7350, tint: 0 });
    expect(byLabel.get("Cloudy")).toMatchObject({ temperature: 8400, tint: -1 });
    expect(byLabel.get("Incandescent")).toMatchObject({ temperature: 4590, tint: -10 });
    expect(byLabel.get("Cool White Fluorescent")).toMatchObject({ temperature: 5770, tint: 22 });
  });

  it("measures Tint against the photo's as-shot multipliers when it has them", () => {
    const row = findCamera("NIKON CORPORATION", "NIKON Z 6");
    if (!row) throw new Error("no Z 6 in the table");
    const underFluorescent = new Map(cameraPresets(row, [1.623, 1, 1.9531]).map((p) => [p.label, p]));
    expect(underFluorescent.get("Cool White Fluorescent")).toMatchObject({ temperature: 5770, tint: 0 });
    expect(underFluorescent.get("Direct Sunlight")).toMatchObject({ temperature: 7350, tint: -24 });
    expect(underFluorescent.get("Cloudy")).toMatchObject({ temperature: 8400, tint: -26 });
    const underCloud = new Map(cameraPresets(row, [1.8398, 1, 1.2129]).map((p) => [p.label, p]));
    expect(underCloud.get("Cloudy")?.tint).toBe(0);
    expect(underCloud.get("Direct Sunlight")?.tint).toBe(1);
  });

  it("gives Tint 0 everywhere when the camera has no daylight preset", () => {
    const presets = cameraPresets(["Test", "Body", [["Tungsten", 1.2, 2.4], ["Fluorescent", 1.6, 2.0]]]);
    expect(presets.map((p) => p.tint)).toEqual([0, 0]);
  });
});

describe("presetMenu", () => {
  it("offers a listed camera's presets under its name", () => {
    const menu = presetMenu(photo("DSC_0001.NEF", { colorTemperature: 7350, cameraMake: "NIKON CORPORATION", cameraModel: "NIKON Z 6" }));
    expect(menu.title).toBe("Nikon Z 6");
    expect(menu.presets[0]).toMatchObject({ label: "Direct Sunlight", temperature: 7350 });
    expect(menu.missing).toBe(false);
  });

  it("measures a camera's presets against the photo's as-shot multipliers", () => {
    const menu = presetMenu(
      photo("DSC_0001.NEF", {
        colorTemperature: 5770,
        cameraMake: "NIKON CORPORATION",
        cameraModel: "NIKON Z 6",
        asShotMultipliers: [1.623, 1, 1.9531],
      }),
    );
    expect(menu.presets.find((p) => p.label === "Direct Sunlight")?.tint).toBe(-24);
  });

  it("says an unlisted camera has none", () => {
    const menu = presetMenu(photo("X.NEF", { colorTemperature: 7350, cameraMake: "Acme", cameraModel: "One" }));
    expect(menu).toEqual({ presets: [], missing: true });
  });

  it("offers a DNG the standard presets on the CCT scale", () => {
    expect(presetMenu(photo("L1.dng", { colorTemperature: 5430, cameraMake: "Leica Camera AG", cameraModel: "M9" }))).toEqual({
      presets: DNG_PRESETS,
      missing: false,
    });
    expect(DNG_PRESETS.map((p) => [p.label, p.temperature, p.tint])).toEqual([
      ["Daylight", 5500, 0],
      ["Cloudy", 6500, 0],
      ["Shade", 7500, 0],
      ["Tungsten", 2850, 0],
      ["Fluorescent", 3800, 16],
      ["Flash", 5500, 0],
    ]);
  });

  it("offers a rendered photo no light-source presets", () => {
    expect(presetMenu(photo("IMG.jpg", { cameraMake: "NIKON CORPORATION", cameraModel: "NIKON Z 6" }))).toEqual({
      presets: [],
      missing: false,
    });
  });
});

describe("selectedEntry", () => {
  const presets = [{ id: "preset:Cloudy", label: "Cloudy", temperature: 8400, tint: -1 }];

  it("shows As Shot at the as-shot Kelvin and Tint 0, even where a preset also lands", () => {
    expect(selectedEntry({ temperature: 7350, tint: 0 }, 7350, presets, null)).toBe("as-shot");
    expect(selectedEntry({ temperature: 8400, tint: -1 }, 8400, [{ ...presets[0], tint: 0 }], null)).toBe("custom");
    expect(selectedEntry({ temperature: 8400, tint: 0 }, 8400, [{ ...presets[0], tint: 0 }], null)).toBe("as-shot");
  });

  it("shows the preset the values equal", () => {
    expect(selectedEntry({ temperature: 8400, tint: -1 }, 7350, presets, null)).toBe("preset:Cloudy");
  });

  it("shows Auto at what Auto last set", () => {
    expect(selectedEntry({ temperature: 5210, tint: 6 }, 7350, presets, { temperature: 5210, tint: 6 })).toBe("auto");
  });

  it("shows Custom otherwise", () => {
    expect(selectedEntry({ temperature: 8410, tint: -1 }, 7350, presets, { temperature: 5210, tint: 6 })).toBe("custom");
  });
});

describe("relative Temp", () => {
  it("steps one mired per unit from the as-shot Kelvin", () => {
    expect(kelvinForRelative(0, 6500)).toBe(6500);
    expect(kelvinForRelative(100, 6500)).toBeCloseTo(18571.43, 2);
    expect(kelvinForRelative(-100, 6500)).toBeCloseTo(3939.39, 2);
    expect(relativeTemp(18571.428571, 6500)).toBe(100);
    expect(relativeTemp(6500, 6500)).toBe(0);
  });

  it("stops at 50000 K, and reads a Kelvin past ±100 as it is", () => {
    expect(kelvinForRelative(140, 6500)).toBe(50000);
    expect(relativeTemp(3000, 6500)).toBe(-179);
  });

  it("round-trips every step", () => {
    for (let v = -100; v <= 100; v++) expect(relativeTemp(kelvinForRelative(v, 6500), 6500)).toBe(v);
  });
});
