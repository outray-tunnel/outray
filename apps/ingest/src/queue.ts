// Shared with tunnel analytics; keep this entry point for existing consumers.
import queueModule from "../../../shared/durable-queue.js";
export const { DurableQueue } = queueModule;
export type { DurableQueueOptions } from "../../../shared/durable-queue.js";
