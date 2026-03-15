import { NextResponse } from "next/server";
import { getValidMLToken } from "@/lib/mercadolibre";

export async function GET() {
  try {
    const accessToken = await getValidMLToken();
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
      // Si la respuesta no es OK, es probable que el Refresh Token también haya muerto
      // o el Item ID esté mal. Mandamos el estatus para que el Dashboard se ponga en rojo.
      console.error("ML Status Error:", res.status);
      return NextResponse.json({ status: "AUTH_ERROR", code: res.status });
    }
  } catch (error) {
    console.error("ML Status Error:", error);
    return NextResponse.json({ status: "OFFLINE" });
  }
}