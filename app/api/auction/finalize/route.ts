import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getValidMLToken } from "@/lib/mercadolibre";

export async function POST() {
  try {
    const itemId = process.env.ML_ITEM_ID;
    const accessToken = await getValidMLToken();

    if (!itemId || !accessToken) {
      console.error("❌ Error: ML_ITEM_ID no configurado o token de Mercado Libre faltante");
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration missing",
        },
        { status: 500 },
      );
    }

    const finalPriceRaw = await redis.get("auction_price");
    const finalPrice = Number(finalPriceRaw || 200);

    const mlResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "active",
        price: finalPrice,
      }),
    });

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json();
      console.error("❌ Error actualizando artículo en Mercado Libre:", errorData);

      return NextResponse.json(
        {
          success: false,
          error: errorData.message || "Mercado Libre update failed",
        },
        { status: 400 },
      );
    }

    const cleanId = itemId.replace("MLM", "");
    const finalLink = `https://articulo.mercadolibre.com.mx/MLM-${cleanId}`;

    await Promise.all([
      redis.set("auction_status", "finished"),
      redis.set("final_price_achieved", finalPrice),
      redis.set("last_ml_link", finalLink),
    ]);

    await pusherServer.trigger("auction-channel", "start-countdown", {
      finalPrice,
      seconds: 10,
      mlLink: finalLink,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error en auction finalize:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal Error",
      },
      { status: 500 },
    );
  }
}