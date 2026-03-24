// /app/api/brainrot/cleanup/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: Request) {
  try {
    const { videoUrl } = await req.json(); // <--- Recibimos qué video se reprodujo

    // 1. Borramos el cooldown
    await redis.del("brainrot_cooldown");

    // 2. ELIMINAMOS EL VIDEO DE LA PLAYLIST (LREM borra el elemento de la lista)
    if (videoUrl) {
      await redis.lrem("brainrot_playlist", 0, videoUrl);
    }

    // 3. Avisamos al Admin que se resetee el cooldown y que la lista cambió
    await pusherServer.trigger("game-channel", "reset-brainrot-cooldown", {});
    
    // Opcional: Avisar al admin que actualice su lista visual
    await pusherServer.trigger("game-channel", "playlist-updated", {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en cleanup:", error);
    return NextResponse.json({ error: "Fail" }, { status: 500 });
  }
}