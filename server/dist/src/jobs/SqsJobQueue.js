import { randomUUID } from "node:crypto";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient, } from "@aws-sdk/client-sqs";
import { z } from "zod";
import { logger } from "../logger.js";
const jobPayloadSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("process_image"), imageId: z.string(), galleryId: z.string() }),
    z.object({ type: z.literal("index_faces"), galleryId: z.string(), imageIds: z.array(z.string()) }),
]);
const messageBodySchema = z.object({
    id: z.string(),
    type: z.string(),
    payload: jobPayloadSchema,
    createdAt: z.number(),
});
/** Map from job.id to SQS receipt handle so ack() can delete the message. */
const receiptHandles = new Map();
export class SqsJobQueue {
    client;
    queueUrl;
    waitTimeSeconds;
    maxMessages;
    isFifo;
    messageGroupId;
    visibilityTimeout;
    constructor(cfg) {
        this.client = new SQSClient({ region: cfg.region ?? process.env.AWS_REGION ?? "us-east-1" });
        this.queueUrl = cfg.queueUrl;
        this.waitTimeSeconds = cfg.waitTimeSeconds ?? 20;
        this.maxMessages = cfg.maxMessages ?? 1;
        this.isFifo = cfg.isFifo ?? cfg.queueUrl.endsWith(".fifo");
        this.messageGroupId = cfg.messageGroupId ?? "default";
        this.visibilityTimeout = cfg.visibilityTimeoutSeconds ?? 600;
    }
    async enqueue(payload) {
        const id = randomUUID();
        const body = JSON.stringify({ id, type: payload.type, payload, createdAt: Date.now() });
        const params = {
            QueueUrl: this.queueUrl,
            MessageBody: body,
            MessageAttributes: {
                jobType: { DataType: "String", StringValue: payload.type },
            },
        };
        if (this.isFifo) {
            params.MessageGroupId = this.messageGroupId;
            params.MessageDeduplicationId = id;
        }
        await this.client.send(new SendMessageCommand(params));
        logger.info("SQS enqueued job", { id, type: payload.type });
        return id;
    }
    async poll() {
        const resp = await this.client.send(new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: this.maxMessages,
            WaitTimeSeconds: this.waitTimeSeconds,
            VisibilityTimeout: this.visibilityTimeout,
            MessageAttributeNames: ["All"],
        }));
        const msg = resp.Messages?.[0];
        if (!msg?.Body || !msg.ReceiptHandle)
            return null;
        let parsed;
        try {
            parsed = messageBodySchema.parse(JSON.parse(msg.Body));
        }
        catch (err) {
            logger.error("SQS message parse failed; deleting poison message", {
                messageId: msg.MessageId,
                error: String(err),
            });
            await this.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: msg.ReceiptHandle }));
            return null;
        }
        receiptHandles.set(parsed.id, msg.ReceiptHandle);
        return { id: parsed.id, payload: parsed.payload, createdAt: parsed.createdAt };
    }
    async ack(jobId) {
        const handle = receiptHandles.get(jobId);
        if (!handle) {
            logger.warn("SQS ack: no receipt handle for job", { jobId });
            return;
        }
        await this.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: handle }));
        receiptHandles.delete(jobId);
        logger.info("SQS acked job", { jobId });
    }
}
