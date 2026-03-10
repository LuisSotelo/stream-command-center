# 🎮 Stream Command Center - LuisHongo

[![Deployed on Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white)](https://tu-proyecto.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://twitch.tv/LuisHongo)

> **"Turning Gaming into a Gamified Marketplace."**

Este proyecto es una plataforma full-stack diseñada para gestionar la dinámica de mi regreso a Twitch. Permite a mis moderadores y a la propia API de Twitch controlar el progreso de los juegos y ajustar dinámicamente el precio de venta de mis juegos físicos en tiempo real.

## 🚀 La Dinámica: "Subasta Inversa"
El sistema monitorea las suscripciones del canal y aplica lógica de descuento inmediata sobre el precio base del juego físico mostrado en pantalla:
- **Sub Nivel 1:** -$30 MXN
- **Sub Prime:** -$15 MXN
- **Hito de Progreso:** Los moderadores pueden ajustar el % de avance de la historia.

## 🛠️ Stack Tecnológico
- **Framework:** [Next.js 14+](https://nextjs.org/) (App Router)
- **Real-time:** [Pusher](https://pusher.com/) (WebSockets para latencia cero entre el Admin y el OBS Overlay).
- **Auth:** [Auth.js (NextAuth)](https://authjs.dev/) con el proveedor de Twitch y **Role-Based Access Control (RBAC)** mediante una White-list de IDs.
- **Animaciones:** [Framer Motion](https://www.framer.com/motion/) para una UI fluida y "vibe coder".
- **Deployment:** [Vercel](https://vercel.com/) (Edge Functions).

## 🏗️ Arquitectura del Sistema

```mermaid
sequenceDiagram
    participant T as Twitch API (EventSub)
    participant V as Vercel API (Next.js)
    participant P as Pusher (WebSocket)
    participant O as OBS Overlay (React)

    T->>V: Webhook: New Subscription
    V->>V: Calculate New Price (-$30 / -$15)
    V->>P: Trigger Event 'price-update'
    P->>O: Update UI in Real-time 