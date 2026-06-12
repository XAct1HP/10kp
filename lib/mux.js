import Mux from "@mux/mux-node";

export function getMuxWebhookSecret() {
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("Missing MUX_WEBHOOK_SECRET environment variable");
  }

  return webhookSecret;
}

export function getMuxClient() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error("Missing Mux credentials (MUX_TOKEN_ID / MUX_TOKEN_SECRET)");
  }

  return new Mux({
    tokenId,
    tokenSecret,
    webhookSecret: webhookSecret || undefined,
  });
}
