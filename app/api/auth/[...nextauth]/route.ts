import NextAuth, { NextAuthOptions } from "next-auth";
import TwitchProvider from "next-auth/providers/twitch";

// 1. Extraemos la configuración a una constante exportable
export const authOptions: NextAuthOptions = {
  providers: [
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "channel:read:subscriptions",
            "bits:read",
            "moderator:read:followers",
          ].join(" "),
        },
      },
    })
  ],
  callbacks: {
    async signIn({ profile }) {
      const userId = profile?.sub;
      if (!userId) return false;

      const ownerId = process.env.AUTHORIZED_TWITCH_ID;
      const modIds = process.env.AUTHORIZED_TWITCH_IDS?.split(',') || [];

      const isOwner = userId === ownerId;
      const isMod = modIds.includes(userId);
      const isAuthorized = isOwner || isMod;

      const userName = (profile as any)?.preferred_username || "Unknown";
      console.log(`[AUTH] Intento: ${userName} | Role: ${isOwner ? 'OWNER' : isMod ? 'MOD' : 'DENIED'} | Acceso: ${isAuthorized}`);
      
      return isAuthorized;
    },
    // Te sugiero agregar este callback para que el ID esté disponible en la sesión
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    }
  },
};

// 2. El handler de NextAuth usa esa constante
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };