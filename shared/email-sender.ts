type EmailEnvironment = Readonly<Record<string, string | undefined>>;

/** Resolve only at delivery time so email remains optional for an installation. */
export function emailSender(defaultName: string, env: EmailEnvironment = process.env) {
  const address = env.ZEPTO_FROM_EMAIL || (env.OUTRAY_DEPLOYMENT_MODE === "self-hosted" ? "" : "no-reply@outray.dev");
  if (!address || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    throw new Error("Configure a verified ZEPTO_FROM_EMAIL for this installation");
  }
  return { address, name: env.ZEPTO_FROM_NAME || defaultName };
}

export default { emailSender };
