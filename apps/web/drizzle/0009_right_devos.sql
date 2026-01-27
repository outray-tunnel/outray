ALTER TABLE "subscriptions" ADD COLUMN "paystack_customer_code" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "paystack_authorization_code" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "paystack_email" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_provider" text DEFAULT 'polar';--> statement-breakpoint
CREATE INDEX "subscriptions_paystackCustomerCode_idx" ON "subscriptions" USING btree ("paystack_customer_code");--> statement-breakpoint
CREATE INDEX "subscriptions_paymentProvider_idx" ON "subscriptions" USING btree ("payment_provider");