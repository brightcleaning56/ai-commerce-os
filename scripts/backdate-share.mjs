// Test helper — backdates a pipeline run's shareExpiresAt to force a 410.
// Usage: node scripts/backdate-share.mjs <pipelineId>
import fs from "node:fs";
import path from "node:path";

const id = process.argv[2];
if (!id) {
  console.error("Usage: node scripts/backdate-share.mjs <pipelineId>");
  process.exit(1);
}

const file = path.join(process.cwd(), "data", "pipeline-runs.json");
const runs = JSON.parse(fs.readFileSync(file, "utf-8"));
const idx = runs.findIndex((r) => r.id === id);
if (idx === -1) {
  console.error(`Run ${id} not found in ${file}`);
  process.exit(1);
}
const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
runs[idx].shareExpiresAt = yesterday;
fs.writeFileSync(file, JSON.stringify(runs, null, 2), "utf-8");
console.log(`Backdated ${id} → ${yesterday}`);
