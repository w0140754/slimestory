"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const config = fs.readFileSync(path.join(root, "public", "client-config.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

for (const retiredSelector of [
  ".menu-hotkey-rail",
  ".menu-hotkey-rail-title",
  ".menu-hotkey-rail-help",
  "#menuItemHotkeyRail",
  ".menu-hotkey-stack",
  ".menu-item-hotkey-slot",
  ".menu-hotkey-key",
  ".menu-hotkey-item-name",
]) {
  assert(!html.includes(retiredSelector), `retired assignment-rail CSS survived: ${retiredSelector}`);
}
assert(!html.includes('id="menuItemHotkeyRail"'), "retired assignment rail DOM returned");
assert(!game.includes("menuItemHotkeyRail"), "retired assignment rail runtime returned");
assert(html.includes('id="hotbar"') && html.includes('id="slot10"'), "live 1-0 HUD missing");
assert(html.includes('/game.js?v=431e-432'), "v432 cache token missing");
assert(server.includes('const BUILD_VERSION = "6-11-432";'), "server build version not advanced");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-432";'), "client build version not advanced");
assert.strictEqual(pkg.version, "0.6.11.432", "package version not advanced");
console.log("v432 retired assignment-rail CSS purge regression check passed");
