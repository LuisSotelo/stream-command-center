import { NextResponse } from "next/server";

export async function GET() {
  try {
    const accessToken = process.env.ML_ACCESS_TOKEN;
    const itemId = process.env.ML_ITEM_ID;

    if (!accessToken || !itemId) {
      return NextResponse.json({ status: "MISSING_CONFIG" }, { status: 200 });
    }

    // Hacemos una petición rápida al item solo para validar el Token
    const res = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (res.ok) {
      return NextResponse.json({ status: "CONNECTED" });
    } else {
      return NextResponse.json({ status: "EXPIRED_OR_INVALID" });
    }
  } catch (error) {
    return NextResponse.json({ status: "OFFLINE" });
  }
}