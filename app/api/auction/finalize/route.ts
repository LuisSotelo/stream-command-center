import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";

export async function POST() {
  try {
    // 1. Extraer y validar variables de entorno inmediatamente
    const itemId = process.env.ML_ITEM_ID;
    const accessToken = process.env.ML_ACCESS_TOKEN;

    // Si falta alguna, lanzamos error antes de hacer cualquier cosa
    if (!itemId || !accessToken) {
      console.error("❌ Error: ML_ITEM_ID o ML_ACCESS_TOKEN no configurados en .env");
      return NextResponse.json({ 
        success: false, 
        error: "Server configuration missing" 
      }, { status: 500 });
    }

    // A partir de aquí, TypeScript sabe que itemId y accessToken son STRING (no undefined)
    const finalPrice = await redis.get("auction_price") || "200";

    // 2. LLAMADA REAL A MERCADO LIBRE
    const mlResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "active",
        price: Number(finalPrice)
      }),
    });

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json();
      return NextResponse.json({ success: false, error: errorData.message }, { status: 400 });
    }

  await redis.set("auction_status", "finished"); // 👈 Agregamos esto
  await redis.set("final_price_achieved", finalPrice); // Guardamos el precio final fijo

  // 3. Disparar el evento de Hype a todos (Landing, OBS, Admin)
  await pusherServer.trigger("auction-channel", "start-countdown", {
    finalPrice: Number(finalPrice),
    seconds: 10,
    mlLink: `https://articulo.mercadolibre.com.mx/${itemId.replace('MLM', 'MLM-')}`
  });

  return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 500 });
  }
}