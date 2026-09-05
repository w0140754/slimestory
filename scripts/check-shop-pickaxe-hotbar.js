const fs = require("fs");
const crypto = require("crypto");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const pickaxe = fs.readFileSync("public/assets/pickaxe_v6.png");

const sha = crypto.createHash("sha256").update(pickaxe).digest("hex");
const checks = [
  [html.includes("width: min(760px, calc(100vw - 56px));") && html.includes("min-height: 108px;") && html.includes("width: 42px;\n    height: 42px;"), "larger shop panel/cards/icons"],
  [/#slot4\s*\{\s*margin-left:\s*24px;/.test(html), "enlarged item/equipment hotbar separation"],
  [game.includes('const pickaxeImage = loadImage("assets/pickaxe_v6.png");'), "pickaxe v6 cache-safe asset path"],
  [sha === "b6e22064a84dd6feffd19ca5dd30232334769e2a4d2910f9de86ae67a8f409cc", "new supplied pickaxe art"],
  [html.includes('/game.js?v=375'), "325 cache key"],
  [/\.hotbar-slot\s*\{[\s\S]*?width:\s*58px;[\s\S]*?height:\s*58px;/.test(html), "desktop top hotbar roughly 30 percent larger"],
  [/\.hotbar-slot img\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/.test(html), "desktop hotbar icons scale with slots"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Shop/pickaxe/hotbar regression: ${label}`);
}
console.log("Shop scale, pickaxe art, and 3/4 hotbar spacing checks passed.");
