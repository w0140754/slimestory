"use strict";

const RUNTIME_WORLD_CONTENT_PATH = "/shared/world-content-runtime.js";

function browserRuntimeWorldContentSource(worldContent) {
  const json = JSON.stringify(worldContent, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\n");

  return `(function (root) {\n  "use strict";\n  const content = ${json};\n  if (root) root.WORLD_CONTENT = Object.freeze(content);\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
}

function runtimeWorldContentUrl(buildVersion, worldContentVersion) {
  const build = encodeURIComponent(String(buildVersion || "unknown"));
  const world = encodeURIComponent(String(worldContentVersion ?? "unknown"));
  return `${RUNTIME_WORLD_CONTENT_PATH}?build=${build}&world=${world}`;
}

function injectRuntimeWorldContentUrl(htmlSource, buildVersion, worldContentVersion) {
  const source = String(htmlSource || "");
  const runtimeUrl = runtimeWorldContentUrl(buildVersion, worldContentVersion);
  return source.replace(
    /\/shared\/world-content-runtime\.js(?:\?[^"']*)?/g,
    runtimeUrl
  );
}

module.exports = {
  RUNTIME_WORLD_CONTENT_PATH,
  browserRuntimeWorldContentSource,
  runtimeWorldContentUrl,
  injectRuntimeWorldContentUrl
};
