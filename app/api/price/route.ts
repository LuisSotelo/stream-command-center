import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getServerSession } from "next-auth"; // Necesario para validar quién llama a la API

export async function GET() {
  try {
    const currentPrice = await redis.get("current_price");
    const initialPrice = Number(process.env.NEXT_PUBLIC_INITIAL_PRICE) || 1200;

    // IMPORTANTE: Devuelve 'newPrice' para que el frontend lo encuentre siempre igual
    if (currentPrice === null) {
      await redis.set("current_price", initialPrice);
      return NextResponse.json({ newPrice: initialPrice }); 
    }

    return NextResponse.json({ newPrice: Number(currentPrice) });
  } catch (error) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // 1. Validar la sesión del usuario (Seguridad Real)
  const session = await getServerSession();
  const userId = (session as any)?.user?.id;
  
  const isOwner = userId === process.env.AUTHORIZED_TWITCH_ID;
  const isLive = process.env.NEXT_PUBLIC_STREAM_ACTIVE === "true";
  const minPrice = Number(process.env.NEXT_PUBLIC_MIN_PRICE) || 0;

  // 2. BLOQUEO: Solo deja pasar si está LIVE o si eres el DUEÑO probando
  if (!isLive && !isOwner) {
    return NextResponse.json(
      { error: "Subasta inactiva para moderadores." },
      { status: 403 }
    );
  }

  try {
    const { amount } = await req.json();
    const discount = Math.abs(Number(amount)) || 0;

    const currentPrice = await redis.get("current_price");
    // Aseguramos que currentPrice no sea null antes de operar
    const priceBefore = currentPrice ? Number(currentPrice) : (Number(process.env.NEXT_PUBLIC_INITIAL_PRICE) || 1200);
    
    const newPrice = Math.max(priceBefore - discount, minPrice);

    await redis.set("current_price", newPrice);

    await pusherServer.trigger("auction-channel", "price-update", {
      price: newPrice,
      user: session?.user?.name || "System" // Opcional: para saber quién bajó el precio
    });

    return NextResponse.json({ success: true, newPrice });
  } catch (error) {
    return NextResponse.json({ error: "Error de actualización" }, { status: 500 });
  }
}