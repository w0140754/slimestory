const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const pkg = JSON.parse(read('package.json'));
const server = read('server.js');
const config = read('public', 'client-config.js');
const game = read('public', 'game.js');

assert.strictEqual(pkg.version, '0.6.11.390');
assert(server.includes('const BUILD_VERSION = "6-11-390";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-390";'));
assert(game.includes('function verticalWallHasUpperHorizontalJoin(structure)'), 'upper corner join detector missing');
assert(game.includes('const upperY = Number(structure.y) - 8;'), 'upper endpoint must be based on the original 16px edge');
assert(game.includes('Math.abs(Math.abs(Number(other.x) - x) - 8) < 1'), 'horizontal wall must meet either upper corner endpoint');
assert(game.includes('const cornerExtension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;'), 'upper corner must add exactly one 16px tile of visual height');
assert(game.includes('const height = 32 + cornerExtension;'), 'side wall base height must remain 32px');
assert(game.includes('const top = sy + 9 - height;'), 'corner extension must grow upward while preserving the same lower endpoint');
assert(game.includes('ctx.fillRect(sx, sy - 8, 1, 16);'), 'thin 16px edge collision marker must remain unchanged');
assert(game.includes('return { x: Number(structure.x) - 1, y: Number(structure.y) - 8, width: 2, height: 16 };'), 'client collision must remain a 2x16 edge');
assert(server.includes('return { x: structure.x - 1, y: structure.y - 8, width: 2, height: 16 };'), 'server collision must remain a 2x16 edge');
console.log('v385 corner-wall checks passed: upper side corners gain one render-only tile and collision stays unchanged.');
