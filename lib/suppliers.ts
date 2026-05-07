export type Supplier = {
  id: string;
  name: string;
  country: string;
  city: string;
  type: "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";
  rating: number;
  yearsActive: number;
  moq: number;
  unitPrice: number;
  leadTimeDays: number;
  shipMethods: ("Sea" | "Air" | "Express")[];
  certifications: string[];
  riskScore: number;
  fraudFlags: string[];
  matchedProducts: string[];
  capacityUnitsPerMo: number;
  responseHours: number;
  verified: boolean;
};

const seed: Array<[string, string, string, Supplier["type"]]> = [
  ["Shenzhen Bright Co.", "China", "Shenzhen", "Manufacturer"],
  ["Yiwu Trade Hub", "China", "Yiwu", "Wholesaler"],
  ["Hanoi Crafts", "Vietnam", "Hanoi", "Manufacturer"],
  ["Mumbai Goods Ltd.", "India", "Mumbai", "Manufacturer"],
  ["Istanbul Source", "Turkey", "Istanbul", "Wholesaler"],
  ["Tijuana Plastics", "Mexico", "Tijuana", "Manufacturer"],
  ["Guangzhou Electronics", "China", "Guangzhou", "Manufacturer"],
  ["Bandung Textiles", "Indonesia", "Bandung", "Manufacturer"],
  ["Dallas Distribution", "USA", "Dallas", "Distributor"],
  ["Ho Chi Minh Goods", "Vietnam", "Ho Chi Minh", "Manufacturer"],
  ["Bangkok Direct", "Thailand", "Bangkok", "Wholesaler"],
  ["Karachi Industrial", "Pakistan", "Karachi", "Manufacturer"],
  ["Dropship USA Net", "USA", "Los Angeles", "Dropship"],
  ["Eastern Europe Logix", "Poland", "Krakow", "Distributor"],
  ["Tokyo Premium Mfg.", "Japan", "Tokyo", "Manufacturer"],
];

const allCerts = ["BSCI", "ISO 9001", "FDA", "CE", "RoHS", "FSC", "OEKO-TEX"];
const products = [
  "Portable Blender Cup",
  "Pet Hair Remover Roller",
  "LED Strip Lights",
  "Smart Water Bottle",
  "Massage Gun",
  "Wireless Earbuds Pro",
  "Heated Eye Mask",
  "Workout Resistance Bands",
];

const fraudPool = [
  "MOQ inconsistent across listings",
  "New domain (<6 months)",
  "Mismatched factory address",
  "Negative review burst",
  "Photos copied from another supplier",
];

export const SUPPLIERS: Supplier[] = seed.map(([name, country, city, type], i) => {
  const risk = (i % 4 === 3) ? 70 + (i % 18) : 5 + (i % 22);
  return {
    id: `s${i + 1}`,
    name,
    country,
    city,
    type,
    rating: +(3.6 + ((i * 0.13) % 1.4)).toFixed(1),
    yearsActive: 1 + (i % 14),
    moq: [50, 100, 200, 500, 1000][i % 5],
    unitPrice: +(2.4 + ((i * 0.7) % 12)).toFixed(2),
    leadTimeDays: 7 + (i % 28),
    shipMethods: (["Sea", "Air", "Express"] as const).filter((_, k) => (i + k) % 2 === 0).slice(0, 2 + (i % 2)) as Supplier["shipMethods"],
    certifications: allCerts.filter((_, k) => (i + k) % 3 === 0).slice(0, 2 + (i % 3)),
    riskScore: risk,
    fraudFlags: risk > 60 ? [fraudPool[i % fraudPool.length], fraudPool[(i + 2) % fraudPool.length]] : [],
    matchedProducts: [
      products[i % products.length],
      products[(i + 2) % products.length],
    ],
    capacityUnitsPerMo: 5000 + ((i * 1377) % 80000),
    responseHours: 1 + (i % 36),
    verified: i % 4 !== 3,
  };
});
