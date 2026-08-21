import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const output = join(root, "dist");
const publicFolders = ["assets", "labs", "scripts"];
const publicFiles = [
  "index.html", "404.html", "writing.html", "dragon-analytics.html", "firstservice.html",
  "ibex.html", "nordic-american-tankers.html", "rex.html", "tamboran.html", "styles.css",
  "robots.txt", "sitemap.xml"
];

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404 || url.pathname.includes(".")) return response;
    return env.ASSETS.fetch(new Request(new URL("/404.html", url), request));
  }
};\n`;

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
for (const file of publicFiles) await cp(join(root, file), join(output, file));
for (const folder of publicFolders) await cp(join(root, folder), join(output, folder), { recursive: true });
await writeFile(join(output, "server", "index.js"), worker, "utf8");
console.log("Built static Spendy site for Sites hosting.");
