/// <reference types="astro/client" />
import type { StatusWorkerEnv } from "./lib/runtime";

declare global {
  namespace App {
    interface Locals {
      runtime?: {
        env: StatusWorkerEnv;
        ctx: { waitUntil(promise: Promise<unknown>): void };
      };
    }
  }
}
