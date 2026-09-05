const fs = require('fs');
const path = require('path');
const assert = require('assert');

function readText(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
}
function readBuffer(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts));
}
function readPngSize(buffer) {
  assert(buffer.slice(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'file must be a PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const pkg = JSON.parse(readText('package.json'));
const world = readText('public', 'client-world.js');
assert.strictEqual(pkg.version, '0.6.11.375', 'package version must be 0.6.11.375');
assert(world.includes('fire_immune_tree_trunk_v1.png?v=375'), 'decorative tree trunk cache key missing');
assert(world.includes('fire_immune_tree_canopy_v1.png?v=375'), 'decorative tree canopy cache key missing');
assert(world.includes('fire_immune_tree_canopy_v1_flip.png?v=375'), 'decorative tree flipped canopy cache key missing');

for (const file of [
  'fire_immune_tree_trunk_v1.png',
  'fire_immune_tree_canopy_v1.png',
  'fire_immune_tree_canopy_v1_flip.png'
]) {
  const buffer = readBuffer('public', 'assets', file);
  const { width, height } = readPngSize(buffer);
  assert.deepStrictEqual([width, height], [32, 48], `${file} must remain 32x48`);
  assert(buffer.length > 100, `${file} must contain real PNG image data`);
}

console.log('[PASS] Decorative tree art swap assets and cache keys are present for v375.');
