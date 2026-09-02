const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const html = read("public", "index.html");
const input = read("public", "client-input.js");
const app = read("public", "client-app.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));

assert(server.includes('const BUILD_VERSION = "6-11-352";'), "server build must be v350");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-352";'), "client build must be v350");
assert(pkg.version === "0.6.11.352", "package version must be v350");
assert(html.includes('id="mobileMovePad"') && html.includes('id="mobileAttackButton"'), "mobile movement/attack controls missing");
assert(html.includes('id="mobileInteractButton"') && html.includes('id="mobileRotatePrompt"'), "mobile interact/orientation UI missing");
assert(html.includes('(hover: none) and (pointer: coarse) and (orientation: landscape)'), "coarse-pointer landscape gate missing");
assert(html.includes('viewport-fit=cover') && html.includes('env(safe-area-inset-right)'), "mobile safe-area support missing");
assert(html.includes('/client-input.js?v=352') && html.includes('/client-app.js?v=352'), "v350 cache keys missing");
assert(input.includes('setMobileMovement(dx, dy)') && input.includes('installMobileControls()'), "mobile input bridge missing");
assert(input.includes('handlePrimaryAttack(mobilePointerEventForCanvas') && input.includes('releaseFireball'), "mobile attack/skill lifecycle missing");
assert(app.includes('mobileInteractButton.classList.toggle("available"'), "contextual ACT state missing");

console.log("Mobile controls prototype checks passed.");
