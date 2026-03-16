import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getServerSession } from "next-auth";
import { getCurrentLevel } from "@/lib/auction-logic";

export async function GET() {
  try {
    // 1. Traemos todos los datos necesarios de Redis en una sola ráfaga
    const [currentPrice, estado_subasta, link, ultimoGanador] = await Promise.all([
      redis.get("auction_price"),
      redis.get("auction_status"),
      redis.get("last_ml_link"),
      redis.get("auction_last_hit")
    ]);

    const initialPrice = Number(process.env.NEXT_PUBLIC_INITIAL_PRICE) || 1200;
    const status = estado_subasta || "active";

    // 2. Si no hay precio (primera vez), inicializamos
    if (currentPrice === null) {
      await redis.set("auction_price", initialPrice);
      await redis.set("auction_status", status);
      return NextResponse.json({ 
        newPrice: initialPrice, 
        auction_status: status,
        mlLink: null,
        lastWinner: null 
      }); 
    }

    // 3. Devolvemos TODO para que la vista sepa si mostrar el botón o no
    return NextResponse.json({ 
      newPrice: Number(currentPrice),
      auction_status: status,
      mlLink: link, // <--- AQUÍ ESTÁ TU LINK
      lastWinner: ultimoGanador // <--- PARA MOSTRAR QUIÉN DIO EL GOLPE FINAL
    });
  } catch (error) {
    console.error("Error en GET Price:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // 1. Validaciones de Seguridad
  const session = await getServerSession();
  const userId = (session as any)?.user?.id;
  const twitchToken = req.headers.get("x-twitch-secret");

  const isOwner = userId === process.env.AUTHORIZED_TWITCH_ID;
  const isLive = process.env.NEXT_PUBLIC_STREAM_ACTIVE === "true";
  const minPrice = Number(process.env.NEXT_PUBLIC_MIN_PRICE) || 0;

  if (!session && twitchToken !== process.env.TWITCH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isLive && !isOwner) {
    return NextResponse.json({ error: "Subasta inactiva." }, { status: 403 });
  }

  try {
    const { type, amount, user } = await req.json(); 
    const currentPriceRaw = await redis.get("auction_price");
    const currentPrice = currentPriceRaw ? Number(currentPriceRaw) : 1200;

    const level = getCurrentLevel(currentPrice);
    
    let discount = 0;
    let joaquinComment = "";
    const culiacanQuotes = [
      "servirá para el sushi más obsceno que haya visto Culiacán. Provecho, Luis.",
      "va directo al fondo de ahorro para los tacos de LuisHongo. Los mortales necesitan proteína.",
      "es un gran paso para la dieta de Seta y Bolillo. Las croquetas no caen del cielo.",
      "financiará mi copia de Resident Evil Requiem mientras ustedes pelean por centavos.",
      ", gracias por la limosna, mortal. Luis lo usará para un aguachile bien picoso.",
      "es una contribución aceptable... para que Luis compre una coquita bien helada."
    ];

    // 2. Determinar Descuento
    switch (type) {
      case 'SUB': discount = level.rates.sub; break;
      case 'PRIME': discount = level.rates.prime; break;
      case 'BITS_100': discount = level.rates.bits100; break;
      case 'BITS_500': discount = level.rates.bits500; break;
      case 'BITS_1000': discount = level.rates.bits1000; break;
      case 'BITS_TROLL':
        discount = 0;
        const randomQuote = culiacanQuotes[Math.floor(Math.random() * culiacanQuotes.length)];
        joaquinComment = `🤖 Gracias por tu benevolente contribución de ${amount} bits, @${user}. Eso ${randomQuote} 🐷✨`;
        break;
      default: discount = 0;
    }

    // 3. Lógica de Precios y Eventos Especiales
    let newPrice = currentPrice - discount;
    let specialEvent = null;

    // Solo procesamos cambios si hay descuento real
    if (discount > 0) {
      // Verificar Evento Sorpresa (Level Event)
      if (level.event && newPrice <= level.event.triggerPrice) {
        newPrice -= level.event.amount;
        specialEvent = {
          name: level.event.name,
          amount: level.event.amount
        };
      }

      if (newPrice < minPrice) newPrice = minPrice;

      // Persistencia en Redis (Precio y Top)
      await redis.set("auction_price", newPrice);
      if (user && user !== "Admin") {
        await redis.zincrby("auction_top", discount, user);
        await redis.set("auction_last_hit", user);
      }
    }

    // 4. Logging de Auditoría
    const logEntry = {
      admin: type === 'BITS_TROLL' ? "Sistema/Joaquín" : (twitchToken ? "Sistema/Twitch" : (session?.user?.name || "Admin")),
      action: type,
      amount: discount,
      user: user || "Anónimo",
      timestamp: new Date().toISOString(),
    };
    await redis.lpush("admin_logs", JSON.stringify(logEntry));
    await redis.ltrim("admin_logs", 0, 19);

    // 5. Triggers de Pusher (Notificaciones en tiempo real)
    
    // Si Joaquín tiene algo que decir (Trolleo)
    if (joaquinComment) {
      await pusherServer.trigger("auction-channel", "joaquin-troll", { message: joaquinComment });
    }

    // Actualizar Landing, OBS y Dashboard
    await pusherServer.trigger("auction-channel", "price-update", {
      newPrice,
      user: user || "Anónimo",
      type,
      amount: discount,
      levelName: level.name,
      specialEvent
    });

    // Actualizar el log en el Dashboard
    await pusherServer.trigger("auction-channel", "admin-log-update", logEntry);

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