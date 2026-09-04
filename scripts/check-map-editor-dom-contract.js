"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(root, "public", "map-editor.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "map-editor.html"), "utf8");

const referencedIds = new Set();
for (const match of js.matchAll(/getElementById\("([^"]+)"\)/g)) referencedIds.add(match[1]);

const missing = [...referencedIds].filter(id => !new RegExp(`id=["']${id}["']`).test(html));
if (missing.length) {
  throw new Error(`Map editor DOM contract missing ids: ${missing.join(", ")}`);
}

for (const className of ["terrain-tool", "palette-tool"]) {
  if (!new RegExp(`class=["'][^"']*\\b${className}\\b`).test(html)) {
    throw new Error(`Map editor DOM contract missing .${className}`);
  }
}

if (!/const BUILD = "368"/.test(js) || !/Map Editor <span>v365<\/span>/.test(html)) {
  throw new Error("Map editor build markers are not synchronized for v364");
}

console.log(`Map editor DOM contract OK: ${referencedIds.size} ids`);
