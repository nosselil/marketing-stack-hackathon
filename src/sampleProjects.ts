export type SampleProject = {
  id: string;
  name: string;
  type: string;
  thumbnail: string;
  logo: string;
  url: string;
  summary: string;
  productType: string;
  languageLabel: string;
  vibe: string;
  tone: string;
  tagline: string;
  fonts: string[];
  palette: string[];
  brandColors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    buttonBg: string;
    buttonText: string;
    accentBg: string;
    accentText: string;
  };
  contentStyle: string;
};

export const sampleProjects: SampleProject[] = [
  {
    id: "noctra",
    name: "NOCTRA",
    type: "Dark Luxury Streetwear",
    thumbnail: "/samples/noctra/thumbnail.png",
    logo: "/samples/noctra/logo.png",
    url: "https://noctra.co",
    summary: "Premium streetwear for builders and creators. Dark luxury, minimal, futuristic. Move in silence.",
    productType: "fashion / streetwear",
    languageLabel: "English",
    vibe: "Dark luxury × minimal × futuristic streetwear. Quiet wealth for creators.",
    tone: "Cold, precise, confident, silent power",
    tagline: "Move in silence.",
    fonts: ["Inter Tight", "Satoshi"],
    palette: ["#0A0A0A", "#1F3D2B", "#EDEDED", "#121212"],
    brandColors: {
      primary: "#0A0A0A",
      secondary: "#1F3D2B",
      background: "#0A0A0A",
      text: "#EDEDED",
      buttonBg: "#1F3D2B",
      buttonText: "#EDEDED",
      accentBg: "#1F3D2B18",
      accentText: "#1F3D2B",
    },
    contentStyle: "No smiling models. Editorial, serious faces. Urban night shots, studio shadows. Motion blur, grain, soft noise. No loud logos. Micro branding only.",
  },
  {
    id: "elara",
    name: "ELARA",
    type: "AI Longevity Platform",
    thumbnail: "/samples/elara/thumbnail.png",
    logo: "/samples/elara/logo.png",
    url: "https://elara.health",
    summary: "AI-powered longevity system. Clean, data-driven wellness — zero noise. Live better. Longer.",
    productType: "health / wellness tech",
    languageLabel: "English",
    vibe: "Calm, clinical, premium, effortless. Feels like Apple Health × WHOOP × Notion.",
    tone: "Calm, clinical, premium, effortless",
    tagline: "Live better. Longer.",
    fonts: ["Inter", "Satoshi"],
    palette: ["#0B0B0B", "#22C55E", "#FFFFFF", "#F7F7F7"],
    brandColors: {
      primary: "#0B0B0B",
      secondary: "#22C55E",
      background: "#FFFFFF",
      text: "#0B0B0B",
      buttonBg: "#0B0B0B",
      buttonText: "#FFFFFF",
      accentBg: "#22C55E18",
      accentText: "#22C55E",
    },
    contentStyle: "Large whitespace. Floating glass cards. Very few elements per screen. Smooth fade animations. Data displayed simply, no clutter. Light glassmorphism with subtle shadows.",
  },
  {
    id: "amperix",
    name: "AMPERIX ELECTRIC",
    type: "Local Electrician",
    thumbnail: "/samples/amperix/thumbnail.png",
    logo: "/samples/amperix/logo.png",
    url: "https://amperixelectric.com",
    summary: "Trusted local electrician. Fast, reliable, no-BS service. Residential wiring, panel upgrades, emergency repairs, smart home installs.",
    productType: "local service / trades",
    languageLabel: "English",
    vibe: "Reliable, clean, professional. Trusted local expert, modernized.",
    tone: "Straightforward, honest, skilled, no fluff",
    tagline: "Power done right.",
    fonts: ["Inter", "Montserrat"],
    palette: ["#0A2540", "#FFD60A", "#FFFFFF", "#1C1C1C"],
    brandColors: {
      primary: "#0A2540",
      secondary: "#FFD60A",
      background: "#FFFFFF",
      text: "#1C1C1C",
      buttonBg: "#0A2540",
      buttonText: "#FFFFFF",
      accentBg: "#FFD60A18",
      accentText: "#0A2540",
    },
    contentStyle: "Clean, high contrast. No gradients. Bold shapes. Easy recognition from distance. Real photos of work. Yellow accent lines. Bold text overlays.",
  },
];
