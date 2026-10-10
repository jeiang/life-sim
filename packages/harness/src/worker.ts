import { parentPort, workerData } from "node:worker_threads";
import { compilePacks, formatDiagnostic } from "@life/pack-tools";
import { runLives } from "./harness.ts";
import { loadMetrics } from "./metrics.ts";
import type { Job, WorkerIn, WorkerOut } from "./parallel.ts";
import { loadProfiles } from "./profile-spec.ts";

/** A worker thread of `runHarnessParallel`: compiles the Packs once, then plays batches of lives. */
const port = parentPort;
if (!port) throw new Error("worker.ts must run as a worker thread");
const send = (m: WorkerOut): void => port.postMessage(m);

const { packsDir, only } = workerData as {
  packsDir: string;
  only?: readonly string[];
};
const compiled = compilePacks(packsDir, only ? { only } : {});
const loaded = compiled.ok ? loadMetrics(packsDir, compiled.bundles) : null;
const profiles = compiled.ok ? loadProfiles(packsDir, compiled.bundles) : null;
if (
  !compiled.ok ||
  !loaded ||
  !profiles ||
  loaded.diagnostics.length + profiles.diagnostics.length > 0
) {
  send({
    t: "error",
    message: [
      ...(compiled.ok ? [] : compiled.diagnostics),
      ...(loaded?.diagnostics ?? []),
      ...(profiles?.diagnostics ?? []),
    ]
      .map(formatDiagnostic)
      .join("\n"),
  });
} else {
  const bundles = compiled.bundles;
  const metrics = loaded.metrics;
  const profileSpecs = profiles.profiles;
  port.on("message", (m: WorkerIn) => {
    const job: Job = m.job;
    send({
      t: "done",
      from: job.from,
      results: runLives(
        bundles,
        { ...job, metrics, profileSpecs },
        job.from,
        job.to,
      ),
    });
  });
  send({ t: "ready" });
}
