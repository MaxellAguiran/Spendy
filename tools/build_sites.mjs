import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const staticOutput = join(output, "assets");
const publicFiles = [
  "index.html", "media-buying.html", "404.html", "styles.css", "robots.txt", "sitemap.xml",
];
const publicFolders = ["articles", "assets", "labs", "scripts"];

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404) return response;
    const notFoundPage = await env.ASSETS.fetch(new Request(new URL("/404.html", url), request));
    return new Response(notFoundPage.body, { status: 404, headers: notFoundPage.headers });
  }
};\n`;

const wranglerConfig = {
  main: "index.js",
  compatibility_date: "2026-08-27",
  assets: {
    directory: "../assets",
    binding: "ASSETS",
  },
};

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
await mkdir(staticOutput, { recursive: true });

for (const file of publicFiles) {
  const destination = join(staticOutput, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, file), destination);
}

for (const folder of publicFolders) await cp(join(root, folder), join(staticOutput, folder), { recursive: true });
await mkdir(join(output, ".openai"), { recursive: true });
await cp(join(root, ".openai", "hosting.json"), join(output, ".openai", "hosting.json"));
await writeFile(join(output, "server", "index.js"), worker, "utf8");
await writeFile(join(output, "server", "wrangler.json"), `${JSON.stringify(wranglerConfig, null, 2)}\n`, "utf8");

console.log("Built the Maxell Aguiran finance-writing portfolio for Sites hosting.");
