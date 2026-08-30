"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const world = require(path.join(root, "public/shared/world-content.js"));

for (const mapId of ["prototypeIsland", "prototypeIslandWest"]) {
  const d = world.maps?.[mapId]?.dimensions;
  if (!d || !(d.width > 640) || !(d.height > 400)) {
    throw new Error(`${mapId} must remain a regression fixture larger than legacy 640x400 bounds.`);
  }
}

const environmentBlock = server.match(/if \(\n    action === "igniteNear" \|\|[\s\S]*?\n    return;\n  \}/)?.[0] || "";
if (!environmentBlock.includes("mapWorldDimensions(playerState.mapId)")) {
  throw new Error("igniteNear/extinguishNear must use the current map dimensions.");
}
if (/payload\.x,[\s\S]{0,80}\b640\b/.test(environmentBlock) || /payload\.y,[\s\S]{0,80}\b400\b/.test(environmentBlock)) {
  throw new Error("environment actions regressed to legacy 640x400 clamps.");
}

const tauntBlock = server.match(/if \(action === "redirect" \|\| action === "taunt"\) \{[\s\S]*?\n    return;\n  \}/)?.[0] || "";
if (!tauntBlock.includes("mapWorldDimensions(enemy.mapId)")) {
  throw new Error("Hallucination taunt coordinates must use the enemy map dimensions.");
}
if (/payload\.x,[\s\S]{0,80}\b640\b/.test(tauntBlock) || /payload\.y,[\s\S]{0,80}\b400\b/.test(tauntBlock)) {
  throw new Error("Hallucination taunt regressed to legacy 640x400 clamps.");
}

console.log("Large-map coordinate bounds check passed.");
