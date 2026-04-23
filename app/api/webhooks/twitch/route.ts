import { NextResponse } from "next/server";
import { verifyTwitchSignature } from "@/lib/twitch-verify";
import { redis } from "@/lib/redis";

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

  const alreadyProcessed = await redis.get(`twitch_msg_${messageId}`);

  if (alreadyProcessed) {
    console.log(`♻️ Evento duplicado ignorado: ${messageId}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  await redis.set(`twitch_msg_${messageId}`, "1", { ex: 60 * 60 });

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

      const priceResponseText = await res.text();

      console.log("💸 /api/price status:", res.status);
      console.log("💸 /api/price response:", priceResponseText);

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

      const isGift = Boolean(event.is_gift);
      const isPrime = event.is_prime === true;
      const tier = event?.tier;

      if (isGift) {
        return NextResponse.json({ received: true });
      }

      let subType: "SUB" | "PRIME" | "SUB_TIER2" | "SUB_TIER3" = "SUB";

      // Tier 2 y Tier 3 sí son distinguibles con claridad
      if (tier === "2000") {
        subType = "SUB_TIER2";
      } else if (tier === "3000") {
        subType = "SUB_TIER3";
      } else if (isPrime) {
        // Tier 1000 con marca explícita de Prime
        subType = "PRIME";
      } else {
        // Tier 1000 pagada normal, o Prime/resub sin is_prime expuesto
        subType = "SUB";
      }

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

      const priceResponseText = await res.text();

      console.log("💸 /api/price status:", res.status);
      console.log("💸 /api/price response:", priceResponseText);

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

      const priceResponseText = await res.text();

      console.log("💸 /api/price status:", res.status);
      console.log("💸 /api/price response:", priceResponseText);

      if (!res.ok) {
        console.error("❌ Error procesando BITS en /api/price");
      }
    }
    // 4. NUEVOS FOLLOWS (Con sistema Anti-Abuso)
    else if (eventType === "channel.follow") {
      const userId = event.user_id;

      // 1. Preguntamos a Redis si este usuario ya dio follow antes
      const alreadyFollowed = await redis.get(`has_followed_${userId}`);

      if (!alreadyFollowed) {
        console.log(`🔔 [WEBHOOK] Follow REAL de ${userName}. Registrando y aplicando descuento.`);
        
        // 2. Lo guardamos en Redis permanentemente (o ponle un {ex: ...} si quieres que expire en meses)
        await redis.set(`has_followed_${userId}`, "true");

        // 3. Mandamos a cobrar el descuento
        const res = await fetch(`${process.env.NEXTAUTH_URL}/api/price`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET! 
          },
          body: JSON.stringify({ type: "FOLLOW", user: userName }),
        });

        const priceResponseText = await res.text();

        console.log("💸 /api/price status:", res.status);
        console.log("💸 /api/price response:", priceResponseText);
      } else {
        console.log(`🚫 [WEBHOOK] Follow repetido/troll de ${userName} ignorado.`);
      }
    }
  } catch (error) {
    console.error("❌ ERROR CRÍTICO AL CONTACTAR /api/price:", error);
  }

  return NextResponse.json({ received: true });
}