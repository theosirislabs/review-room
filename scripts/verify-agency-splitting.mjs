import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "assets");
const assets = readdirSync(assetsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({ file, bytes: statSync(join(assetsDir, file)).size }));

const internal = assets.find(({ file }) => file.startsWith("InternalView-"));
if (!internal) throw new Error("Expected an InternalView build chunk");
if (internal.bytes >= 500_000) {
  throw new Error(`InternalView remains too large: ${internal.bytes} bytes`);
}

for (const prefix of ["AnalyticsView-", "PostFormModal-", "CampaignManagerModal-", "BatchUploadModal-"]) {
  if (!assets.some(({ file }) => file.startsWith(prefix))) {
    throw new Error(`Expected a lazy ${prefix.slice(0, -1)} chunk`);
  }
}

console.log(`agency_bundle_gate=ok internal_bytes=${internal.bytes}`);
