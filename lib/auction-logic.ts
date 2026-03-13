// lib/auction-logic.ts

export type DiscountLevel = {
  name: string;
  minPrice: number;
  maxPrice: number;
  rates: {
    sub: number;       // Tier 1
    prime: number;     // 👈 Nueva tasa para Prime
    bits100: number;
    bits500: number;
    bits1000: number;
  };
  event?: {
    name: string;
    amount: number;
    triggerPrice: number;
  };
};

export const AUCTION_LEVELS: DiscountLevel[] = [
  {
    name: "BASE",
    minPrice: 1101,
    maxPrice: 1200,
    rates: { sub: 20, prime: 10, bits100: 15, bits500: 60, bits1000: 120 }
  },
  {
    name: "NIVEL 1",
    minPrice: 1001,
    maxPrice: 1100,
    rates: { sub: 25, prime: 12, bits100: 18, bits500: 70, bits1000: 140 },
    event: { name: "EVENTO SALVAJE", amount: 80, triggerPrice: 1000 }
  },
  {
    name: "NIVEL 2",
    minPrice: 901,
    maxPrice: 1000,
    rates: { sub: 30, prime: 15, bits100: 20, bits500: 85, bits1000: 170 }
  },
  {
    name: "NIVEL 3",
    minPrice: 801,
    maxPrice: 900,
    rates: { sub: 40, prime: 20, bits100: 25, bits500: 100, bits1000: 200 },
    event: { name: "DESCUENTO LEGENDARIO", amount: 150, triggerPrice: 800 }
  },
  {
    name: "MODO FINAL",
    minPrice: 200,
    maxPrice: 800,
    rates: { sub: 50, prime: 25, bits100: 30, bits500: 120, bits1000: 240 }
  }
];

export const getCurrentLevel = (price: number) => {
  return AUCTION_LEVELS.find(lvl => price >= lvl.minPrice && price <= lvl.maxPrice) || AUCTION_LEVELS[AUCTION_LEVELS.length - 1];
};