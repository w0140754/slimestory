const fs = require("fs");
const vm = require("vm");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");

const rects = [];
const ctx = {
  beginPath() { rects.length = 0; },
  rect(x, y, width, height) { rects.push({ x, y, width, height }); },
  save() {}, restore() {}, clip() {}, fillRect() {},
  set fillStyle(value) { this._fillStyle = value; },
  get fillStyle() { return this._fillStyle; }
};

const WORLD_CONTENT = {
  maps: {
    testWater: {
      dimensions: { width: 320, height: 180 },
      terrain: {
        cellSize: 8,
        defaultType: "grass",
        regions: [
          { type: "water", x: 104, y: 96, width: 32, height: 32 }
        ]
      }
    }
  }
};

const context = {
  TERRAIN_RULES,
  WORLD_CONTENT,
  TERRAIN_PRESENTATION: {
    PALETTE: { water: {}, grass: {}, dirt: {}, stone: {} },
    hash() { return 0; },
    drawCellTexture() {},
    drawTransitions() {}
  },
  currentMapId: "testWater",
  ctx,
  worldTime: 0,
  VIEW_W: 320,
  VIEW_H: 180,
  console
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("public/client-terrain.js", "utf8"), context, { filename: "client-terrain.js" });

const info = vm.runInContext('terrainWaterReflectionInfo(120, 88, "testWater", 16)', context);
if (!info) throw new Error("No reflection info returned near authored water shoreline");
if (Math.abs(info.mirrorWorldY - 96) > 0.001) throw new Error("Reflection mirror line does not match authored shoreline");
if (Math.abs(info.distanceToShore - 8) > 0.001) throw new Error("Reflection shoreline distance is incorrect");
if (Math.abs(info.fade - 0.5) > 0.001) throw new Error("Reflection fade is not distance-based");

const far = vm.runInContext('terrainWaterReflectionInfo(120, 70, "testWater", 16)', context);
if (far !== null) throw new Error("Reflection should not appear beyond shoreline distance");

const hasWater = vm.runInContext('terrainWaterClipPath("testWater", 80, 72)', context);
if (!hasWater || rects.length !== 16) {
  throw new Error(`Expected 16 authored water cells in clip path, found ${rects.length}`);
}
if (rects.some(rect => rect.width !== 8 || rect.height !== 8)) {
  throw new Error("Water clip path should use seamless full terrain cells");
}

console.log("Terrain water reflection OK: shoreline lookup, fade, range, and seamless clipping work.");
