import { NextResponse } from "next/server";
import { redis } from "@/lib/redis"; // Tu instancia de Redis
import { pusherServer } from "@/lib/pusher";

export async function POST(req: Request) {
  // 1. REVISAR EL SWITCH DE SEGURIDAD
  // Solo permitimos cambios si la variable de entorno dice que estamos LIVE
  const isLive = process.env.NEXT_PUBLIC_STREAM_ACTIVE === "true";

  if (!isLive) {
    return NextResponse.json(
      { error: "La subasta no está activa. Solo se puede bajar el precio durante el stream." },
      { status: 403 }
    );
  }

  // 2. LÓGICA DE DESCUENTO (Si está live, procedemos)
  try {
    const { amount } = await req.json(); // p.ej. 10 para $10 pesos
    
    // Obtenemos precio actual, restamos y guardamos en Redis
    const currentPrice = await redis.get("current_price");
    const newPrice = Number(currentPrice) - amount;

    await redis.set("current_price", newPrice);

    // Avisamos a la Landing por Pusher
    await pusherServer.trigger("auction-channel", "price-update", {
      price: newPrice,
    });

    return NextResponse.json({ success: true, newPrice });
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}