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

// Map template keys to their parameter types
type TemplateParamsMap = {
  welcome: WelcomeParams;
  "password-reset": PasswordResetParams;
  "organization-invite": OrganizationInviteParams;
  "payment-failed": PaymentFailedParams;
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
      dashboardUrl: "https://outray.dev/select",
    },
    html: ({ name, dashboardUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Outray</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td style="padding: 0 0 20px 0;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Hi ${name},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                I'm Akinkunmi, the creator of OutRay. I'm happy to have you onboard! <br/> <br/> OutRay makes it easy to expose your local development servers to the internet securely.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Get started by installing the CLI and creating your first tunnel.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                Go to Dashboard
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                If you have any questions or feedback, just reply to this email – I personally read every one.
              </p>
              <p style="margin: 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Cheers,<br>
                Akinkunmi
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0 0 0; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                © 2026 Outray. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
  },

  "password-reset": {
    name: "Password Reset",
    subject: "Reset Your Password",
    params: ["name", "resetUrl"],
    previewParams: {
      name: "John Doe",
      resetUrl: "https://outray.dev/reset-password?token=abc123",
    },
    html: ({ name, resetUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td style="padding: 0 0 20px 0;">
              <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #18181b;">Reset Your Password 🔐</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 20px 0;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Hi ${name},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                We received a request to reset your password. Click the button below to create a new password.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 20px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #dc2626; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                Or copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0 0 0; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                © 2026 Outray. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
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
      invitationLink: "https://outray.dev/invitations/accept?token=abc123",
    },
    html: ({ inviterName, organizationName, role, invitationLink }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Join ${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td style="padding: 0 0 20px 0;">
              <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #18181b;">You're Invited! 🎉</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 20px 0;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Hi,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                <strong>${inviterName}</strong> has invited you to join the organization <strong>${organizationName}</strong> on OutRay with the role of <strong>${role}</strong>.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Click the button below to accept the invitation and get started.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 20px 0;">
              <a href="${invitationLink}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                Accept Invitation
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                Or copy and paste this link into your browser:<br>
                <a href="${invitationLink}" style="color: #2563eb; word-break: break-all;">${invitationLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0 0 0; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                © 2026 Outray. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
  },

  "payment-failed": {
    name: "Payment Failed",
    subject: "Action Required: Your OutRay payment failed",
    params: ["name", "planName", "amount", "billingUrl", "attemptsRemaining"],
    previewParams: {
      name: "John Doe",
      planName: "Beam",
      amount: "₦21,000",
      billingUrl: "https://outray.dev/acme/billing",
      attemptsRemaining: 2,
    },
    html: ({ name, planName, amount, billingUrl, attemptsRemaining }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td style="padding: 0 0 20px 0;">
              <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #dc2626;">Payment Failed ⚠️</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 20px 0;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Hi ${name},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                We couldn't process your payment of <strong>${amount}</strong> for the <strong>${planName}</strong> plan on OutRay.
              </p>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                ${attemptsRemaining > 0
                  ? `We'll retry your payment automatically. You have <strong>${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'}</strong> remaining before your subscription is cancelled.`
                  : `This was our final attempt. Your subscription has been cancelled and downgraded to the free plan.`
                }
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #3f3f46;">
                To update your payment method, visit your billing page:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 20px 0;">
              <a href="${billingUrl}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                Update Payment Method
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                Common reasons for payment failures include:
              </p>
              <ul style="margin: 10px 0; padding-left: 20px; font-size: 14px; line-height: 24px; color: #71717a;">
                <li>Insufficient funds</li>
                <li>Expired card</li>
                <li>Card declined by your bank</li>
              </ul>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 30px 0;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you have any questions, just reply to this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0 0 0; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                © 2026 Outray. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
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
