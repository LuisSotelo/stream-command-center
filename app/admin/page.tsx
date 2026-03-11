"use client";
import { useSession, signOut } from "next-auth/react";

export default function AdminDashboard() {
  const { data: session } = useSession();

  // Función para bajar el precio
  const handleDiscount = async (amount: number) => {
    try {
      const response = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (response.ok) {
        console.log(`Descuento de $${amount} aplicado con éxito`);
      }
    } catch (error) {
      console.error("Error al aplicar descuento:", error);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-8 font-mono">
      {/* Header del Dashboard */}
      <div className="flex justify-between items-center mb-12 border-b border-brand-purple/20 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-purple">STREAM_COMMAND_CENTER</h1>
          <p className="text-xs text-brand-cyan">OPERATOR: {session?.user?.name?.toUpperCase()}</p>
        </div>
        <button 
          onClick={() => signOut()}
          className="text-[10px] border border-red-500/50 px-4 py-1 rounded hover:bg-red-500/10 transition-all"
        >
          TERMINATE_SESSION
        </button>
      </div>

      {/* Grid de Controles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card: Control de Precio */}
        <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md shadow-glow-purple">
          <h2 className="text-sm mb-6 text-brand-cyan tracking-widest">REVERSE_AUCTION_CONTROL</h2>
          
          <div className="flex flex-col gap-4">
            <button 
              onClick={() => handleDiscount(30)}
              className="w-full py-4 bg-brand-purple/20 border border-brand-purple rounded-lg hover:bg-brand-purple/40 transition-all font-bold text-lg active:scale-95">
              SUB_DETECTED (-$30 MXN)
            </button>
            <button 
              onClick={() => handleDiscount(15)}
              className="w-full py-4 bg-brand-cyan/20 border border-brand-cyan rounded-lg hover:bg-brand-cyan/40 transition-all font-bold text-lg text-brand-cyan active:scale-95">
              BITS_DETECTED (-$15 MXN)
            </button>
          </div>
        </div>

        {/* Card: Quick Links */}
        <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md">
          <h2 className="text-sm mb-6 text-brand-cyan tracking-widest">MARKETING_LINKS</h2>
          <div className="space-y-4">
            <div className="text-[10px] text-gray-500 mb-2">INSTANT_GAMING_AFFILIATE</div>
            <input 
              readOnly 
              value="https://www.instant-gaming.com/?igr=LuisHongo"
              className="w-full bg-black/60 border border-white/10 p-2 text-xs rounded text-gray-400"
            />
          </div>
        </div>

      </div>
    </main>
  );
}