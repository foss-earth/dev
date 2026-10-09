import assert from "node:assert/strict";
await assert.rejects(import("../outside.mjs"), /Runtime escaped/);
await assert.rejects(import("@foss-earth/forbidden-owner-fixture"), /Runtime escaped/);
process.stdout.write("Runtime isolation rejected ancestor file and package negative controls.\n");
