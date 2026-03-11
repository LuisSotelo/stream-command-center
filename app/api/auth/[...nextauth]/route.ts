import NextAuth from "next-auth";
import TwitchProvider from "next-auth/providers/twitch";


interface TwitchProfile {
  sub: string;
  preferred_username: string;
  // Usamos el nombre exacto que te arrojó el error
  "https://api.twitch.tv/helix/users/extensions/moderator"?: boolean;
}

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
      // Forzamos a TS a tratar el profile como nuestro TwitchProfile
      const p = profile as unknown as TwitchProfile;

      // Solo tú o tus moderadores de canal pueden entrar
      const isOwner = p?.sub === process.env.MY_TWITCH_ID;
      const isMod = p?.['https://api.twitch.tv/helix/users/extensions/moderator'] === true; 

      console.log(`Intento de login: ${p.preferred_username} | Owner: ${isOwner} | Mod: ${isMod}`);
      
      return isOwner || isMod;
    },
  },
});

export { handler as GET, handler as POST };