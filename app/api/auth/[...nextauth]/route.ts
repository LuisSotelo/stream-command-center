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
    async signIn({ user, account, profile }) {
      // EL FILTRO DE SEGURIDAD: Solo tu ID de Twitch puede entrar
      // Puedes usar tu email o el ID numérico que definimos en el .env
      if (profile?.sub === process.env.AUTHORIZED_TWITCH_ID) {
        return true;
      }
      return false; // El resto del mundo rebota aquí
    },
  },
  pages: {
    signIn: '/auth/signin', // Luego crearemos una personalizada
    error: '/auth/error',
  },
});

export { handler as GET, handler as POST };