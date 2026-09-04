const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const html = read("public", "index.html");
const input = read("public", "client-input.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert(server.includes('const BUILD_VERSION = "6-11-373";'), "server build must be v351");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-373";'), "client build must be v351");
assert(pkg.version === "0.6.11.373", "package version must be v351");
assert(html.includes('id="mobileMenuButton"') && input.includes('handleMenuKeyDown("escape")'), "mobile MENU bridge missing");
assert(input.includes('MOBILE_COMBAT_ASSIST_MELEE_DISTANCE') && input.includes('MOBILE_BOW_VISIBLE_TARGET_DISTANCE'), "mobile combat assist ranges missing");
assert(input.includes('applyMobileCombatAssistAim()') && input.includes('requestAnimationFrame(keepMobileAttackAssistFresh)'), "held attack target refresh missing");
assert(input.includes('attackManualAim = true') && input.includes('aimAttackFromEvent(event)'), "manual ATK drag override missing");
assert(html.includes('translateX(-50%) scale(.84)') && html.includes('env(safe-area-inset-bottom) + 24px'), "mobile toolbar/joystick tuning missing");
assert(html.includes('#shopOverlay') && html.includes('height: 100dvh;') && html.includes('#inventoryOverlay .menu-hotkey-rail'), "mobile menu viewport compaction missing");
assert(html.includes('/client-input.js?v=373') && html.includes('/client-app.js?v=373'), "v351 client cache keys missing");
assert(adopted.version >= 50, "live Drive map override revision 50-or-newer was not preserved");

console.log("Mobile combat/menu refinement checks passed.");
