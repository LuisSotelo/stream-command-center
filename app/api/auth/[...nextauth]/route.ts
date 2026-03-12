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
      const authorizedIds = process.env.AUTHORIZED_TWITCH_IDS?.split(',') || [];
      const userId = profile?.sub;

      // Usamos type assertion simple para el log
      const userName = (profile as any)?.preferred_username || "Unknown";

      const isAuthorized = userId ? authorizedIds.includes(userId) : false;

      console.log(`[AUTH] Intento: ${userName} | ID: ${userId} | Permitido: ${isAuthorized}`);
      
      return isAuthorized;
    },
  },
});

export { handler as GET, handler as POST };