// /app/api/brainrot/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis"; // Tu instancia de Upstash
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

const REDIS_KEY = "brainrot_playlist";

// GET: Para que el Admin muestre la lista actual de videos
export async function GET() {
  const playlist = await redis.lrange(REDIS_KEY, 0, -1);
  return NextResponse.json({ playlist });
}

// POST: Para añadir un nuevo video a la lista
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoUrl } = await req.json();
  if (!videoUrl) return NextResponse.json({ error: "URL vacía" }, { status: 400 });

  // Guardar en la lista de Redis
  await redis.rpush(REDIS_KEY, videoUrl);

  // Loguear la acción (Opcional, reutilizando tu sistema de logs)
  // await redis.lpush("admin_logs", ...);

  return NextResponse.json({ success: true });
}

// DELETE: Para quitar un video (Opcional, para limpieza)
// export async function DELETE(req: Request) { ... }