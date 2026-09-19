#!/usr/bin/env npx tsx

/**
 * Script to create yearly Polar products and output environment variables
 *
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/create-polar-yearly-products.ts
 */

import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

let POLAR_ACCESS_TOKEN: string;
let API_BASE: string;

// Yearly prices (2 months free = 10 months worth)
const YEARLY_PRODUCTS = [
  {
    name: "Ray Yearly",
    envKey: "RAY_YEARLY",
    priceUSD: 70_00, // $70.00 in cents
  },
  {
    name: "Beam Yearly",
    envKey: "BEAM_YEARLY",
    priceUSD: 150_00, // $150.00 in cents
  },
  {
    name: "Pulse Yearly",
    envKey: "PULSE_YEARLY",
    priceUSD: 1200_00, // $1200.00 in cents
  },
];

interface ProductResponse {
  id: string;
  name: string;
  recurring_interval: string;
  prices: Array<{
    id: string;
    price_amount: number;
    price_currency: string;
  }>;
}

async function createProduct(
  name: string,
  priceAmountCents: number,
): Promise<ProductResponse> {
  const response = await fetch(`${API_BASE}/v1/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      recurring_interval: "year",
      prices: [
        {
          type: "fixed",
          amount_type: "fixed",
          price_amount: priceAmountCents,
          price_currency: "usd",
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to create product "${name}": ${response.status} ${error}`,
    );
  }

  return response.json();
}

async function main() {
  console.log("\n🚀 Polar Yearly Products Creator\n");

  POLAR_ACCESS_TOKEN = await prompt("Enter your Polar Access Token: ");
  if (!POLAR_ACCESS_TOKEN) {
    console.error("Error: Access token is required");
    process.exit(1);
  }

  const serverChoice = await prompt("Server (sandbox/production) [sandbox]: ");
  const server =
    serverChoice.toLowerCase() === "production" ? "production" : "sandbox";
  API_BASE =
    server === "sandbox"
      ? "https://sandbox-api.polar.sh"
      : "https://api.polar.sh";

  console.log(`\nCreating yearly products on Polar (${server})...\n`);

  const results: Record<string, string> = {};

  for (const product of YEARLY_PRODUCTS) {
    try {
      console.log(
        `Creating "${product.name}" ($${product.priceUSD / 100}/year)...`,
      );
      const created = await createProduct(product.name, product.priceUSD);
      results[product.envKey] = created.id;
      console.log(`  ✓ Created: ${created.id}\n`);
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
      process.exit(1);
    }
  }

  // Output environment variables
  console.log("\n" + "=".repeat(60));
  console.log("Add these to your .env file:");
  console.log("=".repeat(60) + "\n");

  console.log(
    "# Polar Product IDs - Yearly (create yearly products in Polar dashboard)",
  );
  console.log(`POLAR_PRODUCT_RAY_YEARLY=${results.RAY_YEARLY}`);
  console.log(`POLAR_PRODUCT_BEAM_YEARLY=${results.BEAM_YEARLY}`);
  console.log(`POLAR_PRODUCT_PULSE_YEARLY=${results.PULSE_YEARLY}`);
  console.log("");
  console.log(
    "# Vite client-side Polar Product IDs (same as above, exposed to frontend)",
  );
  console.log(`VITE_POLAR_PRODUCT_RAY=prod_xxxxxxxxxxxxxxxx`);
  console.log(`VITE_POLAR_PRODUCT_BEAM=prod_xxxxxxxxxxxxxxxx`);
  console.log(`VITE_POLAR_PRODUCT_PULSE=prod_xxxxxxxxxxxxxxxx`);
  console.log(`VITE_POLAR_PRODUCT_RAY_YEARLY=${results.RAY_YEARLY}`);
  console.log(`VITE_POLAR_PRODUCT_BEAM_YEARLY=${results.BEAM_YEARLY}`);
  console.log(`VITE_POLAR_PRODUCT_PULSE_YEARLY=${results.PULSE_YEARLY}`);
  console.log("");

  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
