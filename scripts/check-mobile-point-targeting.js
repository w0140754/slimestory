const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const html = read("public", "index.html");
const input = read("public", "client-input.js");
const abilities = read("public", "client-abilities.js");
const magus = read("public", "client-magus-abilities.js");
const ranger = read("public", "client-class-abilities.js");
const combat = read("public", "client-combat.js");
const app = read("public", "client-app.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));

assert(server.includes('const BUILD_VERSION = "6-11-358";'), "server build must be v355");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-358";'), "client build must be v355");
assert.strictEqual(pkg.version, "0.6.11.358", "package version must be v355");
assert(html.includes('/client-input.js?v=358') && html.includes('/client-magus-abilities.js?v=358'), "v355 cache keys missing");

assert(html.includes('id="mobileTargetHint"'), "mobile target hint missing");
assert(html.includes('body.mobile-point-targeting #mobileTargetHint'), "mobile target hint styling missing");
assert(html.includes('.ability-slot.point-target-armed'), "armed skill highlight missing");

assert(input.includes('"fireball",\n  "rainCloud",\n  "focusFire"'), "point-target skill set missing");
assert(input.includes('armMobilePointTarget("bow")'), "bow point-target arming missing");
assert(input.includes('inputController.queueCommand("mobilePointTarget", payload)'), "battlefield target command missing");
assert(input.includes('releaseFireballAim(target)') && input.includes('releaseFocusFireCharge(target)'), "direct point releases missing");
assert(input.includes('mobileAutoBowTarget = player.bowDrawing ? target : null'), "automatic bow draw target missing");
assert(combat.includes('updateMobilePointBowShot()'), "automatic full-draw bow release hook missing");
assert(app.includes('command.type === "mobilePointTarget"'), "point-target command dispatch missing");

assert(abilities.includes('function resolvePlayerPointTarget('), "shared point-range clamp missing");
assert(abilities.includes('function triggerActiveSkillForKey(key, options = {})'), "optional point-target skill dispatch missing");
assert(magus.includes('function fireballLandingPoint(pointTarget = null)'), "Fireball direct landing support missing");
assert(magus.includes('maxRange: FIREBALL_AIM_MAX_RANGE'), "Fireball range clamp missing");
assert(magus.includes('function beginRainCloudCast(pointTarget = null)'), "Rain Cloud direct placement support missing");
assert(ranger.includes('function focusFireLandingPoint(pointTarget = null)'), "Focus Fire direct landing support missing");
assert(ranger.includes('maxRange: FOCUS_FIRE_MAX_RADIUS'), "Focus Fire range clamp missing");

// Desktop keeps its original keydown/keyup lifecycle and calls releases with
// no direct point, so hold/release aiming remains untouched there.
assert(input.includes('inputController.queueCommand(\n      "releaseFocusFire"'), "desktop Focus Fire release lifecycle missing");
assert(input.includes('inputController.queueCommand(\n      "releaseFireball"'), "desktop Fireball release lifecycle missing");

console.log("mobile point-targeting checks passed");
