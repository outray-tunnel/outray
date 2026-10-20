// The public Node SDK runs before the standalone Astro server starts.
if (process.env.OUTRAY_API_KEY) {
  try {
    const { startOutrayObservability } = await import("@outray/observability");
    startOutrayObservability({
      serviceName: "outray-status",
      endpoint: process.env.OUTRAY_OTLP_ENDPOINT,
      environment: process.env.NODE_ENV,
      captureConsole: true,
      autoInstrumentations: false,
      redactedLogFields: ["body", "data", "result", "content", "env"],
    });
  } catch {
    console.error("Observability initialization failed");
  }
}
