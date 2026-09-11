"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("public", "index.html");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const server = read("server.js");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('?v=431'), "client cache markers must advance to v421");

// Crafting is now a first-class HUD action rather than an inventory submenu.
assert(html.includes('id="craftHudButton"'), "top-level CRAFT HUD button missing");
assert(!html.includes('id="menuCraftButton"'), "Craft must no longer live inside the main inventory menu");
assert(!html.includes('id="craftTabs"'), "Crafting categories/tabs must be removed");
assert(html.includes('id="craftGrid" role="list"'), "single vertical recipe list missing");
assert(html.includes('flex-direction: column;') && html.includes('scrollbar-width: thin;'), "craft list should be a compact scrollable vertical rail");
assert(game.includes('document.getElementById("craftHudButton")?.addEventListener("click"'), "CRAFT HUD button must toggle crafting");
assert(game.includes('button.hidden = !visible;') && !game.includes('craftCategoryFilter'), "recipes should be filtered only by materials/station, not categories");

// Crafting tables unlock recipes by proximity only. They are not F-interaction stations anymore.
assert(game.includes('function playerNearCraftingTable(range = 40)'), "portable table proximity check missing");
assert(!game.includes('kind: "craftingTableStructure"'), "portable tables must not enter F-interaction candidates");
assert(!game.includes('placedKind === "craftingTable"\n        ? "F CRAFT"'), "F CRAFT prompt must be retired");
assert(!game.includes('interaction.kind === "bench" || interaction.kind === "craftingTableStructure"'), "legacy bench/table interaction prompt remains");

// Any newly acquired hotbar-eligible item should fill the first free slot.
assert(game.includes('function hotbarAssignableAcquisitionSnapshot()'), "acquisition snapshot helper missing");
assert(game.includes('function autoAssignNewlyAcquiredHotbarItems('), "generic acquisition auto-assign helper missing");
assert(game.includes('const HOTBAR_RESOURCE_ITEM_BY_KEY = Object.freeze({'), "build-resource hotbar mapping missing");
assert(game.includes('autoAssignHotbarItem(itemId);'), "equipment grants must auto-assign even after a prior manual clear");
assert(network.includes('const beforeHotbarCounts = hotbarAssignableAcquisitionSnapshot();'), "network acquisitions must snapshot hotbar counts");
assert(network.includes('autoAssignNewlyAcquiredHotbarItems(beforeHotbarCounts);'), "network craft/loot acquisitions must auto-assign");

// Rain visual coverage is lane-distributed across the whole logical viewport.
assert(game.includes('const columnSpacing = 12;'), "full-width rain lane spacing missing");
assert(game.includes('const columnCount = Math.ceil((VIEW_W + columnSpacing) / columnSpacing);'), "rain must cover the full logical viewport width");
assert(game.includes('for (let column = 0; column < columnCount; column += 1)'), "rain lane renderer missing");
assert(game.includes('applyCloudShadowInteriorClip(currentCamX, currentCamY);'), "roof shelter visual clipping must remain");

console.log("v421 crafting/rain/hotbar UI static check passed: full-width rain, top-level vertical Craft rail, no F crafting, and acquisition auto-hotbar assignment are wired.");
