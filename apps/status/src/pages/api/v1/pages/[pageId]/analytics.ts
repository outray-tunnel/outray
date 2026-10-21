import type { APIRoute } from "astro";
import { collectHeadlessAnalytics } from "../../../../../lib/headless-analytics";

export const POST: APIRoute = ({ request, params, clientAddress }) => collectHeadlessAnalytics(request, params.pageId, clientAddress);
export const OPTIONS: APIRoute = ({ request, params, clientAddress }) => collectHeadlessAnalytics(request, params.pageId, clientAddress);
