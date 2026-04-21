import { NextResponse } from "next/server";

async function getAppToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      grant_type: "client_credentials",
    }),
  });

  const data = await res.json();
  return data.access_token as string;
}

async function createSub(token: string, body: any) {
  const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID!,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function POST() {
  const token = await getAppToken();

  const callback = `${process.env.NEXTAUTH_URL}/api/webhooks/twitch`;
  const secret = process.env.TWITCH_WEBHOOK_SECRET!;
  const broadcasterId = process.env.AUTHORIZED_TWITCH_ID!;
  const moderatorId = process.env.AUTHORIZED_TWITCH_ID!;

  const commonTransport = {
    method: "webhook",
    callback,
    secret,
  };

  const results = await Promise.all([
    createSub(token, {
      type: "channel.subscribe",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport: commonTransport,
    }),
    createSub(token, {
      type: "channel.subscription.message",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport: commonTransport,
    }),
    createSub(token, {
      type: "channel.subscription.gift",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport: commonTransport,
    }),
    createSub(token, {
      type: "channel.cheer",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport: commonTransport,
    }),
    createSub(token, {
      type: "channel.follow",
      version: "2",
      condition: {
        broadcaster_user_id: broadcasterId,
        moderator_user_id: moderatorId,
      },
      transport: commonTransport,
    }),
  ]);

  return NextResponse.json({ results });
}