import NextAuth from "next-auth";
import TwitchProvider from "next-auth/providers/twitch";

const handler = NextAuth({
  providers: [
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
    }),
  ],
  // Eliminamos el objeto "pages" para usar las default de NextAuth
  callbacks: {
    async signIn({ profile }) {
      return profile?.sub === process.env.AUTHORIZED_TWITCH_ID;
    },
  },
});

export { handler as GET, handler as POST };