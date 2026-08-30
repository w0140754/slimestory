"use strict";

const fs = require("fs");
const path = require("path");
const { adoptDraftPayload } = require("../tools/map-draft-adoption.js");

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run adopt-map -- path/to/map-draft.json");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
} catch (error) {
  console.error(`Could not read draft JSON: ${error.message}`);
  process.exit(1);
}

try {
  const result = adoptDraftPayload(payload);
  const action = result.changed ? "Adopted" : "Already canonical";
  console.log(`${action}: ${result.mapId} (world content v${result.version}).`);
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  if (result.changed) console.log("Restart the Slime Story server before testing the adopted map.");
} catch (error) {
  console.error("Draft was not adopted:");
  const errors = error.validationErrors || [error.message];
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
