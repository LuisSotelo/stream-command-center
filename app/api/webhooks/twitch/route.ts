import { NextResponse } from "next/server";
import { verifyTwitchSignature } from "@/lib/twitch-verify";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("twitch-eventsub-message-signature") || "";
  const messageId = req.headers.get("twitch-eventsub-message-id") || "";
  const timestamp = req.headers.get("twitch-eventsub-message-timestamp") || "";

  // 1. Verificar que sea Twitch de verdad
  if (!verifyTwitchSignature(signature, messageId, timestamp, body)) {
    return NextResponse.json({ error: "Invalid Signature" }, { status: 401 });
  }

  const data = JSON.parse(body);

  // 2. Manejar el "Challenge" (Twitch lo pide una sola vez al activar el webhook)
  if (req.headers.get("twitch-eventsub-message-type") === "webhook_callback_verification") {
    return new Response(data.challenge, { status: 200 });
  }

  // 3. Lógica de Descuentos Reales
  const eventType = data.subscription.type; // 'channel.subscribe' o 'channel.cheer'
  const event = data.event;

  let discountType = "";
  let userName = event.user_name;

  if (eventType === "channel.subscribe" || eventType === "channel.subscription.gift") {
    discountType = "SUB";
  } else if (eventType === "channel.cheer") {
    const bits = event.bits;
    if (bits >= 1000) discountType = "BITS_1000";
    else if (bits >= 500) discountType = "BITS_500";
    else if (bits >= 100) discountType = "BITS_100";
    else {
      // 🐷 AQUÍ ENTRA JOAQUÍN EL SEMIDIOS
      // Si mandan 1 a 99 bits, o cualquier cantidad que no llegue al siguiente tier
      discountType = "BITS_TROLL"; 
    } 
  }

  if (discountType) {
    // LLAMAMOS A TU PROPIA API DE PRECIO (Internamente)
    await fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET! // Para saltar el login del admin
      },
      body: JSON.stringify({ type: discountType, user: userName, amount: event.bits || 0 }),
    });
  }

  return NextResponse.json({ received: true });
}