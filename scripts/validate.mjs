import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";
import { packageFiles } from "./files.mjs";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (manifest.manifest_version !== 3 || manifest.name !== "Chute") throw new Error("Store manifest must describe Chute on Manifest V3.");
if (JSON.stringify(manifest).match(/(?:127\.0\.0\.1|localhost|nativeMessaging|<all_urls>|https?:\/\/\*\/\*)/i)) throw new Error("Forbidden loopback, native messaging, or broad host permission in manifest.");
if (manifest.host_permissions?.length || manifest.optional_host_permissions?.length) throw new Error("Chute Store must not request host permissions.");
if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage", "sidePanel"])) throw new Error("Unexpected extension permission.");
const forbiddenNames = /(?:^|\/)(?:desktop|native|server|daemon)(?:\/|$)|\.(?:py|cpp|exe|ps1|sh)$/i;

// Store archives are reproducible outputs, not source. Keep this check in the
// normal test command so a forced `git add` cannot silently reintroduce a
// binary patch despite the matching .gitignore rule.
const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (tracked.status) throw new Error(tracked.stderr || "Could not inspect tracked source files.");
const trackedBuildArtifacts = tracked.stdout
  .split("\0")
  .filter((file) => /(?:^|\/)dist\/.*\.(?:zip|crx)$/i.test(file));
if (trackedBuildArtifacts.length) {
  throw new Error(`Generated Store artifact is tracked: ${trackedBuildArtifacts.join(", ")}`);
}

for (const file of packageFiles) {
  if (forbiddenNames.test(file)) throw new Error(`Legacy runtime file in package list: ${file}`);
  const contents = await readFile(file);
  if (contents.toString("utf8").match(/(?:127\.0\.0\.1|localhost|nativeMessaging)/i)) throw new Error(`Forbidden legacy architecture reference in packaged file: ${file}`);
  if (extname(file) === ".js") { const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" }); if (check.status) throw new Error(check.stderr || `Syntax check failed: ${file}`); }
}
console.log(`Validated ${packageFiles.length} package files and ${packageFiles.filter((file) => file.endsWith(".js")).length} JavaScript files.`);
