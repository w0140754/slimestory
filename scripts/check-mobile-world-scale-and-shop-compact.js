const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const html = read("public", "index.html");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert(server.includes('const BUILD_VERSION = "6-11-363";'), "server build must be v352");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-363";'), "client build must be v352");
assert(pkg.version === "0.6.11.363", "package version must be v352");
assert(html.includes('const LOGICAL_W = 224;') && html.includes('const LOGICAL_H = 126;'), "mobile logical world viewport must be 224x126");
assert(html.includes('mobileCanvas.dataset.mobileWorldScale = "1.25";'), "mobile world scale marker missing");
assert(html.includes('width: min(620px, 86vw);') && html.includes('height: min(340px, 82dvh);'), "mobile shop panel is not compact");
assert(html.includes('grid-template-columns: repeat(4, minmax(0, 1fr));'), "mobile shop should use four columns on wider landscape phones");
assert(html.includes('#shopFooter {\n      display: none;'), "mobile shop footer should be hidden");
assert(adopted.version >= 50, "live Drive map override revision 50-or-newer was not preserved");
console.log("Mobile world scale/shop compact checks passed.");
