// @/lib/mercadolibre.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getValidMLToken() {
  // 1. Intentamos obtener el token actual de Redis
  let accessToken = await redis.get<string>('ml_access_token');
  const refreshToken = await redis.get<string>('ml_refresh_token');

  if (!accessToken && refreshToken) {
    console.log("🔄 Access Token expirado. Iniciando renovación con Refresh Token...");
    
    try {
      const response = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.ML_CLIENT_ID!,
          client_secret: process.env.ML_CLIENT_SECRET!,
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();

      if (data.access_token) {
        // 2. Guardamos los NUEVOS tokens en Redis
        // El access_token suele durar 6 horas (21600 seg), le damos un margen de error
        await redis.set('ml_access_token', data.access_token, { ex: 20000 }); 
        await redis.set('ml_refresh_token', data.refresh_token); // El refresh no expira pronto
        
        console.log("✅ Tokens renovados exitosamente.");
        return data.access_token;
      }
    } catch (error) {
      console.error("❌ Error fatal renovando token de ML:", error);
      return null;
    }
  }

  return accessToken;
}