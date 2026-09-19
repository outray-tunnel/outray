/**
 * Paystack API Client
 *
 * Uses the "Charge Authorization" model for recurring billing.
 * We store the card authorization and charge it ourselves via cron.
 */

import { createHmac } from "crypto";

// Naira pricing (display)
export const PAYSTACK_PRICES_NGN = {
  ray: 10000, // ₦10,000
  beam: 21000, // ₦21,000
  pulse: 170000, // ₦170,000
  // Yearly (2 months free)
  ray_yearly: 100000, // ₦100,000
  beam_yearly: 210000, // ₦210,000
  pulse_yearly: 1700000, // ₦1,700,000
} as const;

// Kobo pricing (Paystack uses smallest currency unit)
export const PAYSTACK_PRICES_KOBO = {
  ray: PAYSTACK_PRICES_NGN.ray * 100, // 1,000,000 kobo
  beam: PAYSTACK_PRICES_NGN.beam * 100, // 2,100,000 kobo
  pulse: PAYSTACK_PRICES_NGN.pulse * 100, // 17,000,000 kobo
  // Yearly
  ray_yearly: PAYSTACK_PRICES_NGN.ray_yearly * 100,
  beam_yearly: PAYSTACK_PRICES_NGN.beam_yearly * 100,
  pulse_yearly: PAYSTACK_PRICES_NGN.pulse_yearly * 100,
} as const;

export type PaystackPlan = "ray" | "beam" | "pulse";
export type PaystackPriceKey = keyof typeof PAYSTACK_PRICES_KOBO;

const PAYSTACK_API_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return key;
}

async function paystackRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${PAYSTACK_API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[Paystack] API error:", data);
    throw new Error(data.message || "Paystack API error");
  }

  return data;
}

export interface InitializeTransactionParams {
  email: string;
  amount: number; // in kobo
  metadata?: Record<string, unknown>;
  callback_url?: string;
}

export interface InitializeTransactionResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

/**
 * Initialize a transaction for card tokenization (first payment)
 * Uses channels: ['card'] to ensure only card payments are shown
 */
export async function initializeTransaction(
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResponse> {
  return paystackRequest<InitializeTransactionResponse>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        amount: params.amount,
        channels: ["card"], // Card only - required for recurring charges
        metadata: params.metadata,
        callback_url: params.callback_url,
      }),
    },
  );
}

export interface ChargeAuthorizationParams {
  authorization_code: string;
  email: string;
  amount: number; // in kobo
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface ChargeAuthorizationResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string; // 'success', 'failed', 'pending'
    gateway_response: string;
    amount: number;
    authorization: {
      authorization_code: string;
      card_type: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      bank: string;
      signature: string;
      reusable: boolean;
    };
  };
}

/**
 * Charge a stored card authorization (for recurring billing)
 */
export async function chargeAuthorization(
  params: ChargeAuthorizationParams,
): Promise<ChargeAuthorizationResponse> {
  const reference =
    params.reference ||
    `outray_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return paystackRequest<ChargeAuthorizationResponse>(
    "/transaction/charge_authorization",
    {
      method: "POST",
      body: JSON.stringify({
        authorization_code: params.authorization_code,
        email: params.email,
        amount: params.amount,
        reference,
        metadata: params.metadata,
      }),
    },
  );
}

export interface VerifyTransactionResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    reference: string;
    status: string; // 'success', 'failed', 'abandoned'
    gateway_response: string;
    amount: number;
    currency: string;
    paid_at: string;
    channel: string;
    metadata: Record<string, unknown>;
    customer: {
      id: number;
      email: string;
      customer_code: string;
      first_name: string | null;
      last_name: string | null;
    };
    authorization: {
      authorization_code: string;
      card_type: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      bank: string;
      channel: string;
      signature: string;
      reusable: boolean;
      country_code: string;
    };
  };
}

/**
 * Verify a transaction and get authorization details
 */
export async function verifyTransaction(
  reference: string,
): Promise<VerifyTransactionResponse> {
  return paystackRequest<VerifyTransactionResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
    },
  );
}

/**
 * Verify webhook signature using HMAC SHA512
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
): boolean {
  const hash = createHmac("sha512", getSecretKey()).update(body).digest("hex");
  return hash === signature;
}

/**
 * Generate a unique reference for a transaction
 */
export function generateReference(prefix = "outray"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
