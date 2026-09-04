"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const html = read("public", "index.html");
const game = read("public", "game.js");
const app = read("public", "client-app.js");

assert(html.includes('<div id="npcNameLayer" aria-hidden="true"></div>'));
assert(html.includes(".npc-name-label"));
assert(html.includes("font: 600 11px/1 Arial, sans-serif;"));
assert(html.includes("text-shadow:") && !html.includes(".npc-name-label {\n    background:"));

assert(game.includes('document.getElementById("npcNameLayer")'));
assert(game.includes('document.createElement("span")'));
assert(game.includes('node.className = "npc-name-label"'));
assert(game.includes("presentationX / VIEW_W * 100"));
assert(game.includes("presentationY / VIEW_H * 100"));
assert(!game.includes('ctx.font = "5px Arial, sans-serif"'));
assert(!game.includes('ctx.fillStyle = "rgba(24, 24, 24, .76)"'));

assert(app.includes('typeof beginNpcNameTagFrame === "function"'));
assert(app.includes('typeof endNpcNameTagFrame === "function"'));

console.log("Crisp screen-resolution NPC labels OK.");
