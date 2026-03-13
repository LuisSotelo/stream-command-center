import crypto from "crypto";

export function verifyTwitchSignature(signature: string, messageId: string, timestamp: string, body: string) {
  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  if (!secret) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const data = messageId + timestamp + body;
  const digest = "sha256=" + hmac.update(data).digest("hex");
  
  // --- ARREGLO AQUÍ ---
  const digestBuffer = Buffer.from(digest);
  const signatureBuffer = Buffer.from(signature);

  // Si no miden lo mismo, ni siquiera intentamos comparar
  if (digestBuffer.length !== signatureBuffer.length) {
    console.warn("⚠️ Firma de Twitch con longitud inválida");
    return false;
  }

  return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
}