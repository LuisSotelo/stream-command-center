// /api/pokemon/team/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { pusherServer } from "@/lib/pusher";

// --- ESTE ES EL QUE TE FALTA O ESTÁ MAL ---
export async function POST(req: Request) {
  try {
    const { team, user } = await req.json();

    // 1. Guardar en Redis (Como string JSON)
    await redis.set("pokemon_team", JSON.stringify(team));

    // 2. Notificar a Pusher
    await pusherServer.trigger("game-channel", "team-update", {
      team: team,
      admin: user
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en POST team:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const data = await redis.get("pokemon_team");
    const team = data
      ? (typeof data === "string" ? JSON.parse(data) : data)
      : Array(6).fill({ name: "Vacío", sprite: "" });

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Error en GET team:", error);
    return NextResponse.json(
      { error: "Failed to load team" },
      { status: 500 }
    );
  }
}