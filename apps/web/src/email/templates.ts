import emailDesign from "../../../../shared/email-template";

const { renderEmail, paragraph, footnote, details, list, link } = emailDesign;

// Email template parameter types
type WelcomeParams = {
  name: string;
  dashboardUrl: string;
};

type PasswordResetParams = {
  name: string;
  resetUrl: string;
};

type OrganizationInviteParams = {
  inviterName: string;
  organizationName: string;
  role: string;
  invitationLink: string;
};

type PaymentFailedParams = {
  name: string;
  planName: string;
  amount: string;
  billingUrl: string;
  attemptsRemaining: number;
};

type SubscriptionResetParams = {
  name: string;
  organizationName: string;
  previousPlan: string;
  dashboardUrl: string;
};

// Map template keys to their parameter types
type TemplateParamsMap = {
  welcome: WelcomeParams;
  "password-reset": PasswordResetParams;
  "organization-invite": OrganizationInviteParams;
  "payment-failed": PaymentFailedParams;
  "subscription-reset": SubscriptionResetParams;
};

export type EmailTemplateKey = keyof TemplateParamsMap;

type EmailTemplate<K extends EmailTemplateKey> = {
  name: string;
  subject: string | ((params: TemplateParamsMap[K]) => string);
  params: (keyof TemplateParamsMap[K])[];
  html: (params: TemplateParamsMap[K]) => string;
  previewParams: TemplateParamsMap[K];
};

type EmailTemplates = {
  [K in EmailTemplateKey]: EmailTemplate<K>;
};

export const emailTemplates: EmailTemplates = {
  welcome: {
    name: "Welcome Email",
    subject: "Welcome to Outray!",
    params: ["name", "dashboardUrl"],
    previewParams: {
      name: "John Doe",
      dashboardUrl: "https://outray.co/select",
    },
    html: ({ name, dashboardUrl }) =>
      renderEmail({
        title: "Welcome to\nOutRay.",
        preheader: "Welcome to OutRay. Let's build something great.",
        label: "Getting started",
        tone: "accent",
        bodyHtml:
          paragraph(`Hi ${name},`) +
          paragraph("I'm Akinkunmi, the creator of OutRay. I'm happy to have you onboard!") +
          paragraph("Explore OutRay's tools for development, monitoring, and collaboration, and choose where you'd like to start."),
        action: { label: "Go to Dashboard", url: dashboardUrl },
        footerHtml:
          footnote("If you have any questions or feedback, just reply to this email – I personally read every one.") +
          footnote("Cheers,\nAkinkunmi"),
      }),
  },

  "password-reset": {
    name: "Password Reset",
    subject: "Reset Your Password",
    params: ["name", "resetUrl"],
    previewParams: {
      name: "John Doe",
      resetUrl: "https://outray.co/reset-password?token=abc123",
    },
    html: ({ name, resetUrl }) =>
      renderEmail({
        title: "Reset your\npassword.",
        preheader: "Create a new password for your OutRay account. This link expires in 1 hour.",
        label: "Account security",
        bodyHtml:
          paragraph(`Hi ${name},`) +
          paragraph("We received a request to reset your password. Use the button below to create a new password.") +
          paragraph("This link will expire in 1 hour. If you didn't request this, you can safely ignore this email."),
        action: { label: "Reset Password", url: resetUrl },
        footerHtml:
          footnote("Or copy and paste this link into your browser:") +
          link(resetUrl, resetUrl),
      }),
  },

  "organization-invite": {
    name: "Organization Invite",
    subject: ({ organizationName }) =>
      `You're invited to join ${organizationName} on OutRay`,
    params: ["inviterName", "organizationName", "role", "invitationLink"],
    previewParams: {
      inviterName: "Jane Smith",
      organizationName: "Acme Corp",
      role: "member",
      invitationLink: "https://outray.co/invitations/accept?token=abc123",
    },
    html: ({ inviterName, organizationName, role, invitationLink }) =>
      renderEmail({
        title: "You're invited\nto collaborate.",
        preheader: `${inviterName} invited you to join ${organizationName} on OutRay.`,
        label: "Organization invitation",
        tone: "accent",
        bodyHtml:
          paragraph(`${inviterName} has invited you to join their organization on OutRay.`) +
          details([
            ["Organization", organizationName],
            ["Your role", role],
          ]) +
          paragraph("Accept the invitation to join your team and get started."),
        action: { label: "Accept Invitation", url: invitationLink },
        footerHtml:
          footnote("If you did not expect this invitation, you can safely ignore this email.") +
          footnote("Or copy and paste this link into your browser:") +
          link(invitationLink, invitationLink),
      }),
  },

  "payment-failed": {
    name: "Payment Failed",
    subject: "Action Required: Your OutRay payment failed",
    params: ["name", "planName", "amount", "billingUrl", "attemptsRemaining"],
    previewParams: {
      name: "John Doe",
      planName: "Beam",
      amount: "₦21,000",
      billingUrl: "https://outray.co/acme/billing",
      attemptsRemaining: 2,
    },
    html: ({ name, planName, amount, billingUrl, attemptsRemaining }) =>
      renderEmail({
        title: "Your payment\ndidn't go through.",
        preheader: "We couldn't process your OutRay payment. Review your payment method.",
        label: "Payment failed",
        tone: "danger",
        bodyHtml:
          paragraph(`Hi ${name},`) +
          paragraph("We couldn't process your payment for your OutRay subscription.") +
          details([
            ["Plan", planName],
            ["Amount", amount],
          ]) +
          paragraph(
            attemptsRemaining > 0
              ? `We'll retry your payment automatically. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining before your subscription is cancelled.`
              : "This was our final attempt. Your subscription has been cancelled and downgraded to the free plan.",
          ) +
          paragraph("Visit your billing page to update your payment method."),
        action: { label: "Update Payment Method", url: billingUrl },
        footerHtml:
          footnote("Common reasons for payment failures include insufficient funds, an expired card, or a card declined by your bank.") +
          footnote("If you have any questions, just reply to this email."),
      }),
  },

  "subscription-reset": {
    name: "Subscription Reset",
    subject: ({ organizationName }) => `Your ${organizationName} subscription has been reset`,
    params: ["name", "organizationName", "previousPlan", "dashboardUrl"],
    previewParams: {
      name: "John Doe",
      organizationName: "Acme Inc",
      previousPlan: "Ray",
      dashboardUrl: "https://outray.co/acme/settings",
    },
    html: ({ name, organizationName, previousPlan, dashboardUrl }) =>
      renderEmail({
        title: "Your plan has\nbeen reset.",
        preheader: `${organizationName} has moved from the ${previousPlan} plan to the Free plan.`,
        label: "Subscription update",
        bodyHtml:
          paragraph(`Hi ${name},`) +
          paragraph(`Your organization ${organizationName} has been reset from the ${previousPlan} plan to the Free plan.`) +
          paragraph("As part of this change, the following adjustments were made to fit within the Free plan limits:") +
          list([
            "Custom domains have been removed",
            "Reserved subdomains reduced to 1",
            "Tunnels reduced to 2",
          ]),
        action: { label: "View Dashboard", url: dashboardUrl },
        footerHtml:
          footnote("If you believe this was done in error or have any questions, please reply to this email.") +
          footnote("Thanks,\nThe OutRay Team"),
      }),
  },
};

/**
 * Type-safe email generator function
 *
 * @example
 * const { html, subject } = generateEmail("organization-invite", {
 *   inviterName: "Jane",
 *   organizationName: "Acme",
 *   role: "admin",
 *   invitationLink: "https://..."
 * });
 */
export function generateEmail<K extends EmailTemplateKey>(
  templateKey: K,
  params: TemplateParamsMap[K],
): { html: string; subject: string } {
  const template = emailTemplates[templateKey];
  const subject =
    typeof template.subject === "function"
      ? template.subject(params as any)
      : template.subject;

  return {
    html: template.html(params as any),
    subject,
  };
}

/**
 * Get preview HTML for a template using its default preview params
 */
export function getTemplatePreview(templateKey: EmailTemplateKey): string {
  const template = emailTemplates[templateKey];
  return template.html(template.previewParams as any);
}

/**
 * Get template subject with preview params
 */
export function getTemplateSubject(templateKey: EmailTemplateKey): string {
  const template = emailTemplates[templateKey];
  return typeof template.subject === "function"
    ? template.subject(template.previewParams as any)
    : template.subject;
}
