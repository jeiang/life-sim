// Tiny static server for the built web app (no deps; Node strips types natively).
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");
const port = Number(process.env.E2E_PORT ?? 4173);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  const rel = normalize(path === "/" ? "index.html" : path).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  try {
    const body = await readFile(join(root, rel));
    res
      .writeHead(200, {
        "content-type": TYPES[extname(rel)] ?? "application/octet-stream",
      })
      .end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1");
