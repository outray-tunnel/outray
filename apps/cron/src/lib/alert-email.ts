import { config } from "../config";
import emailConfig from "../../../../shared/email-sender";
import emailDesign from "../../../../shared/email-template";

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
      from: emailConfig.emailSender("OutRay Alerts"),
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
  return emailDesign.renderEmail({
    title: firing ? "An alert is firing." : "Your alert has\nrecovered.",
    preheader: `${payload.alertName} ${firing ? "needs your attention" : "has recovered"}.`,
    label: firing ? "Firing" : "Recovered",
    tone: firing ? "danger" : "success",
    bodyHtml: emailDesign.paragraph(firing
      ? `“${payload.alertName}” needs your attention. Review the latest signal in your workspace.`
      : `“${payload.alertName}” has recovered. You can review the latest signal and investigation history in your workspace.`)
      + emailDesign.details([
        ["Service", payload.service || "All services"],
        ["Current value", value],
        ["Threshold", formatValue(payload.threshold)],
      ]),
    action: { label: "View alert", url: alertUrl },
    assetBaseUrl: config.appUrl,
    footerHtml: '<p style="margin:0;">You’re receiving this email because you’re a recipient for this alert.</p>',
  });
}

function formatValue(value: number) {
  return Number(value.toFixed(Math.abs(value) >= 100 ? 1 : 3)).toLocaleString();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}
