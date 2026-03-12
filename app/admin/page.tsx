"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Los Hooks SIEMPRE van al principio
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/twitch/status");
        const data = await res.json();
        setIsLive(data.isLive);
      } catch (error) {
        console.error("Error checking Twitch status");
      } finally {
        setLoading(false);
      }
    }
    
    // Solo ejecutamos si la sesión ya cargó
    if (status !== "loading") {
      checkStatus();
    }
    
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [status]); // Ejecutar cuando el status cambie

  const isOwner = 
    session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL || 
    (session as any)?.user?.id === process.env.NEXT_PUBLIC_OWNER_ID;

  const handleDiscount = async (amount: number) => {
    if (!isLive && !isOwner) return;

    try {
      const response = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (response.ok) {
        console.log(`Descuento de $${amount} aplicado`);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  // 2. El "return" preventivo va DESPUÉS de todos los Hooks
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-brand-cyan font-mono">
        VERIFYING_AUTHORITY...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-8 font-mono">
      <div className="flex justify-between items-center mb-12 border-b border-brand-purple/20 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-purple">STREAM_COMMAND_CENTER</h1>
          <p className="text-xs text-brand-cyan">OPERATOR: {session?.user?.name?.toUpperCase()}</p>
        </div>
        <button onClick={() => signOut()} className="text-[10px] border border-red-500/50 px-4 py-1 rounded hover:bg-red-500/10 transition-all">
          TERMINATE_SESSION
        </button>
      </div>

      {!isLive && !isOwner && !loading && (
        <div className="mb-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-center animate-pulse">
          <p className="text-red-400 text-sm font-bold">⚠️ SISTEMA BLOQUEADO: Esperando a que LuisHongo inicie stream...</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`transition-all duration-500 ${!isLive && !isOwner ? "opacity-30 grayscale pointer-events-none" : "opacity-100"}`}>
          <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md shadow-glow-purple">
            <h2 className="text-sm mb-6 text-brand-cyan tracking-widest">REVERSE_AUCTION_CONTROL</h2>
            <div className="flex flex-col gap-4">
              <button onClick={() => handleDiscount(30)} className="w-full py-4 bg-brand-purple/20 border border-brand-purple rounded-lg hover:bg-brand-purple/40 transition-all font-bold text-lg">
                SUB_DETECTED (-$30 MXN)
              </button>
              <button onClick={() => handleDiscount(15)} className="w-full py-4 bg-brand-cyan/20 border border-brand-cyan rounded-lg hover:bg-brand-cyan/40 transition-all font-bold text-lg text-brand-cyan">
                BITS_DETECTED (-$15 MXN)
              </button>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="bg-black/40 border border-orange-500/30 p-6 rounded-xl backdrop-blur-md shadow-[0_0_20px_rgba(234,88,12,0.1)]">
            <h2 className="text-sm mb-6 text-orange-500 tracking-widest">MERCADO_LIBRE_FINALIZER</h2>
            <p className="text-[10px] text-gray-500 mb-6 italic">Solo tú puedes ver este panel de finalización.</p>
            <button className="w-full py-6 bg-orange-600/20 border border-orange-500 rounded-lg hover:bg-orange-600/40 transition-all font-bold text-orange-500" onClick={() => alert("Mañana conectaremos esta API con ML")}>
              FINALIZAR Y PUBLICAR EN ML
            </button>
          </div>
        )}

        <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md">
          <h2 className="text-sm mb-6 text-brand-cyan tracking-widest">MARKETING_LINKS</h2>
          <div className="space-y-4">
            <div className="text-[10px] text-gray-500">INSTANT_GAMING_AFFILIATE</div>
            <input readOnly value="https://www.instant-gaming.com/?igr=LuisHongo" className="w-full bg-black/60 border border-white/10 p-2 text-xs rounded text-gray-400" />
          </div>
        </div>
      </div>
    </main>
  );
}