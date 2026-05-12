export type Buyer = {
  id: string;
  company: string;
  type:
    | "Retail Chain"
    | "E-commerce Brand"
    | "Distributor"
    | "Boutique"
    | "Pet Store"
    | "Online Store"
    | "Wholesaler"
    | "Marketplace Seller";
  industry: string;
  location: string;
  country: "USA" | "Canada" | "UK" | "Germany" | "Australia" | "Japan";
  intentScore: number;
  revenue: string;
  employees: string;
  website: string;
  decisionMaker: string;
  decisionMakerTitle: string;
  email: string;
  // Optional E.164 phone. Lead → buyer promotion carries this through;
  // older buyer records (sample data, agent-discovered) leave it unset.
  // Surfaces as a click-to-call action on /buyers and /tasks.
  phone?: string;
  linkedin: string;
  lastActivity: string;
  status: "New" | "Contacted" | "Replied" | "Negotiating" | "Closed Won" | "Closed Lost";
  fit: number;
  matchedProducts: string[];
};

const seed: Array<[string, Buyer["type"], string, string, Buyer["country"]]> = [
  ["FitLife Stores", "Retail Chain", "Sports & Wellness", "New York, USA", "USA"],
  ["ActiveGear Co.", "E-commerce Brand", "Sports & Outdoors", "Los Angeles, USA", "USA"],
  ["Global Wholesale Inc.", "Distributor", "Multi-category", "Miami, USA", "USA"],
  ["Urban Essentials", "Online Store", "Home Goods", "Chicago, USA", "USA"],
  ["Petopia Boutique", "Pet Store", "Pet Supplies", "Austin, USA", "USA"],
  ["NorthPaw Pets", "Pet Store", "Pet Supplies", "Toronto, Canada", "Canada"],
  ["GlowUp Beauty", "E-commerce Brand", "Beauty & Care", "London, UK", "UK"],
  ["KitchenCraft Direct", "Distributor", "Home & Kitchen", "Manchester, UK", "UK"],
  ["BrightHome Living", "Boutique", "Home Decor", "Berlin, Germany", "Germany"],
  ["TechWorld Hub", "Marketplace Seller", "Electronics", "Tokyo, Japan", "Japan"],
  ["Outback Gear", "Retail Chain", "Sports & Outdoors", "Sydney, Australia", "Australia"],
  ["MamaBear Co.", "E-commerce Brand", "Baby", "Portland, USA", "USA"],
  ["Harvest Pantry", "Online Store", "Home & Kitchen", "Seattle, USA", "USA"],
  ["Drive Smart Auto", "Marketplace Seller", "Auto", "Detroit, USA", "USA"],
  ["Wellness Tribe", "Boutique", "Beauty & Care", "San Diego, USA", "USA"],
  ["Cobalt Office Supply", "Wholesaler", "Office", "Dallas, USA", "USA"],
  ["Nimbus Bedding", "E-commerce Brand", "Home Goods", "Atlanta, USA", "USA"],
  ["Ridgeline Outdoors", "Retail Chain", "Sports & Outdoors", "Denver, USA", "USA"],
  ["Lumen Living", "Boutique", "Home Decor", "Boston, USA", "USA"],
  ["Hydra Bottle Co.", "E-commerce Brand", "Sports & Outdoors", "Phoenix, USA", "USA"],
  ["Pawfect Pantry", "Pet Store", "Pet Supplies", "Vancouver, Canada", "Canada"],
  ["Aurora Cosmetics", "Marketplace Seller", "Beauty & Care", "Paris-style EU", "Germany"],
  ["The Cozy Nest", "Boutique", "Baby", "Bristol, UK", "UK"],
  ["Trailhead Supply", "Distributor", "Sports & Outdoors", "Salt Lake City, USA", "USA"],
  ["Greenhouse Goods", "Online Store", "Home Decor", "Austin, USA", "USA"],
  ["FastLane Auto Parts", "Wholesaler", "Auto", "Houston, USA", "USA"],
  ["MiniMakers Toys", "Online Store", "Toys & Games", "Brooklyn, USA", "USA"],
  ["Soft Seoul Skin", "E-commerce Brand", "Beauty & Care", "Tokyo, Japan", "Japan"],
  ["Loom & Thread", "Boutique", "Home Decor", "Edinburgh, UK", "UK"],
  ["Sundial Outdoors", "Retail Chain", "Sports & Outdoors", "Brisbane, Australia", "Australia"],
  ["Pawsh Pet Lounge", "Pet Store", "Pet Supplies", "Calgary, Canada", "Canada"],
  ["Zenith Fitness Co", "E-commerce Brand", "Sports & Outdoors", "Miami, USA", "USA"],
  ["Plug-and-Play Tech", "Marketplace Seller", "Electronics", "San Francisco, USA", "USA"],
  ["Hearth & Hand Co.", "Boutique", "Home Goods", "Nashville, USA", "USA"],
  ["FoxRiver Wholesale", "Wholesaler", "Multi-category", "Minneapolis, USA", "USA"],
  ["Quickship Mart", "Marketplace Seller", "Home & Kitchen", "Las Vegas, USA", "USA"],
  ["LumiCare Beauty", "E-commerce Brand", "Beauty & Care", "Hamburg, Germany", "Germany"],
  ["Trail Tribe Pets", "Online Store", "Pet Supplies", "Melbourne, Australia", "Australia"],
  ["Jet Set Travel Co.", "E-commerce Brand", "Travel Gear", "JFK NYC, USA", "USA"],
  ["Studio Eight Décor", "Boutique", "Home Decor", "Chicago, USA", "USA"],
  ["Frontline Auto Group", "Retail Chain", "Auto", "Phoenix, USA", "USA"],
  ["Cradle & Co.", "E-commerce Brand", "Baby", "Austin, USA", "USA"],
  ["Wholesome Pet Co.", "Distributor", "Pet Supplies", "Kansas City, USA", "USA"],
  ["Aether Audio", "Marketplace Seller", "Electronics", "Osaka, Japan", "Japan"],
  ["Polished Office Co.", "Wholesaler", "Office", "Charlotte, USA", "USA"],
  ["Luna Linens", "E-commerce Brand", "Home Goods", "Provo, USA", "USA"],
  ["GoFetch Pet Mart", "Pet Store", "Pet Supplies", "Ottawa, Canada", "Canada"],
  ["Rhythm Sports", "Retail Chain", "Sports & Outdoors", "Liverpool, UK", "UK"],
  ["Crisp Greens Living", "Boutique", "Home Decor", "Portland, USA", "USA"],
  ["Vibrant Skin Co.", "E-commerce Brand", "Beauty & Care", "Los Angeles, USA", "USA"],
];

const titles = [
  "Head of Buying",
  "Director of Procurement",
  "Senior Buyer",
  "VP of Merchandising",
  "Chief Buyer",
  "Category Manager",
  "Founder",
  "Operations Lead",
];

const firstNames = [
  "Sarah",
  "Marcus",
  "Priya",
  "Daniel",
  "Aiko",
  "Jordan",
  "Lena",
  "Thomas",
  "Maya",
  "Carlos",
  "Beatrice",
  "Yusuf",
];
const lastNames = [
  "Chen",
  "Patel",
  "Anderson",
  "Brooks",
  "Tanaka",
  "Rivera",
  "Mueller",
  "Schmidt",
  "Kowalski",
  "Romero",
  "Singh",
  "Reyes",
];

const statusCycle: Buyer["status"][] = [
  "New",
  "New",
  "Contacted",
  "Contacted",
  "Replied",
  "Negotiating",
  "Closed Won",
  "Closed Lost",
];

const products = [
  "Portable Blender Cup",
  "Pet Hair Remover Roller",
  "LED Strip Lights",
  "Massage Gun",
  "Smart Water Bottle",
  "Wireless Earbuds Pro",
  "Yoga Wheel",
  "Heated Eye Mask",
  "Magnetic Eyelashes Kit",
];

export const BUYERS: Buyer[] = seed.map(([company, type, industry, location, country], i) => {
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[(i * 3) % lastNames.length];
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return {
    id: `b${i + 1}`,
    company,
    type,
    industry,
    location,
    country,
    intentScore: 60 + ((i * 13) % 38),
    revenue:
      ["$2-5M", "$5-10M", "$10-25M", "$25-50M", "$50-100M", "$100M+"][i % 6],
    employees: ["11-50", "51-200", "201-500", "501-1k", "1k-5k"][i % 5],
    website: `${slug}.com`,
    decisionMaker: `${fn} ${ln}`,
    decisionMakerTitle: titles[i % titles.length],
    email: `${fn.toLowerCase()}@${slug}.com`,
    linkedin: `linkedin.com/in/${fn.toLowerCase()}-${ln.toLowerCase()}`,
    lastActivity: ["2h ago", "5h ago", "Yesterday", "2 days ago", "1 week ago"][i % 5],
    status: statusCycle[i % statusCycle.length],
    fit: 55 + ((i * 7) % 45),
    matchedProducts: [
      products[i % products.length],
      products[(i + 3) % products.length],
    ],
  };
});

export const BUYER_TYPES: Buyer["type"][] = [
  "Retail Chain",
  "E-commerce Brand",
  "Distributor",
  "Boutique",
  "Pet Store",
  "Online Store",
  "Wholesaler",
  "Marketplace Seller",
];

export const BUYER_COUNTRIES: Buyer["country"][] = [
  "USA",
  "Canada",
  "UK",
  "Germany",
  "Australia",
  "Japan",
];

export const BUYER_STATUSES: Buyer["status"][] = [
  "New",
  "Contacted",
  "Replied",
  "Negotiating",
  "Closed Won",
  "Closed Lost",
];
