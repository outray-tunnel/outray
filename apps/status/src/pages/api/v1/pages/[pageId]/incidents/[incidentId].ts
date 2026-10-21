import type { APIRoute } from "astro";
import { publicStatusOptions, publicStatusResponse } from "../../../../../../lib/headless";

export const GET: APIRoute = ({ params }) => publicStatusResponse(params.pageId, params.incidentId);
export const OPTIONS: APIRoute = () => publicStatusOptions();
