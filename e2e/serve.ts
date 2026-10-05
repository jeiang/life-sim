// Tiny static server for the e2e stub page (no deps; Node strips types natively).
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "stub");
const port = Number(process.env.E2E_PORT ?? 4173);

createServer(async (req, res) => {
  const name = req.url === "/" || req.url === undefined ? "index.html" : "404";
  try {
    const body = await readFile(join(root, name));
    res
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1");
