import { NextResponse } from "next/server";
import { verifyTwitchSignature } from "@/lib/twitch-verify";

export async function POST(req: Request) {
  const body = await req.text();
  const data = JSON.parse(body);
  const messageType = req.headers.get("twitch-eventsub-message-type");

  // 1. EL GUARDIÁN: Respondemos al Challenge inmediatamente
  // Twitch necesita esto para activar el Webhook. No requiere firma.
  if (messageType === "webhook_callback_verification") {
    console.log("✅ Verificación de Webhook exitosa (Challenge recibido)");
    return new Response(data.challenge, { 
      status: 200, 
      headers: { "Content-Type": "text/plain" } 
    });
  }

  // 2. VALIDACIÓN DE SEGURIDAD (Solo para eventos reales como Subs/Bits)
  const signature = req.headers.get("twitch-eventsub-message-signature") || "";
  const messageId = req.headers.get("twitch-eventsub-message-id") || "";
  const timestamp = req.headers.get("twitch-eventsub-message-timestamp") || "";

  if (!verifyTwitchSignature(signature, messageId, timestamp, body)) {
    console.error("❌ Firma inválida detectada. El evento fue rechazado.");
    return NextResponse.json({ error: "Invalid Signature" }, { status: 401 });
  }

  // Si llegamos aquí, la firma es real y el mensaje viene de Twitch
  const eventType = data.subscription.type;
  const event = data.event;
  let userName = event.user_name || "Anónimo";
  
  // --- LÓGICA DE DETECCIÓN DE EVENTOS ---

  // 1. REGALO DE PAQUETES (GIFT BOMB)
  if (eventType === "channel.subscription.gift") {
    const totalGifts = event.total; // Cantidad de subs regaladas (ej. 5, 10, 50)
    
    // Enviamos una petición especial para que el backend multiplique el descuento
    fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET! 
      },
      body: JSON.stringify({ 
        type: "GIFT_BOMB", // Nuevo tipo para manejar volumen
        user: userName, 
        amount: totalGifts 
      }),
    }).catch(err => console.error("Error en Gift Bomb:", err));
  }

  // 2. SUBS INDIVIDUALES (Nuevas, Primes y Resubs)
  else if (eventType === "channel.subscribe" || eventType === "channel.subscription.message") {
    // IMPORTANTE: Evitamos duplicar si la sub viene de un regalo (el evento gift ya la cubrió)
    if (event.is_gift) return NextResponse.json({ received: true });

    fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET! 
      },
      body: JSON.stringify({ type: "SUB", user: userName }),
    }).catch(err => console.error("Error en Sub:", err));
  }

  // 3. BITS (CHEERS)
  else if (eventType === "channel.cheer") {
    let discountType = "";
    const bits = event.bits;
    if (bits >= 1000) discountType = "BITS_1000";
    else if (bits >= 500) discountType = "BITS_500";
    else if (bits >= 100) discountType = "BITS_100";
    else discountType = "BITS_TROLL";

    fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET! 
      },
      body: JSON.stringify({ type: discountType, user: userName, amount: bits }),
    }).catch(err => console.error("Error en Bits:", err));
  }

  return NextResponse.json({ received: true });
}