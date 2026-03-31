import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getCurrentLevel } from "@/lib/auction-logic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const newPrice = Number(body?.newPrice);
    const user = body?.user || "Anónimo";
    const type = body?.type || "UNKNOWN";
    const amount = Number(body?.amount || 0);
    const levelNameFromBody = body?.levelName || null;
    const specialEvent = body?.specialEvent || null;

    if (Number.isNaN(newPrice)) {
      return NextResponse.json({ error: "Invalid newPrice" }, { status: 400 });
    }

    const derivedLevel = getCurrentLevel(newPrice);
    const newLevelName = levelNameFromBody || derivedLevel.name;

    const previousLevelName = (await redis.get("joaquin_current_level")) || null;
    const nowIso = new Date().toISOString();

    const writes: Promise<unknown>[] = [
      redis.set("joaquin_current_price", newPrice),
      redis.set("joaquin_current_level", newLevelName),
      redis.set("joaquin_last_donation_at", nowIso),
      redis.set("joaquin_last_user", user),
      redis.set("joaquin_last_discount_type", type),
      redis.set("joaquin_last_discount_amount", amount),
    ];

    if (previousLevelName !== newLevelName) {
      writes.push(redis.set("joaquin_last_level_change_at", nowIso));
    }

    if (specialEvent?.name) {
      writes.push(redis.set("joaquin_last_special_event", specialEvent.name));
      writes.push(
        redis.set(
          "joaquin_last_special_event_amount",
          Number(specialEvent.amount || 0),
        ),
      );
    }

    await Promise.all(writes);

    return NextResponse.json({
      success: true,
      synced: true,
      price: newPrice,
      level: newLevelName,
      levelChanged: previousLevelName !== newLevelName,
    });
  } catch (error) {
    console.error("Error en sync-auction:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}