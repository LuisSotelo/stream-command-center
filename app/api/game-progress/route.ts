import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";

export async function GET() {
  try {
    const [progress, lastUpdate] = await Promise.all([
      redis.get("stream_game_progress"),
      redis.get("last_progress_update_time")
    ]);

    const now = Date.now();
    const lastTime = Number(lastUpdate) || 0;
    const COOLDOWN_MS = 10 * 60 * 1000;
    
    // Calculamos si aún hay cooldown activo
    const diff = now - lastTime;
    let remainingMins = 0;
    if (diff < COOLDOWN_MS) {
      remainingMins = Math.ceil((COOLDOWN_MS - diff) / 60000);
    }

    return NextResponse.json({ 
      success: true, 
      progress: progress !== null ? Number(progress) : 0,
      remainingMins: remainingMins // Enviamos esto al Dashboard
    });
  } catch (error) {
    return NextResponse.json({ success: false, progress: 0 }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { progress, admin } = await req.json();
    const now = Date.now();
    const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutos

    // 1. Obtener datos actuales
    const [currentProgress, lastUpdate] = await Promise.all([
      redis.get("stream_game_progress"),
      redis.get("last_progress_update_time")
    ]);

    const oldProg = Number(currentProgress) || 0;
    const lastTime = Number(lastUpdate) || 0;

    // 2. REGLA: Cooldown de 10 minutos
    if (now - lastTime < COOLDOWN_MS) {
      const remainingMins = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 60000);
      return NextResponse.json({ 
        success: false, 
        message: `ALTO AHÍ, NO PODEMOS AVANZAR TAN RÁPIDO. Faltan ${remainingMins} min.` 
      }, { status: 429 });
    }

    // 3. REGLA: Máximo 10% de salto
    const diff = progress - oldProg;
    if (diff > 20) {
      return NextResponse.json({ 
        success: false, 
        message: "ERROR: El avance máximo permitido es del 20% por turno." 
      }, { status: 400 });
    }

    // 4. Guardar y Disparar
    await Promise.all([
      redis.set("stream_game_progress", progress),
      redis.set("last_progress_update_time", now),
      pusherServer.trigger("auction-channel", "admin-log-update", {
        admin: admin || "Mod",
        action: `PROGRESS_UPDATE: ${progress}%`,
        amount: 0,
        timestamp: new Date().toISOString()
      }),
      pusherServer.trigger("game-channel", "progress-update", { progress })
    ]);

    // 5. Guardar el historial de logs en Redis para persistencia al refrescar
    const logEntry = JSON.stringify({
      admin: admin,
      action: `PROGRESS_UPDATE: ${progress}%`,
      timestamp: new Date().toISOString(),
    });
    await redis.lpush("admin_logs", logEntry);
    await redis.ltrim("admin_logs", 0, 49); // Mantenemos los últimos 50

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}