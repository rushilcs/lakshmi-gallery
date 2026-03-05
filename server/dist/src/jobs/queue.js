import { randomUUID } from "node:crypto";
import { SqsJobQueue } from "./SqsJobQueue.js";
// ── In-memory implementation (local dev) ──
const inMemoryStore = [];
export const inMemoryQueue = {
    async enqueue(payload) {
        const id = randomUUID();
        inMemoryStore.push({ id, payload, createdAt: Date.now() });
        return id;
    },
    async poll() {
        return inMemoryStore.shift() ?? null;
    },
    async ack() { },
};
// ── Factory ──
let defaultQueue = null;
export function setJobQueue(queue) {
    defaultQueue = queue;
}
export function getJobQueue() {
    if (defaultQueue)
        return defaultQueue;
    const sqsUrl = process.env.SQS_QUEUE_URL;
    const useSqs = sqsUrl &&
        (process.env.NODE_ENV === "production" || process.env.FORCE_SQS === "true");
    if (useSqs) {
        defaultQueue = new SqsJobQueue({
            queueUrl: sqsUrl,
            isFifo: process.env.SQS_IS_FIFO === "true",
            messageGroupId: process.env.SQS_MESSAGE_GROUP_ID,
            waitTimeSeconds: Number(process.env.SQS_WAIT_TIME_SECONDS || 20),
            maxMessages: Number(process.env.SQS_MAX_MESSAGES || 1),
            visibilityTimeoutSeconds: Number(process.env.SQS_VISIBILITY_TIMEOUT_SECONDS || 600),
        });
    }
    else {
        defaultQueue = inMemoryQueue;
    }
    return defaultQueue;
}
