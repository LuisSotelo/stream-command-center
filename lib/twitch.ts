export async function isStreamLive() {
  try {
    // Necesitamos un App Access Token de Twitch para consultas rápidas
    const tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    const { access_token } = await tokenResponse.json();

    // Consultamos el estado del stream de tu canal
    const streamResponse = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=LuisHongo`,
      {
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID!,
          "Authorization": `Bearer ${access_token}`,
        },
      }
    );
    const { data } = await streamResponse.json();

    // Si data tiene algo, es que estás LIVE
    return data && data.length > 0;
  } catch (error) {
    console.error("Error checking Twitch status:", error);
    return false;
  }
}