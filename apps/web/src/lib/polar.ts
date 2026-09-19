export async function initiateCheckout(
  productId: string,
  organizationId: string,
  customerEmail: string,
  customerName: string,
): Promise<string> {
  const params = new URLSearchParams({
    products: productId,
    customerEmail,
    customerName,
    metadata: JSON.stringify({ organizationId }),
  });

  const checkoutUrl = `/api/checkout/polar?${params.toString()}`;

  return checkoutUrl;
}

export const POLAR_PRODUCT_IDS = {
  // Monthly
  ray: import.meta.env.VITE_POLAR_PRODUCT_RAY || "",
  beam: import.meta.env.VITE_POLAR_PRODUCT_BEAM || "",
  pulse: import.meta.env.VITE_POLAR_PRODUCT_PULSE || "",
  // Yearly
  ray_yearly: import.meta.env.VITE_POLAR_PRODUCT_RAY_YEARLY || "",
  beam_yearly: import.meta.env.VITE_POLAR_PRODUCT_BEAM_YEARLY || "",
  pulse_yearly: import.meta.env.VITE_POLAR_PRODUCT_PULSE_YEARLY || "",
} as const;

export type PolarProductKey = keyof typeof POLAR_PRODUCT_IDS;
