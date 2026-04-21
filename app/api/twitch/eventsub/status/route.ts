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

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing config" },
      { status: 500 }
    );
  }

  try {
    const token = await getAppToken(clientId, clientSecret);

    const res = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const data = await res.json();

    const subs = data.data || [];

    const formatted = subs.map((s: any) => ({
      type: s.type,
      status: s.status,
      version: s.version,
      callback: s.transport?.callback,
      created_at: s.created_at,
    }));

    return NextResponse.json({
      ok: true,
      total: subs.length,

      summary: {
        enabled: subs.filter((s: any) => s.status === "enabled").length,
        pending: subs.filter((s: any) =>
          s.status.includes("pending")
        ).length,
      },

      subscriptions: formatted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}