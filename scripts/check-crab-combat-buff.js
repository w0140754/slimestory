const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = read('server.js');
const enemies = read('public', 'client-enemies.js');
const balanceText = read('public', 'shared', 'combat-balance.js');
const config = read('public', 'client-config.js');
const html = read('public', 'index.html');
const readme = read('README.md');
const balance = require(path.join(root, 'public', 'shared', 'combat-balance.js'));

assert(server.includes('const BUILD_VERSION = "6-11-365";'), 'server build must be v347');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-365";'), 'client build must be v347');
assert(html.includes('/shared/combat-balance.js?v=365'), 'combat balance cache key must be v27');
assert(html.includes('/client-enemies.js?v=365') && html.includes('/game.js?v=365'), 'v347 client cache keys missing');

const crabServerStart = server.indexOf('function makeServerCrab(spawn)');
const crabServerEnd = server.indexOf('function resetServerCrab(crab)', crabServerStart);
assert(crabServerStart >= 0 && crabServerEnd > crabServerStart, 'server Crab constructor block missing');
const crabServer = server.slice(crabServerStart, crabServerEnd);
assert(crabServer.includes('speed: 15,'), 'passive Crab scuttle speed must remain 15');
assert(crabServer.includes('chaseSpeed: 42,'), 'aggro Crab chase speed must be 42');
assert(crabServer.includes('maxHp: 120,') && crabServer.includes('hp: 120,'), 'server Crab HP must be 120');

const crabClientStart = enemies.indexOf('function makeCrab(');
const crabClientEnd = enemies.indexOf('function updateCrabs(dt)', crabClientStart);
assert(crabClientStart >= 0 && crabClientEnd > crabClientStart, 'client Crab constructor block missing');
const crabClient = enemies.slice(crabClientStart, crabClientEnd);
assert(crabClient.includes('speed: 15,'), 'client passive Crab speed must remain 15');
assert(crabClient.includes('chaseSpeed: 42,'), 'client Crab chase speed must be 42');
assert(crabClient.includes('maxHp: 120,') && crabClient.includes('hp: 120,'), 'client Crab HP must be 120');

const contactStart = server.indexOf('function tryServerCrabContact(crab)');
const contactEnd = server.indexOf('function tickSharedCrabs(dt)', contactStart);
assert(contactStart >= 0 && contactEnd > contactStart, 'Crab contact-damage block missing');
const contact = server.slice(contactStart, contactEnd);
assert(contact.includes('9 + Math.floor(Math.random() * 5)'), 'Crab contact damage must roll 9-13');

assert(balanceText.includes('const VERSION = 28;'), 'combat balance version must be 28');
assert(balance.monsterDefaults.crab.physicalDefense === 18, 'Crab physical Defense must be 18');
assert(balance.monsterDefaults.crab.magicResist === 0, 'Crab magic Resist should remain unchanged');

const oldPhysicalMultiplier = 100 / (100 + 4);
const newPhysicalMultiplier = balance.monsterDamageMultiplier('crab', 'physical');
assert(newPhysicalMultiplier < oldPhysicalMultiplier, 'Crab physical damage reduction did not improve');
assert(Math.abs(newPhysicalMultiplier - (100 / 118)) < 1e-12, 'Crab Defense multiplier is not derived from rating 18');

assert(readme.includes('## v6-11-346 — Crab combat buff'), 'README v346 historical changelog missing');
assert(readme.includes('**58 HP to 120 HP**'), 'README Crab HP tuning missing');
assert(readme.includes('**24 to 42**'), 'README Crab chase-speed tuning missing');

console.log('Crab combat buff checks passed.');
