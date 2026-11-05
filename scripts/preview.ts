// Serves the built site (dist/) with the extractor output at /data, like production where
// the amendment JSON comes from R2.
//
//   node scripts/preview.ts [--port 4321]

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { port: { type: "string", default: "4321" } } });
const dist = resolve("dist");
const data = resolve(process.env.JUSTITIA_DATA ?? "data");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = normalize(decodeURIComponent(url.pathname));
  const [root, rel] = path.startsWith("/data/") ? [data, path.slice(6)] : [dist, path];
  let file = join(root, rel);
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    statSync(file);
  } catch {
    return void res.writeHead(404).end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(Number(values.port), () => console.log(`http://localhost:${values.port}/`));
