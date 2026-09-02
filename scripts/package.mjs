import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { packageFiles } from "./files.mjs";
await import("./validate.mjs");
await mkdir("dist", { recursive: true });
const output = "dist/chute-chrome-web-store-v3.0.0.zip"; await rm(output, { force: true });
const zip = spawnSync("zip", ["-q", output, ...packageFiles], { encoding: "utf8" });
if (zip.status) throw new Error(zip.stderr || "zip failed");
console.log(output);
