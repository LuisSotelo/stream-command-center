import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getServerSession } from "next-auth"; // Necesario para validar quién llama a la API
import { getCurrentLevel } from "@/lib/auction-logic";

export async function GET() {
  try {
    const currentPrice = await redis.get("auction_price");
    const initialPrice = Number(process.env.NEXT_PUBLIC_INITIAL_PRICE) || 1200;
    const estado_subasta = await redis.get("auction_status") || "active";

    if (currentPrice === null) {
      await redis.set("auction_price", initialPrice);
      await redis.set("auction_status", estado_subasta);
      return NextResponse.json({ newPrice: initialPrice, auction_status: estado_subasta }); 
    }

    return NextResponse.json({ 
      newPrice: Number(currentPrice),
      auction_status: estado_subasta
    });
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

  // 2. Intentar obtener el Token de Twitch (para el futuro webhook)
  const twitchToken = req.headers.get("x-twitch-secret");

  // 3. Bloquear si no es ni sesión válida ni Twitch
  if (!session && twitchToken !== process.env.TWITCH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 4. BLOQUEO: Solo deja pasar si está LIVE o si eres el DUEÑO probando
  if (!isLive && !isOwner) {
    return NextResponse.json(
      { error: "Subasta inactiva para moderadores." },
      { status: 403 }
    );
  }

  try {
    const { type, user } = await req.json(); 
    // type puede ser: 'SUB', 'BITS_100', 'BITS_500', 'BITS_1000'

    // 1. Obtener el precio actual de Redis
    const currentPriceRaw = await redis.get("auction_price");
    const currentPrice = currentPriceRaw ? Number(currentPriceRaw) : 1200;

    // 2. Determinar en qué nivel estamos
    const level = getCurrentLevel(currentPrice);
    
    // 3. Calcular el descuento basado en la tabla de niveles
    let discount = 0;
    switch (type) {
      case 'SUB':
        discount = level.rates.sub;
        break;
      case 'PRIME':
        discount = level.rates.prime;
        break;
      case 'BITS_100':
        discount = level.rates.bits100;
        break;
      case 'BITS_500':
        discount = level.rates.bits500;
        break;
      case 'BITS_1000':
        discount = level.rates.bits1000;
        break;
      default:
        discount = 0;
    }

    let newPrice = currentPrice - discount;

    // 4. Lógica de EVENTOS SORPRESA
    let specialEvent = null;
    // Si al restar el descuento cruzamos la meta del nivel
    if (level.event && newPrice <= level.event.triggerPrice) {
      newPrice -= level.event.amount;
      specialEvent = {
        name: level.event.name,
        extraDiscount: level.event.amount
      };
    }

    // Asegurar que el precio no sea menor a 200 (tu límite de Mercado Libre)
    if (newPrice < 200) newPrice = 200;

    // 5. Guardar el nuevo precio en Redis
    await redis.set("auction_price", newPrice);

    // 6. Notificar a Pusher (Landing y Overlays)
    await pusherServer.trigger("auction-channel", "price-update", {
      newPrice,
      user: user || "Anónimo",
      type,
      discountApplied: discount,
      levelName: level.name,
      specialEvent // Esto disparará las animaciones locas
    });

    return NextResponse.json({ 
      success: true, 
      newPrice, 
      level: level.name,
      eventTriggered: !!specialEvent 
    });

  } catch (error) {
    console.error("Error en API Price:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}