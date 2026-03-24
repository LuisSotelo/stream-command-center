// /app/api/brainrot/trigger/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

const REDIS_KEY = "brainrot_playlist";
const COOLDOWN_KEY = "brainrot_cooldown";
const COOLDOWN_TIME = 180; // 3 minutos de cooldown entre videos

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cooldownActive = await redis.get(COOLDOWN_KEY);
  if (cooldownActive) {
    const ttl = await redis.ttl(COOLDOWN_KEY);
    return NextResponse.json({ error: "Cooldown", remaining: ttl }, { status: 429 });
  }

  const playlist = await redis.lrange(REDIS_KEY, 0, -1);
  if (playlist.length === 0) return NextResponse.json({ error: "Playlist vacía" }, { status: 400 });
  
  const randomVideo = playlist[Math.floor(Math.random() * playlist.length)];
  const adminName = session.user?.name || "Mod";

  // 1. DISPARAR EVENTO
  await pusherServer.trigger("game-channel", "trigger-brainrot", {
    videoUrl: randomVideo,
  });

  await pusherServer.trigger("auction-channel", "joaquin-troll", {
    message: `🤖 [AVISO]: Detectando niveles bajos de atención. Activando Protocolo de Retención Cerebral Subóptimo. Miren el video de Subway Surfers o Minecraft parkour y no se me distraigan, mortales. 🐽`,
    });

  // 2. LOG DE ACTIVIDAD (Consistencia)
  const logEntry = {
    admin: adminName,
    action: `BRAINROT_ACTIVATED: ${randomVideo.substring(0, 30)}...`,
    timestamp: new Date().toISOString(),
  };
  await redis.lpush("admin_logs", JSON.stringify(logEntry));
  await redis.ltrim("admin_logs", 0, 15);

  // 3. SET COOLDOWN
  await redis.set(COOLDOWN_KEY, "active", { ex: COOLDOWN_TIME });

  return NextResponse.json({ success: true, videoUrl: randomVideo });
}