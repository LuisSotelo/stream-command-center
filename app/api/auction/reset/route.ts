import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";

export async function POST() {
  try {
    // 1. Restauramos valores básicos
    await redis.set("auction_status", "active");
    await redis.set("auction_price", "1200"); 
    await redis.set("stream_game_progress", "0");
    
    // 2. LIMPIEZA DE MEMORIA Y LOGS
    await Promise.all([
      // Borramos el Ranking de Contribuyentes (TOP)
      redis.del("auction_top"),
      
      // Borramos el Backlog de Auditoría (Logs de Administradores)
      // Asegúrate de que este nombre coincida con el que usas en el LPUSH
      redis.del("admin_logs"),
      
      // Borramos el registro del último golpe
      redis.del("auction_last_hit"),

      // Borramos banderas de finalización y links generados
      redis.del("final_price_achieved"),
      redis.del("last_ml_link"),
    ]);

    // 3. LIMPIEZA DE PROTOCOLOS DE SEGURIDAD (CRÍTICO)
    // Borramos el tiempo del último avance para eliminar el cooldown de 10 min
    await redis.del("last_progress_update_time");

    await pusherServer.trigger("game-channel", "reset-cooldown", {
      message: "SISTEMA_REINICIADO"
    });

    return NextResponse.json({ 
          success: true, 
          message: "SISTEMA_RESETEADO_TOTALMENTE",
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error en Hard Reset:", error);
        return NextResponse.json({ 
          success: false, 
          error: "FALLA_EN_PURGA_DE_SISTEMA" 
        }, { status: 500 });
      }
    }