# 🎮 LuisHongo: Reverse Auction System

[![Deployed on Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white)](https://tu-proyecto.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://twitch.tv/LuisHongo)

> **"Turning Gaming into a Gamified Marketplace."**

Este proyecto es una plataforma full-stack diseñada para gestionar la dinámica de mi regreso a Twitch. Permite a mis moderadores y a la propia API de Twitch controlar el progreso de los juegos y ajustar dinámicamente el precio de venta de mis juegos físicos en tiempo real.

Es un sistema de subasta inversa en tiempo real diseñado para streams de alto impacto. Los espectadores controlan el precio final mediante interacciones directas en Twitch, sincronizando una publicación de **Mercado Libre** en el clímax del evento.

## 🚀 La Dinámica: "Subasta Inversa"
A diferencia de una subasta tradicional donde el precio sube, aquí **la comunidad trabaja unida para bajarlo**.

### Reglas del Juego:
1.  **Precio de Salida:** La subasta inicia en un precio base (ej. $1,200 MXN).
2.  **Mecánica de Descuento:** Cada interacción en el chat de Twitch reduce el precio en tiempo real:
    * **Suscripción Tier 1:** Descuento máximo (impacto alto).
    * **Suscripción Prime:** Descuento justo (impacto medio).
    * **Bits:** Descuento proporcional a la cantidad (100, 500, 1000 bits).
3.  **Fases de Escalamiento:** El sistema detecta el precio y entra en diferentes niveles (Base, Nivel 1, 2, 3 y Modo Final). En cada nivel, los descuentos se vuelven **más agresivos**, premiando la constancia de la comunidad.
4.  **El Clímax:** Al finalizar, el bot libera automáticamente el link de Mercado Libre con el precio final alcanzado.

## 🛠️ Stack Tecnológico
- **Framework:** [Next.js 14+](https://nextjs.org/) (App Router)
- **Database & State:** [Upstash Redis](https://upstash.com/) (Persistencia de datos)
- **Real-time:** [Pusher](https://pusher.com/) (WebSockets para latencia cero entre el Admin y el OBS Overlay).
- **Auth:** [Auth.js (NextAuth)](https://authjs.dev/) con el proveedor de Twitch y **Role-Based Access Control (RBAC)** mediante una White-list de IDs.
- **Animaciones:** [Framer Motion](https://www.framer.com/motion/) para una UI fluida y "vibe coder".
- **Deployment:** [Vercel](https://vercel.com/) (Edge Functions).

## 🏗️ Arquitectura del Sistema

```mermaid
graph TD
    subgraph Clients [Vistas de Usuario]
        A[Landing Page]
        B[OBS Overlay]
        C[Admin Dashboard]
    end

    subgraph RealTime [Sincronización]
        D((Pusher WebSockets))
    end

    subgraph Backend [Next.js API Routes]
        E[Price Engine]
        F[Auction Logic]
        G[Auth Middleware]
    end

    subgraph External [Integraciones Externas]
        H[Twitch Helix/TMI]
        I[Mercado Libre API]
    end

    subgraph Storage [Persistencia]
        J[(Upstash Redis)]
    end

    %% Flujos
    C -->|Acción: Descuento/Reset| E
    E -->|Actualiza Estado| J
    E -->|Dispara Evento| D
    D -->|Update Real-time| A
    D -->|Update Real-time| B
    H -->|Chat Events| C
    I <-->|Sync Price/Link| E
