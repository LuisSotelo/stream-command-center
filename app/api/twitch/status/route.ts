import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const channelName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL;

  if (!clientId || !clientSecret || !channelName) {
    return NextResponse.json({ isLive: false, error: "Missing config" }, { status: 500 });
  }

  try {
    // 1. Obtener el App Access Token de Twitch (Client Credentials Flow)
    const authResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", cache: 'no-store' }
    );

    const authData = await authResponse.json();
    const token = authData.access_token;

    // 2. Consultar si el canal está LIVE en Helix API
    const streamResponse = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${channelName}`,
      {
        headers: {
          "Client-ID": clientId,
          "Authorization": `Bearer ${token}`,
        },
        cache: 'no-store', // Importante para que no se guarde el estado viejo
      }
    );

    const streamData = await streamResponse.json();

    // Si data tiene elementos, significa que el stream está activo
    const isLive = streamData.data && streamData.data.length > 0;

    return NextResponse.json({ isLive });
  } catch (error) {
    console.error("Twitch Status Error:", error);
    return NextResponse.json({ isLive: false }, { status: 500 });
  }
}