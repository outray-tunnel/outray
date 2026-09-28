ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD COLUMN "notification_slack_webhook" jsonb;--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD COLUMN "notification_discord_webhook" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK ("notifications"."channel" IN ('email', 'webhook', 'slack', 'discord'));