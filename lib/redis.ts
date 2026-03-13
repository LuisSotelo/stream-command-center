import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Para obtener el progreso actual
export const getGameProgress = async () => {
  const progress = await redis.get("stream_game_progress");
  return progress ? Number(progress) : 0;
};

// Para actualizarlo (Solo si el stream está activo)
export const updateGameProgress = async (newValue: number) => {
  const isLive = await redis.get("is_stream_live");
  if (!isLive) throw new Error("Stream is OFFLINE");
  
  await redis.set("stream_game_progress", newValue);
  return newValue;
};