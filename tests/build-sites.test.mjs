import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tools/build_sites.mjs"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}

test("builds a complete static package from a checkout path with spaces and Unicode punctuation", async () => {
  const result = await runBuild();
  assert.equal(result.code, 0, result.output);
  await access(join(root, "dist", "index.html"));
  await access(join(root, "dist", "case-study.html"));
  await access(join(root, "dist", "data", "case-study-evidence.json"));
});
