const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const pkg = JSON.parse(read('package.json'));
const server = read('server.js');
const config = read('public', 'client-config.js');
const game = read('public', 'game.js');
const geometry = require(path.join(root, 'public', 'shared', 'structure-geometry.js'));

assert.strictEqual(pkg.version, '0.6.11.432');
assert(server.includes('const BUILD_VERSION = "6-11-432";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-432";'));
assert(game.includes('function verticalWallHasUpperHorizontalJoin(structure)'), 'upper corner join detector missing');
assert(game.includes('const upperY = Number(structure.y) - 8;'), 'upper endpoint must be based on the original 16px edge');
assert(game.includes('Math.abs(Math.abs(Number(other.x) - x) - 8) < 1'), 'horizontal wall must meet either upper corner endpoint');
assert(game.includes('const cornerExtension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;'), 'upper corner must add exactly one 16px tile of visual height');
assert(game.includes('const height = 32 + cornerExtension;'), 'side wall base height must remain 32px');
assert(game.includes('const top = sy + 9 - height;'), 'corner extension must grow upward while preserving the same lower endpoint');
assert(game.includes('ctx.drawImage(woodWallStructureImage, left, top, 4, 32);'), 'side wall must use the authored sprite without changing its thin collision geometry');
assert(game.includes('STRUCTURE_GEOMETRY.collisionRect(structure, 2)'), 'client collision must use the shared 2px edge geometry');
assert(server.includes('STRUCTURE_GEOMETRY.collisionRect(structure, 2)'), 'server collision must use the shared 2px edge geometry');
assert.deepStrictEqual(geometry.collisionRect({ kind: 'woodWall', axis: 'vertical', x: 8, y: 8 }, 2), { x: 7, y: 0, width: 2, height: 16 });
console.log('v385 corner-wall checks passed: upper side corners gain one render-only tile and collision stays unchanged.');
