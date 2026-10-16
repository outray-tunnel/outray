import emailDesign from "../../../../shared/email-template";

interface ConfirmationEmailOptions {
  pageName: string;
  confirmationUrl: URL;
  publicUrl: URL;
  expiresInHours: number;
}

export function renderSubscriptionConfirmationEmail(options: ConfirmationEmailOptions): string {
  return emailDesign.renderEmail({
    title: "Confirm your\nsubscription.",
    preheader: `Confirm your email to receive incident updates from ${options.pageName}.`,
    label: options.pageName,
    bodyHtml: emailDesign.paragraph(`One last step. Confirm your email to receive incident updates published by ${options.pageName}.`),
    action: { label: "Confirm subscription", url: options.confirmationUrl.toString() },
    meta: `This link expires in ${options.expiresInHours} hours.`,
    footerHtml: '<p style="margin:0;color:#85858f;font-size:13px;line-height:1.75;">Didn’t request this? You can ignore this email.<br />You won’t be subscribed unless you confirm.</p>',
    assetBaseUrl: options.publicUrl,
    logoPath: "/outray-mark.png",
    attribution: "Status updates, delivered by",
  });
}
