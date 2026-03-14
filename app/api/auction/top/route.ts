import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    // En Upstash Redis SDK, se usa zrange con la opción 'rev'
    // Esto equivale al comando ZREVRANGE de Redis nativo
    const rawTop = await redis.zrange("auction_top", 0, 9, { 
      rev: true, 
      withScores: true 
    });

    // Upstash devuelve los datos de forma más amigable: ["User1", 100, "User2", 50...]
    const formattedTop = [];
    for (let i = 0; i < rawTop.length; i += 2) {
      formattedTop.push({
        user: rawTop[i] as string,
        score: Math.abs(Number(rawTop[i + 1])), // Usamos Math.abs por si los guardaste como negativos
      });
    }

    return NextResponse.json({ success: true, top: formattedTop });
  } catch (error) {
    console.error("Error fetching Top Ranking:", error);
    return NextResponse.json({ success: false, top: [] }, { status: 500 });
  }
}