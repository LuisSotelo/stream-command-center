import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const channelName = process.env.TWITCH_CHANNEL || process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";

  if (!clientId || !clientSecret || !channelName) {
    return NextResponse.json(
      { isLive: false, connection: "OFFLINE", error: "Missing config" },
      { status: 500 }
    );
  }

  try {
    // 1. Obtener App Access Token
    const authResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      {
        method: "POST",
        cache: "no-store",
      }
    );

    if (!authResponse.ok) {
      const authError = await authResponse.text();
      console.error("Twitch auth error:", authError);

      return NextResponse.json(
        { isLive: false, connection: "ERROR_AUTH" },
        { status: 200 }
      );
    }

    const authData = await authResponse.json();
    const token = authData.access_token;

    if (!token) {
      console.error("Twitch auth returned no access_token");
      return NextResponse.json(
        { isLive: false, connection: "ERROR_AUTH" },
        { status: 200 }
      );
    }

    // 2. Consultar si el canal está LIVE
    const streamResponse = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelName)}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    if (!streamResponse.ok) {
      const streamError = await streamResponse.text();
      console.error("Twitch stream status error:", streamError);

      return NextResponse.json(
        { isLive: false, connection: "ERROR_API" },
        { status: 200 }
      );
    }

    const streamData = await streamResponse.json();
    const isLive = Array.isArray(streamData.data) && streamData.data.length > 0;

    return NextResponse.json({
      isLive,
      connection: "CONNECTED",
    });
  } catch (error) {
    console.error("Twitch Status Error:", error);

    return NextResponse.json(
      {
        isLive: false,
        connection: "OFFLINE",
      },
      { status: 200 }
    );
  }
}