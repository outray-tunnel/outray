/** Shared presentation only. Delivery, consent and billing policy stay with each sender. */
export type EmailTone = "neutral" | "accent" | "danger" | "success";

export interface EmailTemplateOptions {
  title: string;
  preheader?: string;
  label?: string;
  tone?: EmailTone;
  /** Compose with the escaped helpers below, or an existing sanitized rich-text renderer. */
  bodyHtml: string;
  action?: { label: string; url: string };
  meta?: string;
  footerHtml?: string;
  assetBaseUrl?: string | URL;
  logoPath?: string;
  attribution?: string;
}

const font = "'Geom', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const tones = {
  neutral: { background: "#1b1b1f", border: "#34343b", color: "#c3c3ca" },
  accent: { background: "#1b1724", border: "#352b46", color: "#c2adee" },
  danger: { background: "#25171c", border: "#492932", color: "#f6a6b7" },
  success: { background: "#12231e", border: "#274237", color: "#83d8b5" },
} as const;

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function httpUrl(value: string | URL): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Email links and assets must use public HTTP(S) URLs without credentials");
  }
  return url;
}

function assetOrigin(value?: string | URL): URL {
  const env = typeof process === "undefined" ? {} : process.env;
  return httpUrl(value || env.CONSOLE_PUBLIC_URL || env.OUTRAY_DASHBOARD_URL || env.APP_URL || env.BETTER_AUTH_URL || "https://outray.co");
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:#aaaab3;font-family:${font};font-size:16px;line-height:1.75;font-weight:400;overflow-wrap:anywhere;">${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
}

export function footnote(text: string): string {
  return `<p style="margin:0 0 13px;color:#85858f;font-family:${font};font-size:13px;line-height:1.75;overflow-wrap:anywhere;">${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
}

export function link(label: string, url: string): string {
  return `<a href="${escapeHtml(httpUrl(url).toString())}" target="_blank" rel="noopener noreferrer" style="color:#c2adee;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere;">${escapeHtml(label)}</a>`;
}

export function details(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0;background:#17171a;border:1px solid #2b2b30;border-radius:11px;table-layout:fixed;"><tr><td style="padding:7px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;">${rows.map(([label, value]) => `<tr><td width="38%" style="width:38%;padding:10px 14px 10px 0;vertical-align:top;color:#85858f;font-family:${font};font-size:12px;line-height:21px;overflow-wrap:anywhere;">${escapeHtml(label)}</td><td style="padding:10px 0;vertical-align:top;color:#e6e6ec;font-family:${font};font-size:14px;line-height:21px;font-weight:500;overflow-wrap:anywhere;">${escapeHtml(value)}</td></tr>`).join("")}</table></td></tr></table>`;
}

export function list(items: string[]): string {
  return `<ul style="margin:16px 0;padding:0 0 0 20px;color:#aaaab3;font-family:${font};font-size:15px;line-height:1.8;">${items.map((item) => `<li style="padding-left:3px;margin:5px 0;">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function renderEmail(options: EmailTemplateOptions): string {
  const base = assetOrigin(options.assetBaseUrl);
  const logoUrl = escapeHtml(new URL(options.logoPath || "/logo.png", base).toString());
  const fontUrl = escapeHtml(new URL("/fonts/geom-latin.woff2", base).toString());
  const tone = tones[options.tone || "accent"];
  const title = escapeHtml(options.title).replace(/\n/g, "<br />");
  const action = options.action ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-top:30px;"><tr><td align="center" bgcolor="#f7f7f8" style="background:#f7f7f8;border-radius:10px;mso-padding-alt:14px 20px;"><a class="confirm" href="${escapeHtml(httpUrl(options.action.url).toString())}" style="display:block;padding:14px 20px;background:#f7f7f8;border:1px solid #f7f7f8;border-radius:10px;color:#101012;font-family:${font};font-size:15px;line-height:20px;font-weight:600;letter-spacing:-0.15px;text-align:center;text-decoration:none;">${escapeHtml(options.action.label)}&nbsp;&nbsp; <span aria-hidden="true">&rarr;</span></a></td></tr></table>` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(options.title.replace(/\n/g, " "))} · OutRay</title>
  <style>
    @font-face { font-family:'Geom';src:url('${fontUrl}') format('woff2');font-style:normal;font-weight:300 900;font-display:swap; }
    html,body { margin:0;padding:0;background:#080808; }
    body,table,td,a,h1,p { font-family:${font}; }
    body { -webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%; }
    table { border-collapse:separate;border-spacing:0; }
    a { text-decoration:none; }
    .confirm:hover { background:#dedee2 !important; }
    a:focus-visible { outline:2px solid #a78bfa;outline-offset:5px; }
    .email-body > :last-child { margin-bottom:0 !important; }
    .rich-content { color:#aaaab3;font-size:15px;line-height:1.75;overflow-wrap:anywhere; }
    .rich-content p { margin:0 0 16px; }
    .rich-content h2,.rich-content h3 { color:#e6e6ec;font-size:17px;line-height:1.5;margin:22px 0 10px; }
    .rich-content a { color:#c2adee;text-decoration:underline; }
    .rich-content code { color:#ddd3ed;background:#1d1924;padding:2px 5px;border-radius:4px;font-size:13px; }
    .rich-content pre { padding:16px;background:#18181c;white-space:pre-wrap;overflow-wrap:anywhere; }
    .rich-content blockquote { margin:18px 0;padding-left:16px;border-left:2px solid #514164; }
    @media(max-width:600px) { .page{padding:36px 20px 40px !important}.brand{padding:0 4px 28px !important}.content{padding:32px 28px 30px !important}.heading{font-size:32px !important}.footer{padding:26px 8px 0 !important} }
  </style>
  <!--[if mso]><style>body,table,td,a,h1,p{font-family:Arial,sans-serif !important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#080808;color:#f7f7f8;font-family:${font};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(options.preheader || options.title.replace(/\n/g, " "))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#080808" style="width:100%;background:#080808;"><tr><td class="page" align="center" style="padding:64px 24px 56px;font-family:${font};">
    <!--[if mso]><table role="presentation" width="544" align="center"><tr><td><![endif]-->
    <table role="presentation" width="544" cellpadding="0" cellspacing="0" style="width:100%;max-width:544px;">
      <tr><td class="brand" style="padding:0 4px 32px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="32" style="width:32px;vertical-align:middle;"><img src="${logoUrl}" width="31" height="31" alt="" style="display:block;width:31px;height:31px;border:0;" /></td><td style="padding-left:10px;vertical-align:middle;font-family:${font};font-size:23px;line-height:32px;font-weight:700;letter-spacing:-0.9px;color:#f7f7f8;">OutRay</td></tr></table></td></tr>
      <tr><td bgcolor="#101012" style="background:#101012;border:1px solid #29292d;border-radius:20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;"><tr><td class="content" style="padding:40px 40px 36px;font-family:${font};">
        ${options.label ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:29px;"><tr><td style="padding:7px 11px;background:${tone.background};border:1px solid ${tone.border};border-radius:7px;color:${tone.color};font-family:${font};font-size:12px;line-height:16px;font-weight:550;overflow-wrap:anywhere;">${escapeHtml(options.label)}</td></tr></table>` : ""}
        <h1 class="heading" style="margin:0;color:#f7f7f8;font-family:${font};font-size:36px;line-height:1.18;letter-spacing:-1.4px;font-weight:600;overflow-wrap:anywhere;">${title}</h1>
        <div class="email-body" style="margin-top:21px;color:#aaaab3;font-family:${font};font-size:16px;line-height:1.75;overflow-wrap:anywhere;">${options.bodyHtml}</div>
        ${action}
        ${options.meta ? `<p style="margin:15px 0 0;text-align:${options.action ? "center" : "left"};color:#85858f;font-family:${font};font-size:12px;line-height:20px;">${escapeHtml(options.meta)}</p>` : ""}
      </td></tr></table></td></tr>
      <tr><td class="footer" style="padding:27px 16px 0;color:#85858f;font-family:${font};font-size:13px;line-height:1.75;">
        ${options.footerHtml || ""}
        <p style="margin:${options.footerHtml ? "22px" : "0"} 0 0;color:#7d7d87;font-family:${font};font-size:12px;line-height:20px;">${escapeHtml(options.attribution || "Delivered by")} <a href="https://outray.co" target="_blank" rel="noopener noreferrer" style="color:#aaaab3;text-decoration:underline;text-underline-offset:3px;">OutRay</a>.</p>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table>
</body>
</html>`;
}

export default { renderEmail, paragraph, footnote, details, list, link, escapeHtml };
