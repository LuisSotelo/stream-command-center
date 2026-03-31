import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getServerSession } from "next-auth";
import { getCurrentLevel } from "@/lib/auction-logic";

export async function GET() {
  try {
    const [currentPrice, auctionStatus, link, lastWinner] = await Promise.all([
      redis.get("auction_price"),
      redis.get("auction_status"),
      redis.get("last_ml_link"),
      redis.get("auction_last_hit"),
    ]);

    const initialPrice = Number(process.env.NEXT_PUBLIC_INITIAL_PRICE) || 1200;
    const status = auctionStatus || "active";

    if (currentPrice === null) {
      await redis.set("auction_price", initialPrice);
      await redis.set("auction_status", status);

      return NextResponse.json({
        newPrice: initialPrice,
        auction_status: status,
        mlLink: null,
        lastWinner: null,
      });
    }

    return NextResponse.json({
      newPrice: Number(currentPrice),
      auction_status: status,
      mlLink: link,
      lastWinner,
    });
  } catch (error) {
    console.error("Error en GET Price:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
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

    const currentLevel = getCurrentLevel(currentPrice);

    let discount = 0;
    let joaquinComment = "";

    const culiacanQuotes = [
      "servirá para el sushi más obsceno que haya visto Culiacán. Provecho, Luis.",
      "va directo al fondo de ahorro para los tacos de LuisHongo. Los mortales necesitan proteína.",
      "es un gran paso para la dieta de Seta y Bolillo. Las croquetas no caen del cielo.",
      "financiará mi copia de Resident Evil Requiem mientras ustedes pelean por centavos.",
      "gracias por la limosna, mortal. Luis lo usará para un aguachile bien picoso.",
      "es una contribución aceptable... para que Luis compre una coquita bien helada.",
    ];

    switch (type) {
      case "SUB":
        discount = currentLevel.rates.sub;
        break;

      case "PRIME":
        discount = currentLevel.rates.prime;
        break;

      case "GIFT_BOMB":
        discount = currentLevel.rates.sub * (amount || 1);
        joaquinComment = `¡ATENCIÓN! @${user} acaba de soltar una bomba de ${amount} subs. ¡EL PRECIO SE ESTÁ DESINTEGRANDO!`;
        break;

      case "BITS_100":
        discount = currentLevel.rates.bits100;
        break;

      case "BITS_500":
        discount = currentLevel.rates.bits500;
        break;

      case "BITS_1000":
        discount = currentLevel.rates.bits1000;
        break;

      case "BITS_TROLL": {
        discount = 0;
        const randomQuote =
          culiacanQuotes[Math.floor(Math.random() * culiacanQuotes.length)];
        joaquinComment = `Gracias por tu benevolente contribución de ${amount} bits, @${user}. Eso ${randomQuote}`;
        break;
      }

      default:
        discount = 0;
        break;
    }

    let newPrice = currentPrice - discount;
    let specialEvent: { name: string; amount: number } | null = null;

    if (discount > 0) {
      if (currentLevel.event && newPrice <= currentLevel.event.triggerPrice) {
        newPrice -= currentLevel.event.amount;
        specialEvent = {
          name: currentLevel.event.name,
          amount: currentLevel.event.amount,
        };
      }

      if (newPrice < minPrice) {
        newPrice = minPrice;
      }

      await redis.set("auction_price", newPrice);

      if (user && user !== "Admin") {
        await redis.zincrby("auction_top", discount, user);
        await redis.set("auction_last_hit", user);
      }
    }

    const newLevel = getCurrentLevel(newPrice);

    const logEntry = {
      admin:
        type === "BITS_TROLL"
          ? "Sistema/Joaquín"
          : twitchToken
            ? "Sistema/Twitch"
            : session?.user?.name || "Admin",
      action: type,
      amount: discount,
      user: user || "Anónimo",
      timestamp: new Date().toISOString(),
    };

    await redis.lpush("admin_logs", JSON.stringify(logEntry));
    await redis.ltrim("admin_logs", 0, 19);

    if (joaquinComment) {
      await pusherServer.trigger("auction-channel", "joaquin-troll", {
        message: joaquinComment,
      });
    }

    await pusherServer.trigger("auction-channel", "price-update", {
      newPrice,
      user: user || "Anónimo",
      type,
      amount: discount,
      levelName: newLevel.name,
      specialEvent,
    });

    await pusherServer.trigger("auction-channel", "admin-log-update", logEntry);

    try {
      await fetch(`${process.env.NEXTAUTH_URL}/api/joaquin/sync-auction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPrice,
          user: user || "Anónimo",
          type,
          amount: discount,
          levelName: newLevel.name,
          specialEvent,
        }),
      });
    } catch (syncError) {
      console.error("Error sincronizando joaquin/sync-auction:", syncError);
    }

    return NextResponse.json({
      success: true,
      newPrice,
      level: newLevel.name,
      eventTriggered: !!specialEvent,
    });
  } catch (error) {
    console.error("Error en API Price:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}