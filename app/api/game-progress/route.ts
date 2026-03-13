import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";

// --- NUEVO MÉTODO GET ---
export async function GET() {
  try {
    // Traemos el valor de Redis
    const progress = await redis.get("stream_game_progress");

    // Retornamos el valor (si no existe en Redis, devolvemos 0)
    return NextResponse.json({ 
      success: true, 
      progress: progress !== null ? Number(progress) : 0 
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    return NextResponse.json({ success: false, progress: 0 }, { status: 500 });
  }
}

// --- TU MÉTODO POST ---
export async function POST(req: Request) {
  try {
    const { progress } = await req.json();

    // 1. Guardar en Redis
    await redis.set("stream_game_progress", progress);

    // 2. Disparar a Pusher
    await pusherServer.trigger("game-channel", "progress-update", {
      progress: progress,
    });

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}