import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function POST() {
  try {
    // Restauramos los valores iniciales
    await redis.set("auction_status", "active");
    await redis.set("auction_price", "1200"); // O tu precio inicial
    await redis.set("stream_game_progress", "0");
    
    // Opcional: Podrías borrar la bandera de precio final si la usaste
    await redis.del("final_price_achieved");

    return NextResponse.json({ success: true, message: "SISTEMA_RESETEADO" });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Error al resetear" }, { status: 500 });
  }
}