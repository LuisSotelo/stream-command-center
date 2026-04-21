import { NextResponse } from "next/server";

async function getAppToken(clientId: string, clientSecret: string) {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error("Error getting Twitch token");
  }

  return data.access_token as string;
}

export async function GET() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const channelName =
    process.env.TWITCH_CHANNEL ||
    process.env.NEXT_PUBLIC_TWITCH_CHANNEL ||
    "LuisHongo";

  if (!clientId || !clientSecret || !channelName) {
    return NextResponse.json(
      { connection: "OFFLINE", error: "Missing config" },
      { status: 500 }
    );
  }

  try {
    const token = await getAppToken(clientId, clientSecret);

    // 🔹 1. LIVE STATUS
    const streamRes = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelName)}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const streamData = await streamRes.json();
    const isLive = Array.isArray(streamData.data) && streamData.data.length > 0;

    // 🔹 2. EVENTSUB STATUS
    const eventSubRes = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const eventSubData = await eventSubRes.json();

    const subs = eventSubData.data || [];

    const enabled = subs.filter((s: any) => s.status === "enabled");
    const pending = subs.filter((s: any) =>
      s.status.includes("pending")
    );

    return NextResponse.json({
      connection: "CONNECTED",
      isLive,

      eventsub: {
        total: subs.length,
        enabled: enabled.length,
        pending: pending.length,
        ok: enabled.length > 0,
      },
    });
  } catch (error) {
    console.error("Twitch Status Error:", error);

    return NextResponse.json(
      {
        connection: "OFFLINE",
        isLive: false,
      },
      { status: 200 }
    );
  }
}