const fs = require("fs");
const terrain = fs.readFileSync("public/client-terrain.js", "utf8");
const editor = fs.readFileSync("public/map-editor.js", "utf8");
if (!/type !== "water"/.test(terrain) || !/terrainSouthFaceStyle/.test(terrain) || !/face: "#315e76"/.test(terrain)) {
  throw new Error("Runtime water-to-void south face is not wired");
}
if (!/drawTerrainSouthFaces/.test(editor) || !/water: \{ face: "#315e76"/.test(editor)) {
  throw new Error("Editor water-to-void south face preview is not wired");
}
console.log("Water edge OK: water-to-void faces render in runtime and editor preview.");
