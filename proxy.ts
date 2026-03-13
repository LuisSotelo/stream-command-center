import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // Aquí podrías poner lógica extra si quisieras
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Solo autoriza si hay un token (usuario logueado)
        // Podrías incluso validar aquí tu ID de Twitch:
        // return token?.sub === process.env.AUTHORIZED_TWITCH_ID
        return !!token;
      },
    },
    pages: {
      signIn: "/api/auth/signin",
    }
  }
);

export const config = { 
  matcher: ["/admin/:path*","/mod/:path*"] 
};