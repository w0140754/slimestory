const fs = require("fs");
const source = fs.readFileSync("server.js", "utf8");
const required = [
  "const TREE_STUMP_VISIBLE_MS = 5000;",
  "const TREE_RESEED_MIN_MS = 1_200_000;",
  "const TREE_RESEED_MAX_MS = 2_400_000;",
  "const FLOWER_REGROW_MIN_MS = 600_000;",
  "const FLOWER_REGROW_MAX_MS = 900_000;",
  "const ROCK_REGROW_MIN_MS = 720_000;",
  "const ROCK_REGROW_MAX_MS = 1_080_000;",
  "scheduleFlowerRegrow(entity);",
  "scheduleTreeReseed(entity);",
  "resetTreeToFresh(entity)",
  "resetFlowerToFresh(entity)",
  "livingPlayerNearEnvironmentHome(entity)"
];
for (const needle of required) {
  if (!source.includes(needle)) {
    throw new Error(`Missing resource-regrow contract: ${needle}`);
  }
}
for (const retired of [
  "GRASS_REGROW_MIN_MS",
  "GRASS_REGROW_MAX_MS",
  "scheduleGrassRegrow",
  "resetGrassToFresh"
]) {
  if (source.includes(retired)) {
    throw new Error(`Tall grass must stay permanently cleared: ${retired}`);
  }
}
console.log("resource regrow tuning checks passed (trees/flowers/rocks retained; normal tall grass is permanent-clear)");
