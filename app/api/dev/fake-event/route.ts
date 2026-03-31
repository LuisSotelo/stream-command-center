import { NextResponse } from "next/server";

type FakeEventBody = {
  eventType: "sub" | "prime" | "gift_bomb" | "bits";
  userName?: string;
  amount?: number;
};

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as FakeEventBody;

    const eventType = body.eventType;
    const userName = body.userName?.trim() || "test_user";
    const amount = Number(body.amount || 0);

    let priceType: string;
    let payload: Record<string, unknown>;

    switch (eventType) {
      case "sub":
        priceType = "SUB";
        payload = {
          type: priceType,
          user: userName,
        };
        break;

      case "prime":
        priceType = "PRIME";
        payload = {
          type: priceType,
          user: userName,
        };
        break;

      case "gift_bomb":
        priceType = "GIFT_BOMB";
        payload = {
          type: priceType,
          user: userName,
          amount: amount > 0 ? amount : 5,
        };
        break;

      case "bits": {
        const bits = amount > 0 ? amount : 100;

        let bitsType = "BITS_TROLL";
        if (bits >= 1000) bitsType = "BITS_1000";
        else if (bits >= 500) bitsType = "BITS_500";
        else if (bits >= 100) bitsType = "BITS_100";

        priceType = bitsType;
        payload = {
          type: priceType,
          user: userName,
          amount: bits,
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: "Invalid eventType" },
          { status: 400 },
        );
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const priceRes = await fetch(`${baseUrl}/api/price`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-twitch-secret": process.env.TWITCH_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify(payload),
    });

    const priceData = await priceRes.json();

    if (!priceRes.ok) {
      return NextResponse.json(
        {
          success: false,
          forwardedTo: "/api/price",
          payload,
          priceData,
        },
        { status: priceRes.status },
      );
    }

    return NextResponse.json({
      success: true,
      simulatedEvent: eventType,
      forwardedTo: "/api/price",
      payload,
      priceData,
    });
  } catch (error) {
    console.error("Error en /api/dev/fake-event:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}