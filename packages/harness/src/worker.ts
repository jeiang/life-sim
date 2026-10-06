import { parentPort, workerData } from "node:worker_threads";
import { compilePacks, formatDiagnostic } from "@life/pack-tools";
import { runLives } from "./harness.ts";
import type { Job, WorkerIn, WorkerOut } from "./parallel.ts";

/** A worker thread of `runHarnessParallel`: compiles the Packs once, then plays batches of lives. */
const port = parentPort;
if (!port) throw new Error("worker.ts must run as a worker thread");
const send = (m: WorkerOut): void => port.postMessage(m);

const compiled = compilePacks((workerData as { packsDir: string }).packsDir);
if (!compiled.ok) {
  send({
    t: "error",
    message: compiled.diagnostics.map(formatDiagnostic).join("\n"),
  });
} else {
  const bundles = compiled.bundles;
  port.on("message", (m: WorkerIn) => {
    const job: Job = m.job;
    send({
      t: "done",
      from: job.from,
      results: runLives(bundles, job, job.from, job.to),
    });
  });
  send({ t: "ready" });
}
