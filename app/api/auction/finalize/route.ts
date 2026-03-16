import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getValidMLToken } from "@/lib/mercadolibre";

export async function POST() {
  try {
    // 1. Extraer y validar variables de entorno inmediatamente
    const itemId = process.env.ML_ITEM_ID;
    const accessToken = await getValidMLToken();

    // Si falta alguna, lanzamos error antes de hacer cualquier cosa
    if (!itemId || !accessToken) {
      console.error("❌ Error: ML_ITEM_ID no configurado en .env o ML_ACCESS_TOKEN no configurados en redis");
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
        status: "active", // Lo activamos por si estaba pausado
        price: Number(finalPrice)
      }),
    });

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json();
      return NextResponse.json({ success: false, error: errorData.message }, { status: 400 });
    }

    // 3. PERSISTENCIA EN REDIS
    const cleanId = itemId.replace('MLM', '');
    const finalLink = `https://articulo.mercadolibre.com.mx/MLM-${cleanId}`;

    await Promise.all([
      redis.set("auction_status", "finished"),
      redis.set("final_price_achieved", finalPrice),
      redis.set("last_ml_link", finalLink)
    ]);

    // 4. DISPARO DE HYPE
    await pusherServer.trigger("auction-channel", "start-countdown", {
      finalPrice: Number(finalPrice),
      seconds: 10,
      mlLink: finalLink
    });

  return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 500 });
  }
}