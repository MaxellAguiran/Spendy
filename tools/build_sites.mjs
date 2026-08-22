import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const publicFolders = ["assets"];
const publicFiles = [
  "index.html", "fit-check.html", "fit-check-thanks.html", "case-study.html", "privacy.html", "audit-terms.html", "404.html", "writing.html", "dragon-analytics.html", "firstservice.html",
  "ibex.html", "nordic-american-tankers.html", "rex.html", "tamboran.html", "styles.css",
  "robots.txt", "sitemap.xml",
  "labs/monthly-ad-report.html", "labs/marketing-allocation.html", "labs/churn-risk.html",
  "labs/data/monthly-ad-report.json", "labs/data/monthly-ad-report.csv", "labs/data/monthly-ad-report-methodology.md",
  "data/case-study-evidence.json", "data/case-study-periods.csv",
  "scripts/site.mjs", "scripts/analytics.mjs", "scripts/qualification.mjs", "scripts/ad-report.mjs", "scripts/case-study.mjs"
];

const releaseBuild = process.env.SPENDY_RELEASE_BUILD === "1";
const formId = (process.env.SPENDY_FORMSPREE_FORM_ID ?? "").trim();
const plausibleDomain = (process.env.SPENDY_PLAUSIBLE_DOMAIN ?? "").trim();

function configurationError(name, reason) {
  throw new Error(`Release build requires ${name}: ${reason}`);
}

function validateReleaseConfiguration() {
  if (!releaseBuild) return;

  if (!/^[A-Za-z0-9_-]{6,64}$/.test(formId) || formId === "REPLACE_WITH_FORM_ID") {
    configurationError("SPENDY_FORMSPREE_FORM_ID", "provide the Formspree form ID only (for example, abcdwxyz).");
  }

  if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(plausibleDomain)) {
    configurationError("SPENDY_PLAUSIBLE_DOMAIN", "provide the public site domain only (for example, spendy.example).");
  }
}

async function injectReleaseConfiguration() {
  if (!releaseBuild) return;

  const fitCheckPath = join(output, "fit-check.html");
  const fitCheck = await readFile(fitCheckPath, "utf8");
  await writeFile(
    fitCheckPath,
    fitCheck.replace("https://formspree.io/f/REPLACE_WITH_FORM_ID", `https://formspree.io/f/${formId}`),
    "utf8"
  );

  const plausibleScript = `  <script>window.plausible = window.plausible || function(){(window.plausible.q = window.plausible.q || []).push(arguments);};</script>\n  <script defer data-domain="${plausibleDomain}" src="https://plausible.io/js/script.js"></script>`;
  for (const page of ["index.html", "fit-check.html", "fit-check-thanks.html"]) {
    const pagePath = join(output, page);
    const markup = await readFile(pagePath, "utf8");
    await writeFile(pagePath, markup.replace("</head>", `${plausibleScript}\n</head>`), "utf8");
  }
}

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404 || url.pathname.includes(".")) return response;
    return env.ASSETS.fetch(new Request(new URL("/404.html", url), request));
  }
};\n`;

validateReleaseConfiguration();
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
for (const file of publicFiles) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, file), destination);
}
for (const folder of publicFolders) await cp(join(root, folder), join(output, folder), { recursive: true });
await injectReleaseConfiguration();
await writeFile(join(output, "server", "index.js"), worker, "utf8");
console.log(`Built static Spendy site for Sites hosting${releaseBuild ? " with release configuration" : ""}.`);
