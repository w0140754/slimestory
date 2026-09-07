"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");

// Pin the legacy deterministic fixture for regression unless a test explicitly overrides it.
if (!Object.prototype.hasOwnProperty.call(process.env, "SLIME_STORY_WORLD_SEED")) process.env.SLIME_STORY_WORLD_SEED = "0";

function walkJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function run(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status}`);
}

const syntaxTargets = [
  path.join(root, "server.js"),
  ...walkJs(path.join(root, "public")),
  ...walkJs(path.join(root, "tools"))
].sort();
for (const file of syntaxTargets) run(["--check", file], `syntax ${path.relative(root, file)}`);

const tests = fs.readdirSync(__dirname)
  .filter(name => /^(check|smoke)-.*\.js$/.test(name))
  .sort();
for (const name of tests) run([path.join("scripts", name)], name);

console.log(`Regression suite OK: ${syntaxTargets.length} syntax targets, ${tests.length} retained checks/smokes.`);
