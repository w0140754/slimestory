const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

const pkg = JSON.parse(read("package.json"));
const world = read("public", "client-world.js");

assert.strictEqual(pkg.version, "0.6.11.379", "package version must be 0.6.11.379");
assert(world.includes('assets/interactive_tree_canopy_v376.png?v=379'), 'interactive tree canopy cache key missing');
assert(world.includes('assets/interactive_tree_canopy_v376_flip.png?v=379'), 'interactive tree flipped canopy cache key missing');
assert(world.includes('assets/interactive_tree_trunk_v376.png?v=379'), 'interactive tree trunk cache key missing');
assert(world.includes('assets/interactive_tree_trunk_damaged_v376.png?v=379'), 'interactive tree damaged trunk cache key missing');
assert(world.includes('assets/interactive_tree_stump_v376.png?v=379'), 'interactive tree stump cache key missing');

for (const asset of [
  'interactive_tree_canopy_v376.png',
  'interactive_tree_canopy_v376_flip.png',
  'interactive_tree_trunk_v376.png',
  'interactive_tree_trunk_damaged_v376.png',
  'interactive_tree_stump_v376.png'
]) {
  assert(exists('public', 'assets', asset), `missing asset: ${asset}`);
}

console.log('[PASS] Interactive tree art refresh assets and cache keys are present for v376.');
