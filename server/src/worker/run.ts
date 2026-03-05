import "dotenv/config";
import { getJobQueue } from "../jobs/queue.js";
import { getFaceProvider } from "../faces/index.js";
import { processImageJob } from "./processImage.js";
import { runIndexFacesJob } from "./indexFaces.js";
import { logger } from "../logger.js";

const POLL_BACKOFF_MS = 2000;

export async function runWorker(): Promise<void> {
  const queue = getJobQueue();
  const faceProvider = getFaceProvider();
  logger.info("Worker started", { queueType: process.env.SQS_QUEUE_URL ? "SQS" : "in-memory" });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let job;
    try {
      job = await queue.poll();
    } catch (pollErr) {
      logger.error("Queue poll error", { error: String(pollErr) });
      await new Promise((r) => setTimeout(r, POLL_BACKOFF_MS));
      continue;
    }

    if (!job) {
      if (!process.env.SQS_QUEUE_URL) {
        await new Promise((r) => setTimeout(r, POLL_BACKOFF_MS));
      }
      continue;
    }

    const { id, payload } = job;
    logger.info("Processing job", { jobId: id, type: payload.type });

    try {
      if (payload.type === "process_image") {
        await processImageJob(payload);
      } else if (payload.type === "index_faces") {
        await runIndexFacesJob(payload, faceProvider);
      }
      await queue.ack(id);
      logger.info("Job completed", { jobId: id, type: payload.type });
    } catch (err) {
      // Do NOT ack — let SQS retry (visibility timeout will expire) or DLQ after maxReceiveCount.
      // For in-memory queue the job is already lost; acceptable for dev.
      logger.error("Job failed", { jobId: id, type: payload.type, error: String(err), stack: (err as Error).stack });
    }
  }
}

// Allow direct execution: node dist/src/worker/run.js
runWorker().catch((err) => {
  logger.error("Worker crashed", { error: String(err) });
  process.exit(1);
});
