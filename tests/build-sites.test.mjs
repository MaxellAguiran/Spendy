import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function runBuild(environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tools/build_sites.mjs"], {
      cwd: root,
      env: { ...process.env, ...environment },
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
  await access(join(root, "dist", "fit-check.html"));
  await access(join(root, "dist", "fit-check-thanks.html"));
  await access(join(root, "dist", "case-study.html"));
  await access(join(root, "dist", "data", "case-study-evidence.json"));
  await access(join(root, "dist", "scripts", "analytics.mjs"));
});

test("release builds reject missing production form and analytics configuration", async () => {
  const result = await runBuild({ SPENDY_RELEASE_BUILD: "1", SPENDY_FORMSPREE_FORM_ID: "", SPENDY_PLAUSIBLE_DOMAIN: "" });

  assert.notEqual(result.code, 0);
  assert.match(result.output, /SPENDY_FORMSPREE_FORM_ID/);
});

test("release builds inject only validated form and analytics configuration", async () => {
  const result = await runBuild({
    SPENDY_RELEASE_BUILD: "1",
    SPENDY_FORMSPREE_FORM_ID: "abcdwxyz",
    SPENDY_PLAUSIBLE_DOMAIN: "spendy.example",
  });

  assert.equal(result.code, 0, result.output);
  const fitCheck = await readFile(join(root, "dist", "fit-check.html"), "utf8");
  const home = await readFile(join(root, "dist", "index.html"), "utf8");
  assert.match(fitCheck, /action="https:\/\/formspree\.io\/f\/abcdwxyz"/);
  assert.doesNotMatch(fitCheck, /REPLACE_WITH_FORM_ID/);
  assert.match(home, /data-domain="spendy\.example"/);
  assert.match(home, /https:\/\/plausible\.io\/js\/script\.js/);
  assert.match(home, /window\.plausible = window\.plausible/);
});
