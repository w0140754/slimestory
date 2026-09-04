const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const enemies = read("public", "client-enemies.js");
const renderer = read("public", "client-enemy-rendering.js");
const readme = read("README.md");

assert(server.includes('const BUILD_VERSION = "6-11-368";'), 'server build must be 6-11-368');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-368";'), 'client build must be 6-11-368');
assert(html.includes('/client-enemies.js?v=368') && html.includes('/client-enemy-rendering.js?v=368') && html.includes('/game.js?v=368'), 'current Crab cache keys missing');
assert(readme.includes('## v6-11-341 — Crab two-piece animation'), 'historical README v341 changelog missing');
assert(enemies.includes('assets/crab_v2.png?v=347'), 'combined Crab asset not wired');
assert(enemies.includes('assets/crab_back_v1.png?v=347'), 'Crab back asset not wired');
assert(enemies.includes('assets/crab_front_v1.png?v=347'), 'Crab front asset not wired');

const start = renderer.indexOf('function drawCrab(');
const end = renderer.indexOf('\nfunction mushroomIsAwakePresentation', start);
assert(start >= 0 && end > start, 'drawCrab body not found');
const crabBlock = renderer.slice(start, end);
assert(crabBlock.includes('ctx.drawImage(crabBackImage'), 'Crab back piece not rendered');
assert(crabBlock.includes('ctx.drawImage(crabFrontImage'), 'Crab front piece not rendered');
assert(crabBlock.includes('frontOffsetX') && crabBlock.includes('frontOffsetY') && crabBlock.includes('backOffsetY'), 'Crab two-piece animation offsets missing');

for (const [name, expectedW, expectedH] of [["crab_back_v1.png", 30, 16], ["crab_front_v1.png", 30, 16], ["crab_v2.png", 30, 16]]) {
  const asset = fs.readFileSync(path.join(root, 'public', 'assets', name));
  assert(asset.length > 24 && asset.toString('ascii', 1, 4) === 'PNG', `${name} is not a PNG`);
  const width = asset.readUInt32BE(16);
  const height = asset.readUInt32BE(20);
  assert(width === expectedW && height === expectedH, `${name} must remain ${expectedW}x${expectedH}, got ${width}x${height}`);
}

console.log('Crab two-piece animation regression checks passed.');
