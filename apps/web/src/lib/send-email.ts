import emailConfig from "../../../../shared/email-sender";

export async function sendViaZepto({
  recipientEmail,
  htmlString,
  subject,
  senderEmail,
  senderName,
}: {
  recipientEmail: string;
  htmlString: string;
  subject: string;
  senderEmail?: string;
  senderName?: string;
}): Promise<void> {
  const url = "https://api.zeptomail.com/v1.1/email";
  const token = process.env.ZEPTO_API_KEY;
  if (!token) throw new Error("Email delivery is not configured for this installation");
  const defaults = emailConfig.emailSender("OutRay");
  const configuredSender = senderEmail || defaults.address;

  const senderAddress = configuredSender.includes("<")
    ? configuredSender.split("<")[1].replace(">", "").trim()
    : configuredSender;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${token}`,
    },
    body: JSON.stringify({
      from: {
        address: senderAddress,
        name: senderName || defaults.name,
      },
      to: [
        {
          email_address: {
            address: recipientEmail,
            name: recipientEmail.split("@")[0],
          },
        },
      ],
      subject,
      htmlbody: htmlString,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send email: ${response.status} - ${errorData}`);
  }
}
