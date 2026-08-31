import { config } from "../config";

export interface AlertEmailPayload {
  alertId: string;
  alertName: string;
  organizationSlug?: string;
  service: string;
  signal: string;
  state: "firing" | "resolved";
  value: number | null;
  threshold: number;
  incidentStartedAt: string;
}

export async function sendAlertEmail(
  recipientEmail: string,
  payload: AlertEmailPayload,
): Promise<void> {
  if (!config.zeptoApiKey) {
    throw new Error("ZEPTO_API_KEY is not configured");
  }
  if (!isEmail(recipientEmail)) {
    throw new Error("Alert notification recipient is invalid");
  }

  const firing = payload.state === "firing";
  const subject = firing
    ? `[Firing] ${payload.alertName}`
    : `[Resolved] ${payload.alertName}`;
  const alertUrl = payload.organizationSlug
    ? `${config.appUrl}/${encodeURIComponent(payload.organizationSlug)}/observability/alerts/${encodeURIComponent(payload.alertId)}`
    : config.appUrl;
  const response = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${config.zeptoApiKey}`,
    },
    body: JSON.stringify({
      from: { address: "no-reply@outray.dev", name: "OutRay Alerts" },
      to: [
        {
          email_address: {
            address: recipientEmail,
            name: recipientEmail.split("@")[0],
          },
        },
      ],
      subject,
      htmlbody: renderEmail(payload, alertUrl),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    const error = new Error(
      `ZeptoMail delivery failed (${response.status}): ${detail}`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
}

function renderEmail(payload: AlertEmailPayload, alertUrl: string) {
  const firing = payload.state === "firing";
  const value = payload.value === null ? "No data" : formatValue(payload.value);
  const title = firing ? "An alert is firing" : "An alert has recovered";
  return `<!doctype html>
<html><body style="margin:0;background:#090909;color:#f4f4f5;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="margin:0 0 12px;color:${firing ? "#fb7185" : "#34d399"};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${firing ? "Firing" : "Resolved"}</p>
    <h1 style="margin:0 0 8px;font-size:24px">${escapeHtml(title)}</h1>
    <p style="margin:0 0 28px;color:#a1a1aa;font-size:15px">${escapeHtml(payload.alertName)}</p>
    <div style="border:1px solid #27272a;border-radius:14px;padding:20px;background:#111111">
      <p style="margin:0 0 10px;color:#71717a;font-size:12px">Service</p>
      <p style="margin:0 0 20px;font-size:15px">${escapeHtml(payload.service || "All services")}</p>
      <p style="margin:0 0 10px;color:#71717a;font-size:12px">Current value</p>
      <p style="margin:0;font-size:20px;font-weight:600">${escapeHtml(value)}</p>
    </div>
    <a href="${escapeHtml(alertUrl)}" style="display:inline-block;margin-top:24px;padding:11px 16px;border-radius:10px;background:#fff;color:#090909;text-decoration:none;font-size:13px;font-weight:600">View alert</a>
  </div>
</body></html>`;
}

function formatValue(value: number) {
  return Number(value.toFixed(Math.abs(value) >= 100 ? 1 : 3)).toLocaleString();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character,
  );
}
