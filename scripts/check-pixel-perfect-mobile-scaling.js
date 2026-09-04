"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const html = read("public", "index.html");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const app = read("public", "client-app.js");
const config = read("public", "client-config.js");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.368");
assert(server.includes('const BUILD_VERSION = "6-11-368";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-368";'));
assert(html.includes('/client-app.js?v=368') && html.includes('/game.js?v=368'));

assert(html.includes('const LOGICAL_W = 224;') && html.includes('const LOGICAL_H = 126;'), "mobile logical view changed");
assert(html.includes('const wholePhysicalScale = Math.max('), "whole physical-pixel fitting missing");
assert(html.includes('fittingScale - (fittingScale % renderScale)'), "display scale must remain divisible by the backing scale");
assert(html.includes('mobileViewport.style.width = `${LOGICAL_W * wholePhysicalScale / dpr}px`;'), "pixel-perfect viewport width missing");
assert(html.includes('mobileViewport.style.height = `${LOGICAL_H * wholePhysicalScale / dpr}px`;'), "pixel-perfect viewport height missing");

assert(game.includes('const GAME_RENDER_SCALE = Math.max('), "integer backing scale missing");
assert(game.includes('ctx.setTransform(GAME_RENDER_SCALE, 0, 0, GAME_RENDER_SCALE, 0, 0);'), "backing transform missing");
assert(game.includes('Number(canvas.dataset.logicalWidth) || canvas.width'), "logical width separation missing");
assert(input.includes('rect.width / VIEW_W') && !input.includes('rect.width / canvas.width'), "mobile synthetic input must use logical coordinates");
assert(app.includes('(renderCamera.x - camera.x) * GAME_RENDER_SCALE'), "camera remainder must quantize to backing pixels");

for (const physicalHeight of [750, 1125, 1170]) {
  const fittingScale = Math.floor(physicalHeight / 126);
  const renderScale = fittingScale % 3 === 0 ? 3 : fittingScale % 2 === 0 ? 2 : 1;
  const wholePhysicalScale = Math.max(renderScale, fittingScale - fittingScale % renderScale);
  assert(Number.isInteger(wholePhysicalScale));
  assert.strictEqual(wholePhysicalScale % renderScale, 0);
  assert(126 * wholePhysicalScale <= physicalHeight);
}

assert(config.includes('baseSpeed: 54'), "54 px/s movement must remain");
assert.strictEqual(adopted.version, 68, "pixel scaling must preserve current authored map data");

console.log("Pixel-perfect mobile viewport/backing scale checks passed with clean logical input mapping.");
