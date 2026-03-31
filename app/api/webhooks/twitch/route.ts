import { NextResponse } from "next/server";
import { verifyTwitchSignature } from "@/lib/twitch-verify";

export async function POST(req: Request) {
  const body = await req.text();
  const data = JSON.parse(body);
  const messageType = req.headers.get("twitch-eventsub-message-type");

  // 1. RESPONDER AL CHALLENGE DE TWITCH
  if (messageType === "webhook_callback_verification") {
    console.log("✅ Verificación de Webhook exitosa (Challenge recibido)");
    return new Response(data.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 2. VALIDACIÓN DE FIRMA
  const signature = req.headers.get("twitch-eventsub-message-signature") || "";
  const messageId = req.headers.get("twitch-eventsub-message-id") || "";
  const timestamp = req.headers.get("twitch-eventsub-message-timestamp") || "";

  if (!verifyTwitchSignature(signature, messageId, timestamp, body)) {
    console.error("❌ Firma inválida detectada. El evento fue rechazado.");
    return NextResponse.json({ error: "Invalid Signature" }, { status: 401 });
  }

  const eventType = data.subscription?.type;
  const event = data.event ?? {};
  const userName = event.user_name || "Anónimo";

  try {
    console.log("📩 HEADERS:", Object.fromEntries(req.headers));
    console.log("📦 BODY:", body);
    console.log("🔥 EVENT TYPE:", eventType);
    console.log("👤 USER:", userName);
    // 1. GIFT BOMB
    if (eventType === "channel.subscription.gift") {
      const totalGifts = event.total || 1;

      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET!,
        },
        body: JSON.stringify({
          type: "GIFT_BOMB",
          user: userName,
          amount: totalGifts,
        }),
      });

      if (!res.ok) {
        console.error("❌ Error procesando GIFT_BOMB en /api/price");
      }
    }

    // 2. SUBS / RESUBS / PRIME
    else if (
      eventType === "channel.subscribe" ||
      eventType === "channel.subscription.message"
    ) {
      if (event.is_gift) {
        return NextResponse.json({ received: true });
      }

      const subType = event.is_prime ? "PRIME" : "SUB";

      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET!,
        },
        body: JSON.stringify({
          type: subType,
          user: userName,
        }),
      });

      if (!res.ok) {
        console.error(`❌ Error procesando ${subType} en /api/price`);
      }
    }

    // 3. BITS
    else if (eventType === "channel.cheer") {
      const bits = Number(event.bits || 0);

      let discountType = "";
      if (bits >= 1000) discountType = "BITS_1000";
      else if (bits >= 500) discountType = "BITS_500";
      else if (bits >= 100) discountType = "BITS_100";
      else discountType = "BITS_TROLL";

      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET!,
        },
        body: JSON.stringify({
          type: discountType,
          user: userName,
          amount: bits,
        }),
      });

      if (!res.ok) {
        console.error("❌ Error procesando BITS en /api/price");
      }
    }
  } catch (error) {
    console.error("❌ ERROR CRÍTICO AL CONTACTAR /api/price:", error);
  }

  return NextResponse.json({ received: true });
}