import type { APIRoute } from "astro";
import { subscribeHeadless } from "../../../../../lib/headless-subscriptions";

export const POST: APIRoute = ({ request, params, clientAddress }) => subscribeHeadless(request, params.pageId, clientAddress);
export const OPTIONS: APIRoute = ({ request, params, clientAddress }) => subscribeHeadless(request, params.pageId, clientAddress);
