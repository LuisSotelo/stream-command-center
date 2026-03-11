export { default } from "next-auth/middleware";

export const config = { 
  // Protege /admin pero ignora las rutas de auth y api
  matcher: ["/admin/:path*"] 
};