import NextAuth from "next-auth";
import TwitchProvider from "next-auth/providers/twitch";

const handler = NextAuth({
  providers: [
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const userId = profile?.sub;
      if (!userId) return false;

      // 1. Obtenemos tu ID (Owner)
      const ownerId = process.env.AUTHORIZED_TWITCH_ID;

      // 2. Obtenemos la lista de IDs (Mods)
      const modIds = process.env.AUTHORIZED_TWITCH_IDS?.split(',') || [];

      // 3. Verificamos si es el dueño O es un moderador autorizado
      const isOwner = userId === ownerId;
      const isMod = modIds.includes(userId);

      const isAuthorized = isOwner || isMod;

      const userName = (profile as any)?.preferred_username || "Unknown";
      console.log(`[AUTH] Intento: ${userName} | Role: ${isOwner ? 'OWNER' : isMod ? 'MOD' : 'DENIED'} | Acceso: ${isAuthorized}`);
      
      return isAuthorized;
    },
  },
});

export { handler as GET, handler as POST };