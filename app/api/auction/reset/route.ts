import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function POST() {
  try {
    // 1. Restauramos valores básicos
    await redis.set("auction_status", "active");
    await redis.set("auction_price", "1200"); 
    await redis.set("stream_game_progress", "0");
    
    // 2. LIMPIEZA DE NUEVAS FUNCIONES
    
    // Borramos el Ranking de Contribuyentes (TOP)
    await redis.del("auction_top");
    
    // Borramos el Backlog de Auditoría (Logs de Administradores)
    await redis.del("admin_logs");
    
    // Borramos el registro del último golpe
    await redis.del("auction_last_hit");

    // Opcional: Borrar banderas de finalización
    await redis.del("final_price_achieved");

    return NextResponse.json({ 
      success: true, 
      message: "SISTEMA_RESETEADO_TOTALMENTE",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error en Hard Reset:", error);
    return NextResponse.json({ success: false, error: "Error al resetear" }, { status: 500 });
  }
}