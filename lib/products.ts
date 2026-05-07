export type Product = {
  id: string;
  name: string;
  category: string;
  niche: string;
  emoji: string;
  demandScore: number;
  profit: number;
  cost: number;
  retail: number;
  competition: "Low" | "Medium" | "High";
  potential: "Very High" | "High" | "Medium" | "Low";
  trendVelocity: number;
  searchVolume: number;
  socialScore: number;
  saturation: number;
  countryOrigin: string;
  moq: number;
  shippingDays: number;
  trend14d: number[];
  hashtags: string[];
  sources: string[];
  saved?: boolean;
};

const cats = [
  "Home & Kitchen",
  "Pet Supplies",
  "Beauty & Personal Care",
  "Sports & Outdoors",
  "Electronics",
  "Home Decor",
  "Baby",
  "Auto",
  "Office",
  "Toys & Games",
];

const seedNames: Array<[string, string, string, string]> = [
  ["Portable Blender Cup", "Home & Kitchen", "Kitchen Gadgets", "🥤"],
  ["Pet Hair Remover Roller", "Pet Supplies", "Cat Care", "🐾"],
  ["LED Book Reading Light", "Home Decor", "Lighting", "💡"],
  ["Silicone Food Storage Bags", "Home & Kitchen", "Eco Storage", "🥫"],
  ["Workout Resistance Bands", "Sports & Outdoors", "Home Fitness", "💪"],
  ["Posture Corrector", "Beauty & Personal Care", "Wellness", "🧘"],
  ["Slushie Maker Cup", "Home & Kitchen", "Kitchen Gadgets", "🧋"],
  ["LED Strip Lights", "Home Decor", "Lighting", "✨"],
  ["Pet Grooming Vacuum", "Pet Supplies", "Dog Care", "🐶"],
  ["Portable Ice Maker", "Home & Kitchen", "Kitchen Appliances", "🧊"],
  ["Magnetic Phone Charger", "Electronics", "Phone Accessories", "📱"],
  ["Smart Water Bottle", "Sports & Outdoors", "Hydration", "💧"],
  ["Mini Projector", "Electronics", "AV", "📽️"],
  ["Collapsible Laundry Basket", "Home & Kitchen", "Storage", "🧺"],
  ["Heated Eye Mask", "Beauty & Personal Care", "Sleep", "😴"],
  ["Bluetooth Sleep Headband", "Electronics", "Audio", "🎧"],
  ["Cat Window Perch", "Pet Supplies", "Cat Care", "🐱"],
  ["Yoga Wheel", "Sports & Outdoors", "Yoga", "🧘‍♀️"],
  ["Standing Desk Converter", "Office", "Ergonomics", "🖥️"],
  ["Reusable Beeswax Wraps", "Home & Kitchen", "Eco Storage", "🐝"],
  ["Dog Training Clicker Set", "Pet Supplies", "Dog Care", "🦴"],
  ["UV Phone Sanitizer", "Electronics", "Phone Accessories", "🧼"],
  ["Massage Gun", "Beauty & Personal Care", "Wellness", "💆"],
  ["Electric Wine Opener", "Home & Kitchen", "Bar", "🍷"],
  ["Foldable Bike Helmet", "Sports & Outdoors", "Cycling", "🚴"],
  ["Smart Plant Sensor", "Home Decor", "Garden Tech", "🌱"],
  ["Baby White Noise Machine", "Baby", "Sleep", "👶"],
  ["Magnetic Eyelashes Kit", "Beauty & Personal Care", "Cosmetics", "👁️"],
  ["Car Trunk Organizer", "Auto", "Storage", "🚗"],
  ["Anti-Snore Nose Vents", "Beauty & Personal Care", "Sleep", "🛌"],
  ["Wireless Earbuds Pro", "Electronics", "Audio", "🎵"],
  ["Cat Treat Puzzle", "Pet Supplies", "Cat Care", "🧩"],
  ["Foam Roller Set", "Sports & Outdoors", "Recovery", "🧴"],
  ["Cordless Hair Curler", "Beauty & Personal Care", "Hair", "💇"],
  ["Reusable Coffee Pods", "Home & Kitchen", "Eco Storage", "☕"],
];

const countries = ["China", "Vietnam", "India", "USA", "Mexico", "Turkey"];
const sourcesPool = [
  "TikTok",
  "Instagram",
  "Reddit",
  "Amazon",
  "Etsy",
  "YouTube Shorts",
  "Google Trends",
  "Alibaba",
  "Facebook Ads",
];

function trend(seed: number, len = 14) {
  return Array.from({ length: len }, (_, i) =>
    Math.round(40 + Math.sin(i / 1.6 + seed) * 14 + i * (1 + (seed % 4) * 0.4))
  );
}

function pick<T>(arr: T[], n: number, seed: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[(seed * 7 + i * 11) % arr.length]);
  }
  return Array.from(new Set(out));
}

export const PRODUCTS: Product[] = seedNames.map(([name, category, niche, emoji], i) => {
  const cost = +(4 + (i * 1.7) % 18).toFixed(2);
  const retail = +(cost * (2.4 + ((i * 0.13) % 1.2))).toFixed(2);
  const profit = +(retail - cost - 1.5).toFixed(2);
  const demandScore = 70 + ((i * 13) % 28);
  const competition = (["Low", "Medium", "High"] as const)[
    [0, 1, 0, 1, 2, 0, 1, 0][i % 8]
  ];
  const potential = (["Very High", "High", "Medium", "Low"] as const)[
    Math.min(3, Math.floor((100 - demandScore) / 9))
  ];
  return {
    id: `p${i + 1}`,
    name,
    category,
    niche,
    emoji,
    demandScore,
    profit,
    cost,
    retail,
    competition,
    potential,
    trendVelocity: 30 + ((i * 17) % 290),
    searchVolume: 2000 + ((i * 1377) % 80000),
    socialScore: 55 + ((i * 11) % 45),
    saturation: 20 + ((i * 7) % 70),
    countryOrigin: countries[i % countries.length],
    moq: [1, 50, 100, 200, 500][i % 5],
    shippingDays: 4 + (i % 25),
    trend14d: trend(i),
    hashtags: [
      `#${niche.replace(/\s+/g, "").toLowerCase()}`,
      "#viral",
      "#tiktokmademebuyit",
      `#${category.split(" ")[0].toLowerCase()}`,
    ],
    sources: pick(sourcesPool, 3 + (i % 3), i),
    saved: i % 6 === 0,
  };
});

export const PRODUCT_CATEGORIES = Array.from(
  new Set(seedNames.map(([, c]) => c))
).concat(cats.filter((c) => !seedNames.find(([, sc]) => sc === c))).slice(0, 10);
