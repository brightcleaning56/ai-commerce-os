export type Listing = {
  id: string;
  product: string;
  emoji: string;
  category: string;
  supplier: string;
  supplierCountry: string;
  supplierVerified: boolean;
  rating: number;
  unitPrice: number;
  moq: number;
  leadTimeDays: number;
  certs: string[];
  inStock: number;
  postedAgo: string;
};

export const LISTINGS: Listing[] = [
  { id: "l1", product: "Portable Blender Cup (USB-C)", emoji: "🥤", category: "Home & Kitchen", supplier: "Shenzhen Bright Co.", supplierCountry: "China", supplierVerified: true, rating: 4.8, unitPrice: 6.4, moq: 500, leadTimeDays: 18, certs: ["BSCI", "FDA"], inStock: 24_000, postedAgo: "2h ago" },
  { id: "l2", product: "Pet Hair Remover Roller", emoji: "🐾", category: "Pet Supplies", supplier: "Yiwu Trade Hub", supplierCountry: "China", supplierVerified: true, rating: 4.6, unitPrice: 4.2, moq: 200, leadTimeDays: 14, certs: ["BSCI"], inStock: 50_000, postedAgo: "5h ago" },
  { id: "l3", product: "LED Strip Lights 5m", emoji: "✨", category: "Home Decor", supplier: "Guangzhou Electronics", supplierCountry: "China", supplierVerified: true, rating: 4.7, unitPrice: 5.8, moq: 100, leadTimeDays: 12, certs: ["CE", "RoHS"], inStock: 12_400, postedAgo: "Yesterday" },
  { id: "l4", product: "Smart Water Bottle 32oz", emoji: "💧", category: "Sports & Outdoors", supplier: "Hanoi Crafts", supplierCountry: "Vietnam", supplierVerified: true, rating: 4.5, unitPrice: 9.6, moq: 250, leadTimeDays: 22, certs: ["FDA", "BPA-Free"], inStock: 8_200, postedAgo: "3d ago" },
  { id: "l5", product: "Workout Resistance Bands (Set)", emoji: "💪", category: "Sports & Outdoors", supplier: "Mumbai Goods Ltd.", supplierCountry: "India", supplierVerified: true, rating: 4.6, unitPrice: 3.9, moq: 500, leadTimeDays: 25, certs: ["OEKO-TEX"], inStock: 36_000, postedAgo: "1h ago" },
  { id: "l6", product: "Heated Eye Mask USB", emoji: "😴", category: "Beauty & Personal Care", supplier: "Bandung Textiles", supplierCountry: "Indonesia", supplierVerified: false, rating: 4.2, unitPrice: 7.1, moq: 300, leadTimeDays: 28, certs: ["CE"], inStock: 9_800, postedAgo: "6h ago" },
];

export type RFQ = {
  id: string;
  buyer: string;
  buyerType: string;
  product: string;
  qty: number;
  targetUnit: number;
  budget: number;
  deliverBy: string;
  region: string;
  responses: number;
  status: "Open" | "In Review" | "Awarded" | "Closed";
  postedAgo: string;
};

export const RFQS: RFQ[] = [
  { id: "r1", buyer: "FitLife Stores", buyerType: "Retail Chain", product: "Workout Resistance Bands (Set)", qty: 5_000, targetUnit: 4.5, budget: 22_500, deliverBy: "Jul 12, 2024", region: "USA East Coast", responses: 8, status: "Open", postedAgo: "1h ago" },
  { id: "r2", buyer: "ActiveGear Co.", buyerType: "E-commerce Brand", product: "Smart Water Bottle 32oz", qty: 1_200, targetUnit: 11.0, budget: 13_200, deliverBy: "Jun 20, 2024", region: "USA West Coast", responses: 4, status: "In Review", postedAgo: "Yesterday" },
  { id: "r3", buyer: "Petopia Boutique", buyerType: "Pet Store", product: "Pet Hair Remover Roller", qty: 800, targetUnit: 5.5, budget: 4_400, deliverBy: "Jul 01, 2024", region: "USA", responses: 11, status: "Open", postedAgo: "3h ago" },
  { id: "r4", buyer: "GlowUp Beauty", buyerType: "E-commerce Brand", product: "Heated Eye Mask USB", qty: 1_500, targetUnit: 8.5, budget: 12_750, deliverBy: "Aug 04, 2024", region: "UK", responses: 5, status: "Open", postedAgo: "30m ago" },
  { id: "r5", buyer: "Cobalt Office Supply", buyerType: "Wholesaler", product: "Standing Desk Converter", qty: 200, targetUnit: 95.0, budget: 19_000, deliverBy: "Jun 15, 2024", region: "USA", responses: 3, status: "Awarded", postedAgo: "2d ago" },
  { id: "r6", buyer: "MamaBear Co.", buyerType: "E-commerce Brand", product: "Baby White Noise Machine", qty: 600, targetUnit: 12.0, budget: 7_200, deliverBy: "Jul 08, 2024", region: "USA", responses: 6, status: "Open", postedAgo: "4h ago" },
];

export type Order = {
  id: string;
  buyer: string;
  supplier: string;
  product: string;
  qty: number;
  amount: number;
  fee: number;
  feeRate: number;
  escrowStatus: "Funded" | "In Transit" | "Delivered" | "Released";
  paymentMethod: "ACH" | "Wire" | "Card" | "Trade Finance";
  placedAt: string;
};

export const ORDERS: Order[] = [
  { id: "o1", buyer: "MamaBear Co.", supplier: "Bandung Textiles", product: "Baby White Noise Machine", qty: 600, amount: 8_900, fee: 178, feeRate: 0.02, escrowStatus: "Released", paymentMethod: "ACH", placedAt: "May 14, 2024" },
  { id: "o2", buyer: "Wellness Tribe", supplier: "Mumbai Goods Ltd.", product: "Massage Gun", qty: 400, amount: 16_200, fee: 324, feeRate: 0.02, escrowStatus: "Delivered", paymentMethod: "Wire", placedAt: "May 12, 2024" },
  { id: "o3", buyer: "FitLife Stores", supplier: "Mumbai Goods Ltd.", product: "Workout Resistance Bands", qty: 5_000, amount: 24_500, fee: 490, feeRate: 0.02, escrowStatus: "In Transit", paymentMethod: "Trade Finance", placedAt: "May 21, 2024" },
  { id: "o4", buyer: "ActiveGear Co.", supplier: "Hanoi Crafts", product: "Smart Water Bottle", qty: 1_200, amount: 18_200, fee: 364, feeRate: 0.02, escrowStatus: "Funded", paymentMethod: "ACH", placedAt: "May 24, 2024" },
  { id: "o5", buyer: "GlowUp Beauty", supplier: "Bandung Textiles", product: "Heated Eye Mask", qty: 1_500, amount: 22_500, fee: 562, feeRate: 0.025, escrowStatus: "In Transit", paymentMethod: "Wire", placedAt: "May 18, 2024" },
  { id: "o6", buyer: "Petopia Boutique", supplier: "Yiwu Trade Hub", product: "Pet Hair Remover Roller", qty: 800, amount: 9_800, fee: 196, feeRate: 0.02, escrowStatus: "Delivered", paymentMethod: "Card", placedAt: "May 16, 2024" },
];

export type ActivityEvent = {
  ago: string;
  text: string;
  amount?: number;
  tone: "brand" | "green" | "amber" | "blue";
};

export const ACTIVITY: ActivityEvent[] = [
  { ago: "Just now", text: "FitLife Stores funded escrow for $24,500 order", amount: 24_500, tone: "green" },
  { ago: "2m", text: "Yiwu Trade Hub responded to RFQ #r3 with $5.40/unit quote", tone: "blue" },
  { ago: "8m", text: "GlowUp Beauty shipment cleared customs (Order #o5)", tone: "amber" },
  { ago: "14m", text: "New listing: 'Reusable Beeswax Wraps' from Hanoi Crafts", tone: "brand" },
  { ago: "22m", text: "ActiveGear Co. opened RFQ for 1,200 units of Smart Water Bottle", tone: "blue" },
  { ago: "35m", text: "Order #o2 marked Delivered — escrow auto-release in 7d", tone: "green" },
  { ago: "1h", text: "Mumbai Goods Ltd. accepted MamaBear Co. PO at agreed terms", tone: "green" },
  { ago: "1h", text: "Risk Agent flagged unverified supplier on listing #l6", tone: "amber" },
];
