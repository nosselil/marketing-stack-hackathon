import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = __dirname;
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const GENERATED_DIR = path.join(PUBLIC_DIR, "generated");
const REMOTION_ENTRY = path.join(PROJECT_ROOT, "remotion", "index.ts");

// Ensure generated directory exists on startup
import { mkdirSync } from "node:fs";
try { mkdirSync(GENERATED_DIR, { recursive: true }); } catch {}

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";
const GEMINI_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || "veo-3.1-generate-preview";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const GEMINI_SITE_DETECTION_MODEL = process.env.GEMINI_SITE_DETECTION_MODEL || "gemini-3-flash-preview";
const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY || null;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY || null;
const KLING_API_BASE_URL = process.env.KLING_API_BASE_URL || "https://api-singapore.klingai.com";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || null;
const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL || "https://api.firecrawl.dev";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SUPPORTED_REFERENCE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const SVG_REFERENCE_IMAGE_TYPES = new Set([
  "image/svg+xml",
]);

// ─── Stripe subscription management ───
import Stripe from "stripe";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Check if a user has an active subscription
async function checkUserSubscription(userId) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return { active: false, plan: null };
  try {
    const res = await fetch(`${url}/rest/v1/user_subscriptions?user_id=eq.${userId}&status=eq.active&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const data = await res.json().catch(() => []);
    if (data && data.length > 0) return { active: true, plan: data[0].plan, stripeCustomerId: data[0].stripe_customer_id };
    return { active: false, plan: null };
  } catch { return { active: false, plan: null }; }
}

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "50mb" }));
app.use("/generated", express.static(GENERATED_DIR));
app.use("/debug", express.static(path.join(PUBLIC_DIR, "debug")));
app.use("/fonts", express.static(path.join(PUBLIC_DIR, "fonts")));
app.use("/thumbnails", express.static(path.join(PUBLIC_DIR, "thumbnails")));

const styleCatalog = [
  {
    id: "minimal-mint",
    name: "Minimal mint",
    description: "Calm, premium, product-first",
    recommended: true,
  },
  {
    id: "soft-editorial",
    name: "Soft editorial",
    description: "Sharper hierarchy, more contrast",
  },
  {
    id: "performance-grid",
    name: "Performance grid",
    description: "Operator-focused, campaign-ready system",
  },
];

const SUPPORTED_PRODUCT_TYPES = [
  "saas",
  "ai tool / automation",
  "developer tools",
  "cybersecurity",
  "marketplace",
  "ecommerce brand",
  "consumer app",
  "telecom / internet provider",
  "fintech / payments",
  "banking / lending",
  "insurance",
  "gaming / entertainment",
  "agency / service business",
  "local service business",
  "legal / law firm",
  "recruiting / staffing",
  "hr / payroll",
  "nonprofit / community",
  "media / content brand",
  "education / coaching",
  "school / university",
  "travel / tourism",
  "real estate / hospitality",
  "events / nightlife",
  "wedding / event services",
  "photography / creative studio",
  "health / wellness",
  "medical clinic",
  "dental / orthodontics",
  "food / beverage brand",
  "restaurant / cafe",
  "bakery / dessert brand",
  "chocolate / confectionery brand",
  "grocery / supermarket",
  "supplements / nutrition",
  "beauty / skincare brand",
  "fashion / apparel brand",
  "jewelry / accessories brand",
  "baby / kids brand",
  "pet brand / pet services",
  "sports / fitness brand",
  "home / furniture brand",
  "hardware / electronics",
  "industrial / manufacturing",
  "construction / trades",
  "plumbing / HVAC",
  "cleaning / maintenance service",
  "solar / energy",
  "agriculture / farming",
  "automotive / mobility",
  "automotive dealership",
  "motorcycle / powersports dealership",
  "boat / marine dealership",
  "mechanic / auto repair",
  "logistics / delivery",
];

const remotionBlueprintCatalog = [
  {
    id: "product-demo",
    label: "Product demo",
    sourcePath: `${REMOTION_TEMPLATE_ROOT}/Product Demo.rtf`,
    appliesTo: ["saas", "consumer app", "ecommerce brand", "marketplace", "telecom / internet provider", "fintech / payments"],
    musicCue: "glossy launch pulse with clean build",
    voiceCharacter: "salesperson",
    iconLibrary: "lucide-react + brand icons",
    sceneStarters: [
      {
        title: "Hook the pain point",
        durationSeconds: 4,
        visual: "Open on the core market problem, then anchor the brand logo and first proof point in the same shot.",
        motion: "Fast headline entrance, orbiting UI fragments, soft background glow.",
        icon: "sparkles",
      },
      {
        title: "Show the product",
        durationSeconds: 5,
        visual: "Reveal the product dashboard or core workflow with screenshots, stat callouts, and one hero action.",
        motion: "Card slides, measured parallax, confident UI zoom.",
        icon: "panels-top-left",
      },
      {
        title: "Land the CTA",
        durationSeconds: 4.5,
        visual: "Close on the logo, site URL, and a clear CTA with one memorable promise.",
        motion: "Soft zoom out, CTA pulse, clean end-card lockup.",
        icon: "arrow-up-right",
      },
    ],
  },
  {
    id: "saas-dashboard",
    label: "SaaS dashboard",
    sourcePath: `${REMOTION_TEMPLATE_ROOT}/sass dashboard.rtf`,
    appliesTo: ["saas", "consumer app"],
    musicCue: "modern product rhythm with restrained tension",
    voiceCharacter: "expert",
    iconLibrary: "lucide-react + product analytics icons",
    sceneStarters: [
      {
        title: "Lead with the stat",
        durationSeconds: 4,
        visual: "Start on one urgent KPI or operator pain stat, framed inside a glass dashboard card.",
        motion: "Counter roll, ring animation, headline wipe.",
        icon: "chart-no-axes-column",
      },
      {
        title: "Tour the interface",
        durationSeconds: 5,
        visual: "Walk through one overview dashboard moment and one feature screen using product screenshots.",
        motion: "3D card tilt, cursor choreography, smart panel transitions.",
        icon: "layout-dashboard",
      },
      {
        title: "Confidence close",
        durationSeconds: 4.5,
        visual: "Finish with logo, URL, and one short promise tied to the KPI improvement.",
        motion: "Layered fade, subtle glow, CTA emphasis.",
        icon: "badge-check",
      },
    ],
  },
  {
    id: "social-service",
    label: "Social media service",
    sourcePath: `${REMOTION_TEMPLATE_ROOT}/Social media Service.rtf`,
    appliesTo: ["agency / service business", "local service business", "education / coaching", "real estate / hospitality", "health / wellness", "media / content brand"],
    musicCue: "warm trust-building pulse with lighter percussion",
    voiceCharacter: "conversational",
    iconLibrary: "lucide-react + service trust icons",
    sceneStarters: [
      {
        title: "Frame the customer pain",
        durationSeconds: 4,
        visual: "Show the messy manual work or customer pressure the service removes, with one human-led proof signal.",
        motion: "Message bubbles, icon cluster, direct hook text.",
        icon: "message-square-text",
      },
      {
        title: "Show the process",
        durationSeconds: 5,
        visual: "Present the service workflow, proof assets, or dashboard handoff that makes the offer credible.",
        motion: "Card swaps, badge reveals, warm editorial pacing.",
        icon: "workflow",
      },
      {
        title: "Trust-first CTA",
        durationSeconds: 4.5,
        visual: "End with logo, URL, and a trust-building promise that feels human rather than hype-driven.",
        motion: "Calm scale, testimonial accent, CTA settle.",
        icon: "shield-check",
      },
    ],
  },
];

const remotionTemplateLibraryCache = new Map();

const GRAPHIC_REFERENCE_DIR = path.join(PROJECT_ROOT, "Botface", "References Graphic posts");
const LIFESTYLE_REFERENCE_DIR = path.join(PROJECT_ROOT, "Botface", "References lifestyle or Product");

app.use("/references/graphic", express.static(GRAPHIC_REFERENCE_DIR));
app.use("/references/lifestyle", express.static(LIFESTYLE_REFERENCE_DIR));
app.use("/samples", express.static(path.join(PUBLIC_DIR, "samples")));

const sessions = new Map();
const sessionContext = new Map();
const heroFrameCache = new Map();

const DEFAULT_TIMEOUT_MS = 8000;

function productTypeBucket(productType) {
  if ([
    "ecommerce brand",
    "health / wellness",
    "medical clinic",
    "dental / orthodontics",
    "food / beverage brand",
    "restaurant / cafe",
    "bakery / dessert brand",
    "chocolate / confectionery brand",
    "grocery / supermarket",
    "supplements / nutrition",
    "beauty / skincare brand",
    "fashion / apparel brand",
    "jewelry / accessories brand",
    "baby / kids brand",
    "pet brand / pet services",
    "sports / fitness brand",
    "home / furniture brand",
    "hardware / electronics",
    "industrial / manufacturing",
    "solar / energy",
    "agriculture / farming",
    "automotive / mobility",
    "automotive dealership",
    "motorcycle / powersports dealership",
    "boat / marine dealership",
    "mechanic / auto repair",
  ].includes(productType)) {
    return "physical";
  }

  if ([
    "agency / service business",
    "local service business",
    "legal / law firm",
    "recruiting / staffing",
    "hr / payroll",
    "nonprofit / community",
    "real estate / hospitality",
    "education / coaching",
    "school / university",
    "travel / tourism",
    "events / nightlife",
    "wedding / event services",
    "photography / creative studio",
    "construction / trades",
    "plumbing / HVAC",
    "cleaning / maintenance service",
    "insurance",
    "logistics / delivery",
  ].includes(productType)) {
    return "service";
  }

  return "digital";
}

function ensureUrl(value) {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function inferProductType(hostname) {
  if (/(ai|gpt|agent|agents|automation|copilot|assistant|workflow)/i.test(hostname)) {
    return "ai tool / automation";
  }

  if (/(dev|developer|api|sdk|cloud|infra|git|deploy|hosting|database)/i.test(hostname)) {
    return "developer tools";
  }

  if (/(security|secure|cyber|vpn|identity|auth|soc|firewall)/i.test(hostname)) {
    return "cybersecurity";
  }

  if (/(ooredoo|orange|vodafone|telecom|telco|internet|fiber|fibre|carrier|sim)/i.test(hostname)) {
    return "telecom / internet provider";
  }

  if (/(flouci|pay|payment|wallet|bank|fintech|checkout|card|currency|currencies|remit|remittance|transfer)/i.test(hostname)) {
    return "fintech / payments";
  }

  if (/(loan|mortgage|lending|creditunion|credit-union|banking)/i.test(hostname)) {
    return "banking / lending";
  }

  if (/(insurance|assurance|insure|policy|broker)/i.test(hostname)) {
    return "insurance";
  }

  if (/(market|classified|listing|directory|kijiji|airbnb|booking)/i.test(hostname)) {
    return "marketplace";
  }

  if (/(food|drink|coffee|tea|snack|restaurant|meal|bakery)/i.test(hostname)) {
    return "food / beverage brand";
  }

  if (/(restaurant|cafe|bistro|diner|grill|eatery|pizzeria)/i.test(hostname)) {
    return "restaurant / cafe";
  }

  if (/(bakery|patisserie|pastry|dessert|cookies|cookie)/i.test(hostname)) {
    return "bakery / dessert brand";
  }

  if (/(chocolate|chocolat|cocoa|confection|candy|biscuit|biscuits)/i.test(hostname)) {
    return "chocolate / confectionery brand";
  }

  if (/(grocery|supermarket|grocer|foodhall)/i.test(hostname)) {
    return "grocery / supermarket";
  }

  if (/(supplement|protein|vitamin|nutrition|preworkout|pre-workout)/i.test(hostname)) {
    return "supplements / nutrition";
  }

  if (/(beauty|skincare|cosmetic|makeup|haircare|fragrance)/i.test(hostname)) {
    return "beauty / skincare brand";
  }

  if (/(fashion|apparel|shoe|shoes|jewelry|jewellery|bag|streetwear)/i.test(hostname)) {
    return "fashion / apparel brand";
  }

  if (/(jewelry|jewellery|watch|accessories|accessory|rings|necklace|bracelet)/i.test(hostname)) {
    return "jewelry / accessories brand";
  }

  if (/(baby|kids|children|toys|nursery|stroller)/i.test(hostname)) {
    return "baby / kids brand";
  }

  if (/(pet|pets|dog|cat|veterinary|vet|grooming)/i.test(hostname)) {
    return "pet brand / pet services";
  }

  if (/(sport|fitness|gym|training|athletic|athletics)/i.test(hostname)) {
    return "sports / fitness brand";
  }

  if (/(furniture|decor|interior|mattress|sofa|homegoods)/i.test(hostname)) {
    return "home / furniture brand";
  }

  if (/(hardware|electronics|gadget|device|laptop|phone|headphone|headphones)/i.test(hostname)) {
    return "hardware / electronics";
  }

  if (/(industrial|factory|manufacturing|machinery|equipment|fabrication)/i.test(hostname)) {
    return "industrial / manufacturing";
  }

  if (/(construction|contractor|builders|roofing|renovation|remodel)/i.test(hostname)) {
    return "construction / trades";
  }

  if (/(plumb|hvac|heating|cooling|airconditioning|air-conditioning)/i.test(hostname)) {
    return "plumbing / HVAC";
  }

  if (/(cleaning|janitorial|maid|maintenance|facilityservice)/i.test(hostname)) {
    return "cleaning / maintenance service";
  }

  if (/(solar|energy|power|renewable|electricity)/i.test(hostname)) {
    return "solar / energy";
  }

  if (/(farm|farming|agri|agro|tractor|crop)/i.test(hostname)) {
    return "agriculture / farming";
  }

  if (/\b(car|auto|vehicle|mobility|ride|rideshare|ev)\b/i.test(hostname)) {
    return "automotive / mobility";
  }

  if (/(cardealer|car-dealer|motors|autosales|dealership)/i.test(hostname)) {
    return "automotive dealership";
  }

  if (/(motorcycle|motorbike|bike|bikes|powersport|atv|utv)/i.test(hostname)) {
    return "motorcycle / powersports dealership";
  }

  if (/(boat|marine|yacht|outboard|watercraft)/i.test(hostname)) {
    return "boat / marine dealership";
  }

  if (/(mechanic|autorepair|auto-repair|garage|servicecenter|service-centre)/i.test(hostname)) {
    return "mechanic / auto repair";
  }

  if (/(delivery|logistics|shipping|courier|freight|dispatch)/i.test(hostname)) {
    return "logistics / delivery";
  }

  if (/(travel|tour|trip|vacation|flight|airline|tourism)/i.test(hostname)) {
    return "travel / tourism";
  }

  if (/(game|gaming|stream|esports|music|video|movie|entertainment)/i.test(hostname)) {
    return "gaming / entertainment";
  }

  if (/(shop|store|beauty|fashion|coffee|supplement|skincare)/i.test(hostname)) {
    return "ecommerce brand";
  }

  if (/(agency|studio|consult|service)/i.test(hostname)) {
    return "agency / service business";
  }

  if (/(law|legal|attorney|lawyer|injuryfirm)/i.test(hostname)) {
    return "legal / law firm";
  }

  if (/(recruit|staffing|talent|jobs|careers|headhunt)/i.test(hostname)) {
    return "recruiting / staffing";
  }

  if (/(payroll|hr|humanresources|human-resources|peopleops)/i.test(hostname)) {
    return "hr / payroll";
  }

  if (/(nonprofit|charity|foundation|donate|community)/i.test(hostname)) {
    return "nonprofit / community";
  }

  if (/(clinic|care|health|wellness|med|therapy)/i.test(hostname)) {
    return "health / wellness";
  }

  if (/(clinic|medical|doctor|physio|physiotherapy|urgentcare)/i.test(hostname)) {
    return "medical clinic";
  }

  if (/(dental|dentist|orthodont|ortho)/i.test(hostname)) {
    return "dental / orthodontics";
  }

  if (/(course|academy|school|learn|coach|training)/i.test(hostname)) {
    return "education / coaching";
  }

  if (/(school|college|university|campus|faculty)/i.test(hostname)) {
    return "school / university";
  }

  if (/(news|media|mag|podcast|blog)/i.test(hostname)) {
    return "media / content brand";
  }

  if (/(event|festival|concert|club|nightlife|venue)/i.test(hostname)) {
    return "events / nightlife";
  }

  if (/(wedding|bridal|planner|eventplanning|event-planning)/i.test(hostname)) {
    return "wedding / event services";
  }

  if (/(photo|photography|videography|creative|productionstudio)/i.test(hostname)) {
    return "photography / creative studio";
  }

  if (/(home|realty|rent|stay|hotel|travel)/i.test(hostname)) {
    return "real estate / hospitality";
  }

  if (/(app|mobile|consumer)/i.test(hostname)) {
    return "consumer app";
  }

  return "saas";
}

const PRODUCT_TYPE_SIGNAL_RULES = [
  { type: "ai tool / automation", pattern: /(ai agent|ai assistant|copilot|automation platform|workflow automation|prompt|llm)/i },
  { type: "developer tools", pattern: /\b(developer|developers|api|sdk|cli|repository|deployment|git|infrastructure|database)\b/i },
  { type: "cybersecurity", pattern: /(security|cybersecurity|identity|authentication|threat|vpn|soc 2|firewall|zero trust)/i },
  { type: "marketplace", pattern: /(marketplace|classified|buy sell|listings|for sale|rentals|used items)/i },
  { type: "telecom / internet provider", pattern: /(sim card|sim cards|esim|mobile plan|prepaid|postpaid|fiber|fibre|internet|wifi|broadband|roaming|telecom|telco|carrier|operator|recharge|top up|top-up)/i },
  { type: "fintech / payments", pattern: /\b(payment|payments|wallet|fintech|money transfer|send money|international account|cross-border|borderless|checkout|merchant|qr pay|credit card|debit card|iban|bank details|currencies?|remittance|transfer fees?)\b/i },
  { type: "banking / lending", pattern: /\b(loan|mortgage|lending|credit union|banking|apr|interest rate|current account|multi-currency account)\b/i },
  { type: "insurance", pattern: /(insurance|insured|policy|quote|get insured|coverage|claim)/i },
  { type: "food / beverage brand", pattern: /(food|drink|coffee|tea|restaurant|bakery|menu|order now|beverage|snack|agro-alimentaire|alimentaire|food brand|groupe alimentaire)/i },
  { type: "restaurant / cafe", pattern: /(restaurant|cafe|bistro|diner|menu|book a table|reserve a table|chef)/i },
  { type: "bakery / dessert brand", pattern: /(bakery|patisserie|pastry|dessert|cookies|cookie|cupcake|croissant)/i },
  { type: "chocolate / confectionery brand", pattern: /(chocolate|chocolat|chocolats|cocoa|confection|confectionery|candy|truffle|biscuit|biscuits|biscuite|fromages?)/i },
  { type: "grocery / supermarket", pattern: /(grocery|supermarket|grocer|fresh produce|aisles|weekly flyer)/i },
  { type: "supplements / nutrition", pattern: /(supplement|protein|vitamin|nutrition|pre-workout|creatine|whey)/i },
  { type: "beauty / skincare brand", pattern: /(beauty|skincare|cosmetic|makeup|haircare|fragrance|serum|cleanser)/i },
  { type: "fashion / apparel brand", pattern: /(fashion|apparel|collection|lookbook|garment|shoe|bag|jewelry)/i },
  { type: "jewelry / accessories brand", pattern: /(jewelry|jewellery|watch|bracelet|necklace|rings|earrings|accessories)/i },
  { type: "baby / kids brand", pattern: /(baby|kids|children|nursery|stroller|kidswear|toys)/i },
  { type: "pet brand / pet services", pattern: /(pet|pets|dog|cat|veterinary|vet|pet food|grooming)/i },
  { type: "sports / fitness brand", pattern: /(sport|fitness|gym|athletic|performance wear|training gear)/i },
  { type: "home / furniture brand", pattern: /(furniture|decor|interior|mattress|sofa|living room|dining room)/i },
  { type: "hardware / electronics", pattern: /(hardware|electronics|gadget|device|laptop|phone|tablet|headphones)/i },
  { type: "industrial / manufacturing", pattern: /(industrial|factory|manufacturing|machinery|equipment|fabrication|plant)/i },
  { type: "construction / trades", pattern: /(construction|contractor|builders|roofing|renovation|remodel|general contractor)/i },
  { type: "plumbing / HVAC", pattern: /(plumbing|plumber|hvac|heating|cooling|air conditioning|furnace|boiler)/i },
  { type: "cleaning / maintenance service", pattern: /(cleaning|janitorial|maid service|deep clean|maintenance service)/i },
  { type: "solar / energy", pattern: /(solar|renewable energy|panels|battery backup|energy savings)/i },
  { type: "agriculture / farming", pattern: /(farm|farming|agriculture|tractor|livestock|crop|harvest)/i },
  { type: "automotive dealership", pattern: /(car dealership|used cars|new cars|inventory|schedule test drive|finance a car)/i },
  { type: "motorcycle / powersports dealership", pattern: /(motorcycle|motorbike|powersports|atv|utv|bike inventory)/i },
  { type: "boat / marine dealership", pattern: /(boat|marine|yacht|watercraft|outboard|schedule a sea trial)/i },
  { type: "mechanic / auto repair", pattern: /(mechanic|auto repair|brake service|oil change|garage|vehicle service)/i },
  { type: "automotive / mobility", pattern: /\b(automotive|vehicle|car|ev|mobility|ride share|ride-sharing)\b/i },
  { type: "logistics / delivery", pattern: /(delivery|logistics|shipping|courier|dispatch|freight|tracking)/i },
  { type: "travel / tourism", pattern: /(travel|tourism|flight|hotel|vacation|trip|destination|tour)/i },
  { type: "gaming / entertainment", pattern: /(gaming|esports|play now|game pass|streaming|music platform|video platform|entertainment)/i },
  { type: "ecommerce brand", pattern: /(shop|store|cart|add to cart|subscribe & save|ingredients|shipping|collections)/i },
  { type: "legal / law firm", pattern: /(law firm|attorney|lawyer|legal services|injury lawyer|family law)/i },
  { type: "health / wellness", pattern: /(clinic|patient|wellness|therapy|health)/i },
  { type: "agency / service business", pattern: /(agency|studio|consult|service|book a call|book now|our team|case study)/i },
  { type: "recruiting / staffing", pattern: /(recruiting|staffing|talent acquisition|hiring|job openings|candidates)/i },
  { type: "hr / payroll", pattern: /(payroll|hr software|human resources|benefits admin|employee onboarding)/i },
  { type: "nonprofit / community", pattern: /(nonprofit|charity|donate|mission|community impact|volunteer)/i },
  { type: "education / coaching", pattern: /(course|academy|coach|training|students|curriculum)/i },
  { type: "school / university", pattern: /(school|college|university|campus|faculty|admissions)/i },
  { type: "media / content brand", pattern: /(news|articles|podcast|stories|newsletter|editorial)/i },
  { type: "events / nightlife", pattern: /(festival|concert|nightlife|club|tickets|venue)/i },
  { type: "wedding / event services", pattern: /(wedding|bridal|event planner|event planning|venue rental)/i },
  { type: "photography / creative studio", pattern: /(photography|videography|creative studio|brand shoot|wedding photos)/i },
  { type: "real estate / hospitality", pattern: /(hotel|hospitality|stay|vacation rental|real estate|property|booking)/i },
  { type: "medical clinic", pattern: /(medical clinic|doctor|physio|walk-in clinic|urgent care|appointment)/i },
  { type: "dental / orthodontics", pattern: /(dentist|dental|orthodontic|orthodontist|invisalign)/i },
  { type: "consumer app", pattern: /(app store|google play|mobile app|consumer app)/i },
  { type: "saas", pattern: /\b(software|platform|integration|dashboard|workspace|product tour|free trial|pricing|demo)\b/i },
];

function scoreTextForProductType(text, weight, scores) {
  const normalized = String(text ?? "").toLowerCase();
  if (!normalized) {
    return;
  }

  for (const rule of PRODUCT_TYPE_SIGNAL_RULES) {
    const matches = normalized.match(new RegExp(rule.pattern.source, "gi"));
    if (!matches?.length) {
      continue;
    }
    scores.set(rule.type, (scores.get(rule.type) ?? 0) + (matches.length * weight));
  }
}

function rankProductTypeSignals({ hostname, title = "", description = "", pageText = "", productCandidates = [] }) {
  const scores = new Map();
  const fallbackType = inferProductType(hostname);

  scoreTextForProductType(hostname, 2, scores);
  scoreTextForProductType(title, 8, scores);
  scoreTextForProductType(description, 9, scores);
  scoreTextForProductType(pageText, 2, scores);
  scoreTextForProductType(
    productCandidates
      .map((candidate) => `${candidate?.type ?? ""} ${candidate?.source ?? ""} ${candidate?.url ?? ""}`)
      .join(" "),
    6,
    scores,
  );

  const foodEvidenceText = `${title} ${description} ${pageText} ${productCandidates.map((candidate) => candidate?.url ?? "").join(" ")}`;
  const strongFoodEvidence =
    /(agro-alimentaire|alimentaire|chocolats?|chocolat|biscuits?|fromages?|confiserie|confection|snack|food)/i.test(foodEvidenceText);
  const obviousProductEvidence = (productCandidates?.length ?? 0) >= 3;
  const fintechEvidenceText = `${title} ${description} ${pageText} ${productCandidates.map((candidate) => candidate?.url ?? "").join(" ")}`;
  const strongFintechEvidence =
    /(international account|money without borders|send money|manage your money|money internationally|currencies?|bank details|multi-currency|cross-border|debit card|transfer fees?|remittance)/i.test(fintechEvidenceText);

  if (strongFoodEvidence) {
    scores.set("food / beverage brand", (scores.get("food / beverage brand") ?? 0) + 14);
    scores.set("chocolate / confectionery brand", (scores.get("chocolate / confectionery brand") ?? 0) + 18);
  }

  if (obviousProductEvidence && strongFoodEvidence) {
    scores.set("food / beverage brand", (scores.get("food / beverage brand") ?? 0) + 16);
    scores.set("chocolate / confectionery brand", (scores.get("chocolate / confectionery brand") ?? 0) + 22);
    scores.set("developer tools", Math.max(0, (scores.get("developer tools") ?? 0) - 8));
    scores.set("saas", Math.max(0, (scores.get("saas") ?? 0) - 8));
    scores.set("automotive / mobility", Math.max(0, (scores.get("automotive / mobility") ?? 0) - 8));
  }

  if (strongFintechEvidence) {
    scores.set("fintech / payments", (scores.get("fintech / payments") ?? 0) + 18);
    scores.set("banking / lending", (scores.get("banking / lending") ?? 0) + 12);
    scores.set("saas", Math.max(0, (scores.get("saas") ?? 0) - 10));
    scores.set("automotive / mobility", Math.max(0, (scores.get("automotive / mobility") ?? 0) - 10));
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const top = ranked[0] ?? [fallbackType, 0];
  const runnerUp = ranked[1] ?? [fallbackType, 0];

  return {
    fallbackType,
    ranked,
    topType: top[0],
    topScore: top[1],
    runnerUpType: runnerUp[0],
    runnerUpScore: runnerUp[1],
  };
}

function inferProductTypeFromSignals({ hostname, title = "", description = "", pageText = "", productCandidates = [] }) {
  const ranking = rankProductTypeSignals({ hostname, title, description, pageText, productCandidates });
  return ranking.topScore >= 4 ? ranking.topType : ranking.fallbackType;
}

function buildPalette(productType) {
  if (productType === "ai tool / automation") {
    return ["#9AF7D8", "#44C7A1", "#123A2E"];
  }

  if (productType === "developer tools") {
    return ["#7DD3FC", "#2C7DA0", "#0B1F2A"];
  }

  if (productType === "cybersecurity") {
    return ["#7CFFB2", "#1FA971", "#071B14"];
  }

  if (productType === "telecom / internet provider") {
    return ["#E52A2D", "#FFFFFF", "#3A3A3A"];
  }

  if (productType === "fintech / payments") {
    return ["#10B981", "#F8FFFB", "#073B2F"];
  }

  if (productType === "banking / lending") {
    return ["#2563EB", "#DBEAFE", "#0F172A"];
  }

  if (productType === "insurance") {
    return ["#0F766E", "#CCFBF1", "#082F2B"];
  }

  if (productType === "gaming / entertainment") {
    return ["#B794FF", "#5B3CC4", "#140B2E"];
  }

  if (productType === "food / beverage brand") {
    return ["#F97316", "#FFD7B0", "#5A2A08"];
  }

  if (productType === "restaurant / cafe") {
    return ["#C96A2B", "#F7E6CE", "#3B2112"];
  }

  if (productType === "bakery / dessert brand") {
    return ["#D9778D", "#F9D8DE", "#6B3140"];
  }

  if (productType === "chocolate / confectionery brand") {
    return ["#8B5A2B", "#E6C7A5", "#2A160B"];
  }

  if (productType === "beauty / skincare brand") {
    return ["#F2B5C8", "#E78FB0", "#4C1F31"];
  }

  if (productType === "fashion / apparel brand") {
    return ["#E5E7EB", "#6B7280", "#111827"];
  }

  if (productType === "home / furniture brand") {
    return ["#D6B38A", "#8B5E34", "#2F241B"];
  }

  if (productType === "hardware / electronics") {
    return ["#93C5FD", "#3B82F6", "#0F172A"];
  }

  if (productType === "automotive / mobility") {
    return ["#EF4444", "#B91C1C", "#111827"];
  }

  if (productType === "logistics / delivery") {
    return ["#FACC15", "#CA8A04", "#1F2937"];
  }

  if (productType === "travel / tourism") {
    return ["#38BDF8", "#0EA5E9", "#083344"];
  }

  if (productTypeBucket(productType) === "physical") {
    return ["#EFD7B0", "#D9945D", "#5E3B22"];
  }

  if (productTypeBucket(productType) === "service") {
    return ["#C7F0DE", "#62B58C", "#18382C"];
  }

  return ["#9CFF8F", "#6EBB73", "#244E37"];
}

function buildCategory(productType) {
  return productType
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildTone(productType) {
  if (productType === "ai tool / automation") {
    return "Futuristic, efficient, high-leverage";
  }

  if (productType === "developer tools") {
    return "Precise, technical, builder-focused";
  }

  if (productType === "cybersecurity") {
    return "Secure, controlled, mission-critical";
  }

  if (productType === "marketplace") {
    return "Practical, trustworthy, high-utility";
  }

  if (productType === "telecom / internet provider") {
    return "Accessible, reliable, high-coverage";
  }

  if (productType === "fintech / payments") {
    return "Secure, modern, confidence-building";
  }

  if (productType === "banking / lending") {
    return "Stable, clear, confidence-building";
  }

  if (productType === "insurance") {
    return "Trustworthy, reassuring, low-friction";
  }

  if (productType === "gaming / entertainment") {
    return "Energetic, immersive, high-stimulus";
  }

  if (productType === "food / beverage brand") {
    return "Appetizing, vivid, craveable";
  }

  if (productType === "restaurant / cafe") {
    return "Warm, inviting, appetite-led";
  }

  if (productType === "bakery / dessert brand") {
    return "Sweet, cozy, indulgent";
  }

  if (productType === "chocolate / confectionery brand") {
    return "Rich, giftable, premium";
  }

  if (productType === "beauty / skincare brand") {
    return "Refined, soft, premium";
  }

  if (productType === "fashion / apparel brand") {
    return "Editorial, stylish, status-driven";
  }

  if (productType === "home / furniture brand") {
    return "Warm, composed, lifestyle-led";
  }

  if (productType === "hardware / electronics") {
    return "Sleek, technical, premium";
  }

  if (productType === "automotive / mobility") {
    return "Fast, premium, performance-led";
  }

  if (productType === "logistics / delivery") {
    return "Reliable, operational, speed-focused";
  }

  if (productType === "travel / tourism") {
    return "Aspirational, scenic, experience-led";
  }

  if (productTypeBucket(productType) === "physical") {
    return "Aspirational, tactile, premium";
  }

  if (productType === "media / content brand") {
    return "Editorial, sharp, current";
  }

  if (["health / wellness", "medical clinic", "dental / orthodontics", "supplements / nutrition"].includes(productType)) {
    return "Clean, calming, trustworthy";
  }

  if (productTypeBucket(productType) === "service") {
    return "Trustworthy, human, reassuring";
  }

  return "Clear, modern, direct";
}

function buildBrandVibe({ productType, palette = [], font = "", pageText = "" }) {
  const combined = `${font} ${pageText}`.toLowerCase();
  const neutralCount = palette.filter((color) => isNeutralColor(color)).length;
  const darkCount = palette.filter((color) => relativeLuminance(color) < 0.18).length;

  if (/luxury|premium|signature|atelier|crafted|collection|editorial|heritage/i.test(combined) || (neutralCount >= 2 && darkCount >= 1)) {
    return "Premium, editorial, design-led";
  }

  if (/playful|family|kids|dessert|cookies|cookie|snack|festival|fun/i.test(combined)) {
    return "Playful, bright, consumer-friendly";
  }

  if (/secure|trust|care|reliable|insurance|bank|clinic|medical|dental/i.test(combined)) {
    return "Clean, trustworthy, reassurance-led";
  }

  if (/sport|fitness|gaming|energy|performance|speed|racing/i.test(combined)) {
    return "Bold, high-energy, performance-led";
  }

  if (/artisan|organic|natural|farm|craft|bakery|cafe|restaurant/i.test(combined)) {
    return "Warm, crafted, approachable";
  }

  if (productTypeBucket(productType) === "service") {
    return "Human, trust-building, service-led";
  }

  if (productTypeBucket(productType) === "physical") {
    return "Product-led, polished, commerce-ready";
  }

  return "Modern, clear, conversion-focused";
}

function describeHexColor(hexColor) {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) {
    return null;
  }

  const hex = normalized.slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const delta = maxChannel - minChannel;
  const lightness = (maxChannel + minChannel) / 510;

  if (delta < 12) {
    if (lightness > 0.92) {
      return "clean white";
    }

    if (lightness > 0.75) {
      return "soft light gray";
    }

    if (lightness > 0.45) {
      return "balanced mid gray";
    }

    return "deep charcoal";
  }

  let hue = 0;

  if (maxChannel === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (maxChannel === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue *= 60;

  if (hue < 0) {
    hue += 360;
  }

  const saturation = delta / maxChannel;
  const vividness = saturation > 0.65 ? "vivid" : saturation > 0.35 ? "rich" : "muted";
  const brightness = lightness > 0.72 ? "light" : lightness < 0.28 ? "deep" : "";

  let family = "neutral";
  if (hue < 15 || hue >= 345) {
    family = "red";
  } else if (hue < 45) {
    family = "orange";
  } else if (hue < 70) {
    family = "yellow";
  } else if (hue < 160) {
    family = "green";
  } else if (hue < 205) {
    family = "teal";
  } else if (hue < 255) {
    family = "blue";
  } else if (hue < 290) {
    family = "purple";
  } else if (hue < 345) {
    family = "pink";
  }

  return [brightness, vividness, family].filter(Boolean).join(" ");
}

function describePaletteForPrompt(palette = []) {
  const descriptions = palette
    .slice(0, 4)
    .map((color) => describeHexColor(color))
    .filter(Boolean);

  if (!descriptions.length) {
    return "clean brand-led colors";
  }

  return descriptions.join(", ");
}

function summarizeFirecrawlBrandingForVeo(branding) {
  if (!branding || typeof branding !== "object") {
    return "";
  }

  const colorBits = [
    branding?.colors?.primary ? `primary ${branding.colors.primary}` : "",
    branding?.colors?.secondary ? `secondary ${branding.colors.secondary}` : "",
    branding?.colors?.accent ? `accent ${branding.colors.accent}` : "",
    branding?.colors?.background ? `background ${branding.colors.background}` : "",
    branding?.colors?.textPrimary ? `text ${branding.colors.textPrimary}` : "",
  ].filter(Boolean);
  const fontBits = uniqueValues([
    ...(branding?.fonts ?? []).map((font) => font?.family),
    branding?.typography?.fontFamilies?.primary,
    branding?.typography?.fontFamilies?.heading,
  ].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)).slice(0, 3);
  const personalityBits = [
    branding?.personality?.tone,
    branding?.personality?.energy,
    branding?.personality?.targetAudience,
  ].filter((value) => typeof value === "string" && value.trim());
  const buttonBits = [
    branding?.components?.buttonPrimary?.background ? `primary button ${branding.components.buttonPrimary.background}` : "",
    branding?.components?.buttonPrimary?.textColor ? `primary button text ${branding.components.buttonPrimary.textColor}` : "",
    branding?.components?.buttonPrimary?.borderRadius ? `button radius ${branding.components.buttonPrimary.borderRadius}` : "",
  ].filter(Boolean);
  const layoutBits = [
    branding?.layout?.grid ? `grid ${branding.layout.grid}` : "",
    branding?.layout?.headerHeight ? `header ${branding.layout.headerHeight}` : "",
    branding?.spacing?.baseUnit ? `spacing unit ${branding.spacing.baseUnit}` : "",
    branding?.spacing?.borderRadius ? `base radius ${branding.spacing.borderRadius}` : "",
  ].filter(Boolean);

  return [
    branding?.colorScheme ? `Color scheme: ${branding.colorScheme}.` : "",
    colorBits.length ? `Brand colors: ${colorBits.join(", ")}.` : "",
    fontBits.length ? `Fonts: ${fontBits.join(", ")}.` : "",
    buttonBits.length ? `UI buttons: ${buttonBits.join(", ")}.` : "",
    layoutBits.length ? `Layout cues: ${layoutBits.join(", ")}.` : "",
    personalityBits.length ? `Brand personality: ${personalityBits.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}

function buildFallbackFont(productType) {
  if (productTypeBucket(productType) === "physical") {
    return "Sora";
  }

  if ([
    "telecom / internet provider",
    "fintech / payments",
    "banking / lending",
    "ai tool / automation",
    "developer tools",
    "cybersecurity",
    "hardware / electronics",
  ].includes(productType)) {
    return "Inter Tight";
  }

  if (productTypeBucket(productType) === "service") {
    return "Fraunces";
  }

  return "Inter Tight";
}

function absoluteUrl(baseUrl, candidate) {
  if (!candidate) {
    return null;
  }

  try {
    const cleanedCandidate = String(candidate).trim().replace(/[),.;]+$/g, "");
    return new URL(cleanedCandidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function limit(values, count) {
  return values.slice(0, count);
}

function escapeSvgText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeHexColor(value) {
  const match = value?.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

  if (!match) {
    return null;
  }

  const hex = match[1].toUpperCase();

  if (hex.length === 3) {
    return `#${hex.split("").map((char) => `${char}${char}`).join("")}`;
  }

  return `#${hex}`;
}

function relativeLuminance(hex) {
  const normalized = normalizeHexColor(hex);

  if (!normalized) {
    return 0;
  }

  const value = normalized.slice(1);
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function colorDistance(hexA, hexB) {
  const left = normalizeHexColor(hexA)?.slice(1);
  const right = normalizeHexColor(hexB)?.slice(1);

  if (!left || !right) {
    return 0;
  }

  const leftValues = [0, 2, 4].map((offset) => parseInt(left.slice(offset, offset + 2), 16));
  const rightValues = [0, 2, 4].map((offset) => parseInt(right.slice(offset, offset + 2), 16));

  return Math.sqrt(
    leftValues.reduce((sum, current, index) => sum + ((current - rightValues[index]) ** 2), 0)
  );
}

function isNeutralColor(hex) {
  const normalized = normalizeHexColor(hex)?.slice(1);

  if (!normalized) {
    return true;
  }

  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const luminance = relativeLuminance(hex);
  return spread < 18 || luminance < 0.06 || luminance > 0.94;
}

function extractMetaContent(html, attribute, value) {
  const pattern = new RegExp(
    `<meta[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reversePattern = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attribute}=["']${value}["'][^>]*>`,
    "i"
  );

  return html.match(pattern)?.[1] ?? html.match(reversePattern)?.[1] ?? null;
}

function extractTitle(html) {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

function extractLinkHrefs(html, relPattern) {
  const matches = [...html.matchAll(/<link[^>]*rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
  return matches
    .filter((match) => relPattern.test(match[1]))
    .map((match) => match[2]);
}

function extractThemeColors(html) {
  return uniqueValues([
    extractMetaContent(html, "name", "theme-color"),
    extractMetaContent(html, "name", "msapplication-TileColor"),
  ].map((value) => normalizeHexColor(value)).filter(Boolean));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFirecrawlAssetUrl(baseUrl, candidate) {
  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  if (/^data:/i.test(candidate)) {
    return candidate;
  }

  return absoluteUrl(baseUrl, candidate);
}

function mergeCandidateLists(...groups) {
  const bestByUrl = new Map();

  groups.flat().filter(Boolean).forEach((candidate) => {
    if (!candidate?.url) {
      return;
    }

    const existing = bestByUrl.get(candidate.url);
    if (!existing || (candidate.confidence ?? 0) > (existing.confidence ?? 0)) {
      bestByUrl.set(candidate.url, candidate);
    }
  });

  return [...bestByUrl.values()].sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0));
}

function extractFirecrawlFonts(branding) {
  const fonts = [
    ...(branding?.fonts ?? []).map((font) => font?.family),
    ...Object.values(branding?.typography?.fontFamilies ?? {}),
    ...(branding?.typography?.fontStacks?.heading ?? []),
    ...(branding?.typography?.fontStacks?.body ?? []),
    ...(branding?.typography?.fontStacks?.paragraph ?? []),
  ];

  return uniqueValues(fonts.map((font) => (typeof font === "string" ? font.trim() : "")).filter(Boolean)).slice(0, 6);
}

function extractFirecrawlPalette(branding) {
  return uniqueValues([
    branding?.colors?.primary,
    branding?.colors?.accent,
    branding?.colors?.background,
    branding?.colors?.textPrimary,
    branding?.colors?.link,
    branding?.components?.buttonPrimary?.background,
    branding?.components?.buttonPrimary?.textColor,
    branding?.components?.buttonSecondary?.background,
    branding?.components?.buttonSecondary?.textColor,
  ].map((value) => normalizeHexColor(value)).filter(Boolean)).slice(0, 4);
}

// Favicons from hosting platforms — not the actual brand logo
const HOSTING_FAVICON_PATTERNS = [
  /vercel\.com/i, /vercel\.app/i, /netlify\.com/i, /netlify\.app/i,
  /heroku\.com/i, /herokuapp\.com/i, /railway\.app/i, /render\.com/i,
  /github\.io/i, /cloudflare/i, /amazonaws\.com/i, /firebase/i,
  /webflow\.io/i, /squarespace/i, /wix\.com/i, /shopify\.com/i,
];

function isHostingFavicon(url) {
  if (!url) return false;
  return HOSTING_FAVICON_PATTERNS.some((pattern) => pattern.test(url));
}

function buildFirecrawlLogoCandidates({ branding, metadata, baseUrl }) {
  const brandingLogo = normalizeFirecrawlAssetUrl(baseUrl, branding?.images?.logo);
  const favicon = normalizeFirecrawlAssetUrl(baseUrl, metadata?.favicon);
  const ogImage = normalizeFirecrawlAssetUrl(baseUrl, metadata?.ogImage ?? metadata?.["og:image"]);

  // Skip LLM-rejected logos
  const llmRejected = branding?.__llm_logo_reasoning?.rejected === true;
  const llmConfidence = branding?.__llm_logo_reasoning?.confidence ?? 0;

  // Filter out hosting platform favicons
  const faviconIsHosting = isHostingFavicon(favicon);
  if (faviconIsHosting) {
    console.log("[logo] Filtered out hosting platform favicon:", favicon);
  }

  return mergeCandidateLists(
    brandingLogo && !llmRejected && llmConfidence > 0.3
      ? [{
          url: brandingLogo,
          type: /^data:image\/svg/i.test(brandingLogo) || /\.svg($|\?)/i.test(brandingLogo) ? "svg" : "image",
          source: "firecrawl:branding.logo",
          confidence: llmConfidence,
          alt: branding?.images?.logoAlt ?? "Logo",
        }]
      : [],
    // Only use favicon if we have a real brand logo too (as backup), not as the primary logo
    // Favicons are often generic hosting icons or too small to be useful
    favicon && !faviconIsHosting && brandingLogo && !llmRejected
      ? [{
          url: favicon,
          type: "icon",
          source: "firecrawl:metadata.favicon",
          confidence: 0.3,
          alt: "Favicon",
        }]
      : [],
    ogImage
      ? [{
          url: ogImage,
          type: "image",
          source: "firecrawl:metadata.ogImage",
          confidence: 0.34,
          alt: "Open Graph image",
        }]
      : []
  ).slice(0, 6);
}

function extractFirecrawlScreenshotUrl(data) {
  const actionScreenshot = Array.isArray(data?.actions?.screenshots) ? data.actions.screenshots[0] : null;
  const candidate =
    data?.screenshot
    ?? data?.screenshotUrl
    ?? data?.screenshot_url
    ?? actionScreenshot
    ?? null;

  if (typeof candidate === "string") {
    return candidate.trim() || null;
  }

  if (Array.isArray(candidate)) {
    const firstString = candidate.find((value) => typeof value === "string" && value.trim());
    return typeof firstString === "string" ? firstString.trim() : null;
  }

  if (candidate && typeof candidate === "object") {
    const nestedValue = candidate.url ?? candidate.sourceURL ?? candidate.sourceUrl ?? candidate.href ?? null;
    return typeof nestedValue === "string" && nestedValue.trim() ? nestedValue.trim() : null;
  }

  return null;
}

function buildFirecrawlProductCandidates({ images = [], html = "", baseUrl }) {
  const htmlCandidates = (html ? extractProductCandidates(html, baseUrl) : [])
    .filter((candidate) => !/\.(webm|mp4|mov|m4v)($|\?)/i.test(candidate?.url ?? ""));
  const imageCandidates = (images ?? [])
    .map((imageUrl) => normalizeFirecrawlAssetUrl(baseUrl, imageUrl))
    .filter(Boolean)
    .map((imageUrl) => {
      const signal = imageUrl.toLowerCase();

      if (
        /data:image|logo|favicon|flag|badge|partner|payment|trustpilot|app-store|google-play|icon/.test(signal)
        || /\.(webm|mp4|mov|m4v)($|\?)/.test(signal)
      ) {
        return null;
      }

      // Skip promotional / UI / non-product images
      if (/hero|banner|promo|campaign|cta|testimonial|screenshot|dashboard|interface|mockup|illustration|infographic|blog|article|thumbnail|cover|background|bg-|pattern|gradient|placeholder|stock|slider|slide|carousel|header|footer|sprite|icon-|social-|team|about|feature|benefit|step-|how-it|why-|award|press|media-kit|og-image|opengraph|twitter-card|share|email-|newsletter/.test(signal)) {
        return null;
      }

      // Only keep images with a clear product signal in the URL
      const hasProductSignal = /product|item|package|packshot|bottle|jar|device|phone|laptop|headphone|shoe|sneaker|bag|watch|jewelry|clothing|shirt|dress|furniture|food|meal|drink|supplement|cream|serum|soap|toy|tool|equipment|appliance/.test(signal);
      const hasCommerceSignal = /shop|store|buy|price|catalog|collection|cart/.test(signal);
      if (!hasProductSignal && !hasCommerceSignal) return null;

      let confidence = 0.36;
      if (hasProductSignal) confidence += 0.20;
      if (hasCommerceSignal) confidence += 0.10;

      return {
        url: imageUrl,
        type: "product-image",
        source: "firecrawl:images",
        confidence,
      };
    })
    .filter(Boolean);

  return mergeCandidateLists(htmlCandidates, imageCandidates).slice(0, 8);
}

function mapFirecrawlLanguage(value) {
  const languageCode = typeof value === "string" ? value.trim() : "";
  if (!languageCode) {
    return { code: "en", label: "English" };
  }

  const baseCode = languageCode.split(/[-_]/)[0].toLowerCase();
  const labels = {
    en: "English",
    fr: "French",
    es: "Spanish",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
  };

  return {
    code: baseCode || "en",
    label: labels[baseCode] ?? languageCode,
  };
}

function extractLogoCandidates(html, baseUrl) {
  const candidates = [];
  const baseHost = new URL(baseUrl).hostname;
  const imageMatches = [...html.matchAll(/<(img|source)[^>]*?(src|srcset)=["']([^"']+)["'][^>]*?(alt=["']([^"']*)["'])?[^>]*>/gi)];
  const headerMatches = [...html.matchAll(/<(header|nav)[^>]*>([\s\S]{0,6000}?)<\/\1>/gi)];

  for (const match of imageMatches) {
    const source = match[3]?.split(" ")[0];
    const alt = match[5] ?? "";
    const normalizedSource = absoluteUrl(baseUrl, source);

    if (!normalizedSource) {
      continue;
    }

    const candidateHost = new URL(normalizedSource).hostname;
    const score =
      /logo|brand|wordmark/i.test(alt) ? 0.95 :
      /logo|brand|wordmark/i.test(normalizedSource) ? 0.91 :
      /logo|brand|wordmark/i.test(source) ? 0.88 :
      /\.(svg)$/i.test(source) ? 0.58 :
      0.45;
    const adjustedScore =
      score
      - (candidateHost !== baseHost ? 0.22 : 0)
      - (/(partner|client|sponsor|payment|badge|trustpilot|google-play|app-store)/i.test(`${alt} ${normalizedSource}`) ? 0.28 : 0);

    candidates.push({
      url: normalizedSource,
      type: /svg/i.test(source) ? "svg" : "image",
      source: "html-image",
      confidence: adjustedScore,
      alt,
    });
  }

  for (const [, tag, sectionHtml] of headerMatches) {
    const navImages = [...sectionHtml.matchAll(/<(img|source)[^>]*?(src|srcset)=["']([^"']+)["'][^>]*?(alt=["']([^"']*)["'])?[^>]*>/gi)];

    for (const match of navImages) {
      const source = match[3]?.split(" ")[0];
      const alt = match[5] ?? "";
      const normalizedSource = absoluteUrl(baseUrl, source);

      if (!normalizedSource) {
        continue;
      }

      const candidateHost = new URL(normalizedSource).hostname;
      const baseScore = /logo|brand|wordmark/i.test(`${alt} ${source}`) ? 0.98 : 0.74;

      candidates.push({
        url: normalizedSource,
        type: /svg/i.test(source) ? "svg" : "image",
        source: `${tag}-image`,
        confidence: baseScore - (candidateHost !== baseHost ? 0.18 : 0),
        alt,
      });
    }
  }

  const ogImage = extractMetaContent(html, "property", "og:image");
  if (ogImage) {
    candidates.push({
      url: absoluteUrl(baseUrl, ogImage),
      type: "image",
      source: "og:image",
      confidence: 0.36,
      alt: "Open Graph image",
    });
  }

  extractLinkHrefs(html, /(icon|apple-touch-icon)/i).forEach((href) => {
    candidates.push({
      url: absoluteUrl(baseUrl, href),
      type: "icon",
      source: "link-icon",
      confidence: /apple-touch-icon/i.test(href) ? 0.54 : 0.64,
      alt: "Icon candidate",
    });
  });

  return candidates
    .filter((candidate) => candidate.url && candidate.confidence > 0.2)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 6);
}

function extractProductCandidates(html, baseUrl) {
  const candidates = [];
  const baseHost = new URL(baseUrl).hostname;
  const imageMatches = [...html.matchAll(/<(img|source)[^>]*?(src|srcset)=["']([^"']+)["'][^>]*?(alt=["']([^"']*)["'])?[^>]*>/gi)];

  for (const match of imageMatches) {
    const source = match[3]?.split(" ")[0];
    const alt = match[5] ?? "";
    const rawTag = match[0] ?? "";
    const normalizedSource = absoluteUrl(baseUrl, source);

    if (!normalizedSource) {
      continue;
    }

    const candidateHost = new URL(normalizedSource).hostname;
    const signal = `${alt} ${source} ${rawTag}`;

    if (/(logo|icon|favicon|avatar|author|partner|payment|badge|flag|social|trustpilot|app-store|google-play)/i.test(signal)) {
      continue;
    }

    // Skip promotional / UI / non-product images
    if (/(hero|banner|promo|promotion|ad-|advert|campaign|cta|testimonial|review|screenshot|dashboard|interface|mockup|illustration|infographic|blog|article|thumbnail|cover|background|bg-|pattern|gradient|placeholder|stock|generic|slider|slide|carousel|header|footer|sprite|icon-|social-|team|about|feature|benefit|step-|how-it|why-|award|press|media-kit|og-image|opengraph|twitter-card|share|email-|newsletter)/i.test(signal)) {
      continue;
    }

    let score = 0;

    // Only match signals that indicate a real physical product
    if (/(product|item|package|packshot|bottle|jar|device|phone|laptop|headphone|shoe|sneaker|bag|handbag|watch|jewelry|ring|necklace|clothing|shirt|dress|pants|jacket|furniture|chair|table|lamp|candle|food|meal|dish|drink|wine|beer|coffee|tea|supplement|vitamin|cream|serum|soap|shampoo|toy|tool|equipment|machine|appliance)/i.test(signal)) {
      score += 0.46;
    }

    if (/(catalog|collection|shop|store|buy|price|cart)/i.test(signal)) {
      score += 0.14;
    }

    if (/\.(png|jpe?g|webp)$/i.test(source)) {
      score += 0.08;
    }

    score -= candidateHost !== baseHost ? 0.18 : 0;

    if (score >= 0.34) {
      candidates.push({
        url: normalizedSource,
        type: "product-image",
        source: "html-product",
        confidence: score,
        alt,
      });
    }
  }

  // og:image intentionally skipped — almost always a promotional banner, not a product

  return candidates
    .filter((candidate) => candidate.url)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 8);
}

function extractHexColors(text) {
  return uniqueValues(
    [...text.matchAll(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)]
      .map((match) => normalizeHexColor(match[0]))
      .filter(Boolean)
  );
}

function rankBrandColors(values, options = {}) {
  const { allowStrongNeutrals = false } = options;
  const counts = new Map();

  values
    .map((value) => normalizeHexColor(value))
    .filter(Boolean)
    .forEach((value) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });

  const ranked = [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return relativeLuminance(right[0]) - relativeLuminance(left[0]);
    })
    .map(([color]) => color);

  const vivid = ranked.filter((color) => !isNeutralColor(color));
  const strongNeutrals = allowStrongNeutrals
    ? ranked.filter((color) => {
        const luminance = relativeLuminance(color);
        const saturation = colorSaturation(color);
        return saturation < 0.12 && (luminance < 0.11 || luminance > 0.91);
      })
    : [];
  const source = vivid.length > 0
    ? uniqueValues([...vivid, ...strongNeutrals])
    : ranked;
  const selected = [];

  for (const color of source) {
    if (selected.every((existing) => colorDistance(existing, color) > 42)) {
      selected.push(color);
    }

    if (selected.length === 4) {
      break;
    }
  }

  return selected;
}

function adjustHexColor(hex, amount) {
  const normalized = normalizeHexColor(hex)?.slice(1);

  if (!normalized) {
    return null;
  }

  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(normalized.slice(offset, offset + 2), 16);
    return Math.max(0, Math.min(255, Math.round(value + (255 * amount))));
  });

  return rgbToHex(channels[0], channels[1], channels[2]);
}

function cleanScreenshotPalette(colors) {
  return [...(colors ?? [])]
    .map((color) => normalizeHexColor(color))
    .filter(Boolean)
    .sort((left, right) => {
      const saturationDelta = colorSaturation(right) - colorSaturation(left);
      if (Math.abs(saturationDelta) > 0.02) {
        return saturationDelta;
      }

      return relativeLuminance(left) - relativeLuminance(right);
    });
}

function detectNeutralBrandAnchors(signalGroups) {
  const flattened = (signalGroups ?? []).flatMap((group) => group ?? []);
  const whiteCandidates = flattened.filter((color) => {
    const luminance = relativeLuminance(color);
    return luminance > 0.91 && colorSaturation(color) < 0.12;
  });
  const blackCandidates = flattened.filter((color) => {
    const luminance = relativeLuminance(color);
    return luminance < 0.11 && colorSaturation(color) < 0.16;
  });

  const anchors = [];

  if (whiteCandidates.length >= 2) {
    anchors.push("#FFFFFF");
  }

  if (blackCandidates.length >= 2) {
    anchors.push("#111111");
  }

  return anchors;
}

function buildMinimalBrandPalette(primaryColor) {
  const lighter = adjustHexColor(primaryColor, 0.18);
  const softer = adjustHexColor(primaryColor, 0.3);
  const subtleNeutral = "#F6F6F6";
  return [primaryColor, "#FFFFFF", lighter, softer ?? subtleNeutral].filter(Boolean);
}

function uniquePalette(values) {
  const selected = [];

  for (const color of values) {
    const normalized = normalizeHexColor(color);
    if (!normalized) {
      continue;
    }

    if (selected.every((existing) => colorDistance(existing, normalized) > 34)) {
      selected.push(normalized);
    }

    if (selected.length === 4) {
      break;
    }
  }

  return selected;
}

function buildDetectedPalette({ uiSignalColors, logoColors, screenshotColors, fallbackPalette }) {
  const uiSignals = cleanScreenshotPalette(uiSignalColors);
  const logo = cleanScreenshotPalette(logoColors);
  const screenshot = cleanScreenshotPalette(screenshotColors);
  const fallback = (fallbackPalette ?? []).map((color) => normalizeHexColor(color)).filter(Boolean);

  if (uiSignals.length === 0 && logo.length === 0 && screenshot.length === 0) {
    return fallback.slice(0, 4);
  }

  const primarySignals = uniquePalette([
    ...uiSignals,
    ...logo,
    ...screenshot,
  ]);
  const vividPrimarySignals = primarySignals.filter((color) => !isNeutralColor(color));
  const neutralAnchors = detectNeutralBrandAnchors([uiSignals, logo, screenshot]);

  if (vividPrimarySignals.length <= 2) {
    return uniquePalette([
      ...buildMinimalBrandPalette(vividPrimarySignals[0] ?? primarySignals[0] ?? screenshot[0]),
      ...neutralAnchors,
      ...primarySignals.filter((color) => relativeLuminance(color) > 0.9),
      ...primarySignals.filter((color) => relativeLuminance(color) < 0.12),
      ...fallback,
    ]);
  }

  return uniquePalette([
    primarySignals[0],
    ...neutralAnchors,
    ...primarySignals.slice(1),
    ...fallback,
  ]);
}

function detectContentLanguage({ url, html, title, description, pageText }) {
  const combined = [title, description, pageText].filter(Boolean).join(" ").trim();
  const htmlLangMatch = html?.match(/<html[^>]*\blang=["']?([a-zA-Z-]+)/i);
  const htmlLang = htmlLangMatch?.[1]?.toLowerCase() ?? "";
  const host = url ? ensureUrl(url)?.hostname.toLowerCase() ?? "" : "";

  if (htmlLang.startsWith("fr")) {
    return { code: "fr", label: "French" };
  }

  if (htmlLang.startsWith("ar")) {
    return { code: "ar", label: "Arabic" };
  }

  if (htmlLang.startsWith("en")) {
    return { code: "en", label: "English" };
  }

  if (/[ء-ي]/.test(combined)) {
    return { code: "ar", label: "Arabic" };
  }

  if (/[éèêàçùôî]/i.test(combined) || /\b(avec|pour|près|gratuit|acheter|vendre|bienvenue|découvrez|carte|paiement)\b/i.test(combined)) {
    return { code: "fr", label: "French" };
  }

  if (/\b(tunisie|tn)\b/i.test(combined) && /(ooredoo|flouci)/i.test(host)) {
    return { code: "fr", label: "French" };
  }

  return { code: "en", label: "English" };
}

function cleanSummaryText(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s+[|:-]\s+.+$/g, "")
    .replace(/^(visit|discover|explore|welcome to)\s+/i, "")
    .trim();
}

function isWeakSummaryCandidate(value) {
  const normalized = cleanSummaryText(value).toLowerCase();

  if (!normalized) {
    return true;
  }

  if (normalized.length < 28) {
    return true;
  }

  if (/^(eshop|shop|home|homepage)\b/.test(normalized)) {
    return true;
  }

  if (/^[a-z0-9\s&'-]+$/.test(normalized) && normalized.split(" ").length <= 3) {
    return true;
  }

  return false;
}

function pickSummarySentence(pageText, productType, cleanTitle) {
  if (!pageText) {
    return "";
  }

  const sentences = pageText
    .split(/(?<=[.!?])\s+/)
    .map((part) => cleanSummaryText(part))
    .filter((part) => part.length >= 42 && part.length <= 170);

  if (sentences.length === 0) {
    return "";
  }

  const preferredKeywords =
    productType === "telecom / internet provider"
      ? ["internet", "fiber", "mobile", "sim", "5g", "4g", "broadband", "connection", "offer"]
      : productType === "fintech / payments"
        ? ["payment", "wallet", "checkout", "merchant", "money", "card", "bank", "invoice"]
        : productType === "marketplace"
          ? ["buy", "sell", "listing", "marketplace", "classified", "rent"]
          : productType === "saas"
            ? ["dashboard", "platform", "workspace", "automation", "team", "analytics"]
            : [];

  const scored = sentences
    .map((sentence) => {
      const lower = sentence.toLowerCase();
      let score = 0;

      preferredKeywords.forEach((keyword) => {
        if (lower.includes(keyword)) {
          score += 3;
        }
      });

      if (cleanTitle && !lower.includes(cleanTitle.toLowerCase())) {
        score += 1;
      }

      if (/\b(unlimited|reliable|secure|easy|fast|simple|best)\b/i.test(sentence)) {
        score += 1;
      }

      return { sentence, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score > 0 ? scored[0].sentence : sentences[0];
}

function summarizeProject({ host, title, description, pageText, productType }) {
  const fallback = `${host.replace(/^www\./, "")} appears to be a ${buildCategory(productType).toLowerCase()} with a ${buildTone(productType).toLowerCase()} brand direction.`;
  const cleanTitle = cleanSummaryText(title);
  const cleanDescription = cleanSummaryText(description);
  const sentenceSummary = pickSummarySentence(pageText, productType, cleanTitle);

  if (cleanDescription && !isWeakSummaryCandidate(cleanDescription)) {
    const firstSentence = cleanDescription.split(/(?<=[.!?])\s+/)[0]?.trim() ?? cleanDescription;
    if (firstSentence && firstSentence.length >= 45 && firstSentence.length <= 150) {
      return firstSentence;
    }

    if (cleanTitle && !cleanDescription.toLowerCase().startsWith(cleanTitle.toLowerCase())) {
      const composed = `${cleanTitle}. ${firstSentence || cleanDescription}`;
      return composed.length > 155 ? `${composed.slice(0, 152).trim()}...` : composed;
    }

    return cleanDescription.length > 155 ? `${cleanDescription.slice(0, 152).trim()}...` : cleanDescription;
  }

  if (sentenceSummary) {
    if (cleanTitle && !isWeakSummaryCandidate(cleanTitle) && !sentenceSummary.toLowerCase().includes(cleanTitle.toLowerCase())) {
      const composed = `${cleanTitle}. ${sentenceSummary}`;
      return composed.length > 155 ? `${composed.slice(0, 152).trim()}...` : composed;
    }

    return sentenceSummary;
  }

  if (cleanTitle && !isWeakSummaryCandidate(cleanTitle)) {
    return cleanTitle;
  }

  if (pageText) {
    const sentence = pageText
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find((part) => part.length > 50 && part.length < 150);

    if (sentence) {
      return sentence;
    }
  }

  return fallback;
}

function extractFontHints(text) {
  return uniqueValues(
    [...text.matchAll(/font-family\s*:\s*([^;}{]+)/gi)]
      .flatMap((match) => match[1].split(","))
      .map((value) => value.replace(/['"]/g, "").trim())
      .filter((value) => value && !/(sans-serif|serif|monospace|system-ui)/i.test(value))
  );
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function quantizeChannel(value) {
  return Math.round(value / 24) * 24;
}

function colorSaturation(hex) {
  const normalized = normalizeHexColor(hex)?.slice(1);

  if (!normalized) {
    return 0;
  }

  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

function isMuddyColor(hex) {
  const normalized = normalizeHexColor(hex)?.slice(1);

  if (!normalized) {
    return false;
  }

  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  const saturation = colorSaturation(hex);
  const luminance = relativeLuminance(hex);
  const warmBias = red > green && green >= blue;

  return warmBias && saturation < 0.42 && luminance > 0.18 && luminance < 0.78;
}

function collectWeightedScreenshotColors(pixelBuffer, weight, bucket) {
  for (let offset = 0; offset < pixelBuffer.length; offset += 3) {
    const color = rgbToHex(
      quantizeChannel(pixelBuffer[offset]),
      quantizeChannel(pixelBuffer[offset + 1]),
      quantizeChannel(pixelBuffer[offset + 2]),
    );

    if ((!isNeutralColor(color) || colorSaturation(color) > 0.12) && !isMuddyColor(color)) {
      bucket.push(...Array.from({ length: weight }, () => color));
    }
  }
}

function rankUiSignalColors(values) {
  return rankBrandColors(
    (values ?? [])
      .map((value) => normalizeHexColor(value))
      .filter((value) => value && !isMuddyColor(value))
  , { allowStrongNeutrals: true }).slice(0, 6);
}

async function extractLogoColorsFromUrl(logoUrl) {
  const sanitizedUrl = sanitizeRemoteAssetUrl(logoUrl);
  if (!sanitizedUrl) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(sanitizedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "MarketingStackBot/0.1 (+https://marketingstack.app)",
      },
    });

    if (!response.ok) {
      return [];
    }

    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED_REFERENCE_IMAGE_TYPES.has(mimeType)) {
      return [];
    }

    const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const tempPath = path.join("/tmp", `onlinebrand-logo-${Date.now()}.${extension}`);
    await fs.writeFile(tempPath, Buffer.from(await response.arrayBuffer()));

    try {
      const pixelBuffer = await runProcessBuffer("ffmpeg", [
        "-i",
        tempPath,
        "-vf",
        "scale=48:48",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);
      const colors = [];
      collectWeightedScreenshotColors(pixelBuffer, 1, colors);
      return rankBrandColors(colors, { allowStrongNeutrals: true }).slice(0, 4);
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "MarketingStackBot/0.1 (+https://marketingstack.app)",
      },
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") ?? "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function extractColorsFromScreenshot(imagePath) {
  try {
    const zones = [
      {
        id: "logo-header",
        // Top-left header/logo area usually contains the strongest brand color.
        filter: "crop=iw*0.42:ih*0.09:0:0,scale=72:20",
        weight: 16,
      },
      {
        id: "full-header",
        // Full header/nav strip for brand bars and navigation accents.
        filter: "crop=iw:ih*0.1:0:0,scale=72:18",
        weight: 12,
      },
      {
        id: "hero",
        // Hero only lightly informs the palette now because photography can mislead it.
        filter: "crop=iw*0.78:ih*0.18:0:ih*0.12,scale=72:24",
        weight: 1,
      },
    ];
    const weightedColors = [];
    const zoneDebug = [];
    const debugDirectory = path.join(PUBLIC_DIR, "debug");
    const screenshotSlug = sanitizeSlug(path.basename(imagePath, path.extname(imagePath)));

    await ensureDirectory(debugDirectory);

    for (const zone of zones) {
      const zoneOutputPath = path.join(debugDirectory, `${screenshotSlug}-${zone.id}.png`);
      await runProcess("ffmpeg", [
        "-y",
        "-i",
        imagePath,
        "-vf",
        zone.filter,
        zoneOutputPath,
      ]);
      const pixelBuffer = await runProcessBuffer("ffmpeg", [
        "-i",
        zoneOutputPath,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);

      const zoneColors = [];
      collectWeightedScreenshotColors(pixelBuffer, 1, zoneColors);
      collectWeightedScreenshotColors(pixelBuffer, zone.weight, weightedColors);
      zoneDebug.push({
        id: zone.id,
        weight: zone.weight,
        filter: zone.filter,
        colors: rankBrandColors(zoneColors).slice(0, 6),
        imageUrl: `/debug/${path.basename(zoneOutputPath)}`,
      });
    }

    return {
      colors: rankBrandColors(weightedColors, { allowStrongNeutrals: true }).slice(0, 4),
      zoneDebug,
    };
  } catch {
    return {
      colors: [],
      zoneDebug: [],
    };
  }
}

async function runRenderedBrowserPass(url) {
  try {
    const playwrightModule = await import("playwright");
    const browser = await playwrightModule.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 960 },
      });

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: DEFAULT_TIMEOUT_MS,
      });

      const uiSignalColors = await page.evaluate(() => {
        const normalize = (value) => {
          if (!value) return null;
          const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
          if (!match) return null;
          const toHex = (channel) => Number(channel).toString(16).padStart(2, "0").toUpperCase();
          return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
        };

        const selectors = [
          "header",
          "nav",
          "[class*='header']",
          "[class*='nav']",
          "button",
          "a",
          "[role='button']",
          "svg",
          "img[alt*='logo' i]",
          "[class*='cta']",
          "[class*='btn']",
        ];

        const colors = [];
        const seen = new Set();
        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((node) => {
            if (seen.size > 80) return;
            if (seen.has(node)) return;
            seen.add(node);
            const style = window.getComputedStyle(node);
            [
              style.color,
              style.backgroundColor,
              style.borderColor,
              style.fill,
              style.stroke,
            ].forEach((value) => {
              const normalized = normalize(value);
              if (normalized) {
                colors.push(normalized);
              }
            });
          });
        }

        return colors;
      });

      const title = await page.title();
      const html = await page.content();
      const currentUrl = page.url();
      const screenshotPath = path.join("/tmp", `onlinebrand-shot-${Date.now()}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
      });
      await ensureDirectory(path.join(PUBLIC_DIR, "debug"));
      const savedScreenshotName = `${sanitizeSlug(new URL(currentUrl).hostname)}-${Date.now()}-full.png`;
      const savedScreenshotPath = path.join(PUBLIC_DIR, "debug", savedScreenshotName);
      await fs.copyFile(screenshotPath, savedScreenshotPath);
      const screenshotAnalysis = await extractColorsFromScreenshot(screenshotPath);
      await fs.unlink(screenshotPath).catch(() => undefined);
      const logoCandidates = extractLogoCandidates(html, currentUrl);
      const productCandidates = extractProductCandidates(html, currentUrl);
      const logoColors = await extractLogoColorsFromUrl(logoCandidates[0]?.url ?? null);

      return {
        status: "completed",
        details: "Rendered browser analysis completed",
        normalizedUrl: currentUrl,
        title: title || null,
        html,
        screenshotColors: screenshotAnalysis.colors,
        screenshotZoneDebug: screenshotAnalysis.zoneDebug,
        screenshotUrl: `/debug/${savedScreenshotName}`,
        uiSignalColors: rankUiSignalColors(uiSignalColors),
        logoColors,
        logoCandidates,
        productCandidates,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playwright unavailable";
    const unavailable =
      /Cannot find package|ERR_MODULE_NOT_FOUND|playwright/i.test(message);

    return {
      status: unavailable ? "unavailable" : "failed",
      details: unavailable ? "Playwright is not installed yet" : message,
      normalizedUrl: url,
      title: null,
      html: "",
      screenshotColors: [],
      screenshotZoneDebug: [],
      screenshotUrl: null,
      uiSignalColors: [],
      logoColors: [],
      logoCandidates: [],
      productCandidates: [],
    };
  }
}

async function runFirecrawlExtractionPipeline(url) {
  if (!FIRECRAWL_API_KEY) {
    return null;
  }

  const parsedUrl = ensureUrl(url);
  if (!parsedUrl) {
    return null;
  }

  const firecrawlStart = Date.now();
  const response = await fetch(`${FIRECRAWL_BASE_URL}/v2/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      url: parsedUrl.toString(),
      maxAge: 86400000,
      formats: [
        "html",
        "images",
        "branding",
        {
          type: "screenshot",
          fullPage: false,
          quality: 80,
          viewport: {
            width: 1440,
            height: 1080,
          },
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  console.log(`[brand-detect-timing] Firecrawl API call: ${Date.now() - firecrawlStart}ms`);
  if (!response.ok || !payload?.success || !payload?.data) {
    throw new Error(payload?.error ?? payload?.message ?? "Firecrawl scrape failed.");
  }

  const data = payload.data;
  const metadata = data.metadata ?? {};
  const branding = data.branding ?? {};
  let structured = {};
  const screenshotUrl = extractFirecrawlScreenshotUrl(data);
  const normalizedUrl = metadata.url ?? metadata.sourceURL ?? parsedUrl.toString();
  const html = typeof data.html === "string" ? data.html : "";
  const markdown = "";
  const cleanPageText = stripHtml(html) || stripMarkdown(markdown);
  const pageText = cleanPageText.slice(0, 6000);
  console.log("[Firecrawl DEBUG] branding object:", JSON.stringify(branding, null, 2));
  console.log("[Firecrawl DEBUG] branding.colors:", JSON.stringify(branding?.colors, null, 2));
  console.log("[Firecrawl DEBUG] branding.components:", JSON.stringify(branding?.components, null, 2));
  // Use Gemini to analyze the page content for accurate product type and summary
  const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, "");
  const metaTitle = metadata.title ?? metadata.ogTitle ?? "";
  const metaDesc = metadata.description ?? metadata.ogDescription ?? "";
  if (GEMINI_API_KEY && (pageText.length > 20 || metaTitle || metaDesc)) {
    try {
      const geminiPrompt = `Analyze this website and return a JSON object with exactly two fields:
1. "productType": Pick the single MOST SPECIFIC category from this list. Always prefer the specific industry category over generic ones like "ecommerce brand" or "marketplace". For example: Nike = "sports / fitness brand" (not "ecommerce brand"), Sephora = "beauty / skincare brand" (not "ecommerce brand"), Apple = "consumer electronics" (not "ecommerce brand"), Whole Foods = "grocery / supermarket" (not "food / beverage brand"). Only use "ecommerce brand" if the business is a general online store with no specific industry focus.

Categories: saas, ai tool / automation, developer tools, cybersecurity, marketplace, ecommerce brand, consumer app, telecom / internet provider, fintech / payments, banking / lending, insurance, gaming / entertainment, agency / service business, local service business, legal / law firm, recruiting / staffing, hr / payroll, nonprofit / community, media / content brand, education / coaching, school / university, travel / tourism, real estate / hospitality, events / nightlife, wedding / event services, photography / creative studio, health / wellness, medical clinic, dental / orthodontics, food / beverage brand, restaurant / cafe, bakery / dessert brand, chocolate / confectionery brand, grocery / supermarket, supplements / nutrition, beauty / skincare brand, fashion / apparel brand, jewelry / accessories brand, baby / kids brand, pet brand / pet services, sports / fitness brand, home / furniture brand, hardware / electronics, industrial / manufacturing, construction / trades, plumbing / HVAC, cleaning / maintenance service, solar / energy, agriculture / farming, automotive / mobility, automotive dealership, motorcycle / powersports dealership, boat / marine dealership, mechanic / auto repair, logistics / delivery, consumer electronics, mobile app, streaming / subscription, crypto / web3, consulting / professional services, coworking / office space, pharmacy / medical supply, cannabis / CBD, wine / spirits / brewery, coffee / tea brand, music / audio brand, art / gallery, print / publishing, government / public sector, religious / spiritual organization, charity / foundation, political campaign, personal brand / influencer, freelancer / solopreneur, startup (pre-launch), other

2. "summary": A clear 2-3 sentence description of what this business does, who it serves, and what makes it unique. Write as a factual description, not marketing copy.

Website: ${hostname}
Title: ${metaTitle}
Description: ${metaDesc}
Page content (first 3000 chars): ${pageText.slice(0, 3000) || "No page text extracted — site may be JavaScript-rendered. Use the website URL, title, and description to determine the product type and write the summary."}

Return ONLY valid JSON, no markdown, no backticks.`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: geminiPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
        }),
      });
      const geminiData = await geminiRes.json().catch(() => ({}));
      const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      // Parse JSON from response (strip markdown fences if present)
      const jsonStr = geminiText.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.productType) structured.productType = parsed.productType;
      if (parsed.summary && parsed.summary.length > 30) structured.summary = parsed.summary;
      console.log(`[brand-detect] Gemini analysis: productType="${parsed.productType}", summary="${(parsed.summary || "").substring(0, 80)}..."`);
    } catch (e) {
      console.warn("[brand-detect] Gemini analysis failed:", e instanceof Error ? e.message : e);
    }
  }

  const palette = extractFirecrawlPalette(branding);
  console.log("[Firecrawl DEBUG] extracted palette:", palette);
  const logoCandidates = buildFirecrawlLogoCandidates({
    branding,
    metadata,
    baseUrl: normalizedUrl,
  });
  const productCandidates = buildFirecrawlProductCandidates({
    images: data.images ?? [],
    html,
    baseUrl: normalizedUrl,
  }).map((candidate, index) => ({
    id: `firecrawl-product-${index + 1}`,
    type: "product-image",
    source: candidate.source,
    url: candidate.url,
    confidence: candidate.confidence,
  }));
  const screenshotCandidate = screenshotUrl
    ? [{
        id: "firecrawl-screenshot",
        type: "website-screenshot",
        source: "firecrawl:screenshot",
        url: screenshotUrl,
        confidence: 0.99,
      }]
    : [];
  const assetCandidates = mergeCandidateLists(
    screenshotCandidate,
    logoCandidates.map((candidate) => ({
      id: `firecrawl-logo-${candidate.url}`,
      type: candidate.type === "icon" ? "icon" : "brand-asset",
      source: candidate.source,
      url: candidate.url,
      confidence: candidate.confidence,
    })),
    productCandidates
  )
    .slice(0, 10)
    .map((candidate, index) => ({
      id: `firecrawl-asset-${index + 1}`,
      type: candidate.type,
      source: candidate.source,
      url: candidate.url,
      confidence: candidate.confidence,
    }));

  const extraction = {
    sourceUrl: parsedUrl.toString(),
    normalizedUrl,
    title: metadata.title ?? extractTitle(html),
    description: metadata.description ?? metadata.ogDescription ?? null,
    summary:
      structured.summary
        || (metadata.description && metadata.description.length >= 40 ? metadata.description : null)
        || summarizeProject({
            host: new URL(normalizedUrl).hostname,
            title: metadata.title ?? extractTitle(html),
            description: metadata.description,
            pageText: cleanPageText,
            productType: structured.productType || inferProductType(new URL(normalizedUrl).hostname),
          })
        || metadata.description || cleanPageText.slice(0, 200).trim() || null,
    language: mapFirecrawlLanguage(metadata.language),
    metadata: {
      ogTitle: metadata.ogTitle ?? metadata["og:title"] ?? null,
      ogImage: metadata.ogImage ?? metadata["og:image"] ?? null,
      twitterImage: metadata["twitter:image"] ?? metadata["twitter:image:src"] ?? null,
      ogSiteName: metadata.ogSiteName ?? metadata["og:site_name"] ?? null,
      firecrawlBranding: branding,
      firecrawlLinks: [],
    },
    cssColors: palette,
    uiSignalColors: palette,
    logoColors: uniqueValues([
      branding?.colors?.primary,
      branding?.colors?.accent,
      branding?.components?.buttonPrimary?.background,
    ].map((value) => normalizeHexColor(value)).filter(Boolean)).slice(0, 4),
    screenshotColors: [],
    screenshotZoneDebug: [],
    screenshotUrl,
    fonts: extractFirecrawlFonts(branding),
    logoCandidates,
    assetCandidates,
    productCandidates,
    aiSuggestedColors: palette,
    aiSuggestedProductType:
      SUPPORTED_PRODUCT_TYPES.includes(structured.productType) ? structured.productType : null,
    aiSuggestedBrandFeel:
      (typeof structured.brandFeel === "string" ? structured.brandFeel.trim() : "")
      || [branding?.personality?.tone, branding?.personality?.energy].filter(Boolean).join(" / ")
      || null,
    aiColorNotes: typeof branding?.colorScheme === "string" ? `Firecrawl branding color scheme: ${branding.colorScheme}` : "",
    fallbackStages: [
      {
        stage: "firecrawl_scrape",
        status: "completed",
        details: `Firecrawl returned branding, metadata, links, images, markdown, HTML${screenshotUrl ? ", and a website screenshot" : ""}.`,
      },
      {
        stage: "legacy_extractor",
        status: "skipped",
        details: "Legacy HTML, CSS, and Playwright extractor skipped because Firecrawl succeeded.",
      },
    ],
  };

  return {
    parsedUrl: new URL(normalizedUrl),
    extraction,
    pageText,
  };
}

async function runExtractionPipeline(url, options = {}) {
  if (FIRECRAWL_API_KEY) {
    try {
      const firecrawlResult = await runFirecrawlExtractionPipeline(url);
      if (firecrawlResult) {
        return firecrawlResult;
      }
    } catch (error) {
      console.warn("[firecrawl-detect-fallback]", error instanceof Error ? error.message : "Unknown Firecrawl error");
    }
  }

  return runLegacyExtractionPipeline(url, options);
}
async function runLegacyExtractionPipeline(url, options = {}) {
  const { includeAi = true } = options;
  const parsedUrl = ensureUrl(url);

  if (!parsedUrl) {
    return null;
  }

  const stages = [];
  const extraction = {
    sourceUrl: parsedUrl.toString(),
    normalizedUrl: parsedUrl.toString(),
    title: null,
    description: null,
    summary: null,
    language: { code: "en", label: "English" },
    metadata: {},
    cssColors: [],
    uiSignalColors: [],
    logoColors: [],
    screenshotColors: [],
    screenshotZoneDebug: [],
    screenshotUrl: null,
    fonts: [],
    logoCandidates: [],
    assetCandidates: [],
    productCandidates: [],
    fallbackStages: stages,
  };

  let html = "";
  let pageText = "";
  let cssText = "";

  try {
    const htmlPass = await fetchText(parsedUrl.toString());
    extraction.normalizedUrl = htmlPass.finalUrl;
    stages.push({
      stage: "raw_html_parse",
      status: htmlPass.ok ? "completed" : "degraded",
      details: `HTTP ${htmlPass.status}`,
    });

    if (htmlPass.ok) {
      html = htmlPass.text;
      extraction.title = extractTitle(html);
      extraction.description =
        extractMetaContent(html, "name", "description") ??
        extractMetaContent(html, "property", "og:description");
      extraction.metadata = {
        ogTitle: extractMetaContent(html, "property", "og:title"),
        ogImage: extractMetaContent(html, "property", "og:image"),
        twitterImage: extractMetaContent(html, "name", "twitter:image"),
      };
      extraction.logoCandidates = extractLogoCandidates(html, extraction.normalizedUrl);
      extraction.productCandidates = extractProductCandidates(html, extraction.normalizedUrl).map((candidate, index) => ({
        id: `extracted-product-${index + 1}`,
        type: "product-image",
        source: candidate.source,
        url: candidate.url,
        confidence: candidate.confidence,
      }));
      extraction.assetCandidates = extraction.logoCandidates.map((candidate, index) => ({
        id: `extracted-asset-${index + 1}`,
        type: candidate.type === "icon" ? "icon" : "brand-asset",
        source: candidate.source,
        url: candidate.url,
        confidence: candidate.confidence,
      }));
      pageText = stripHtml(html).slice(0, 6000);
    }
  } catch (error) {
    stages.push({
      stage: "raw_html_parse",
      status: "failed",
      details: error instanceof Error ? error.message : "HTML fetch failed",
    });
  }

  if (html) {
    const stylesheetLinks = limit(extractLinkHrefs(html, /stylesheet/i), 4).map((href) => absoluteUrl(extraction.normalizedUrl, href));
    const cssPayloads = await Promise.all(
      stylesheetLinks.map(async (href) => {
        if (!href) {
          return "";
        }

        try {
          const cssPass = await fetchText(href);
          return cssPass.ok ? cssPass.text : "";
        } catch {
          return "";
        }
      })
    );

    cssText = cssPayloads.join("\n");
    extraction.cssColors = rankBrandColors([
      ...extractThemeColors(html),
      ...extractHexColors(`${html}\n${cssText}`),
    ]);
    extraction.fonts = limit(extractFontHints(cssText), 6);
    stages.push({
      stage: "css_parse",
      status: cssText ? "completed" : "partial",
      details: cssText ? `Parsed ${cssPayloads.filter(Boolean).length} stylesheets` : "No readable stylesheet payloads",
    });
  } else {
    stages.push({
      stage: "css_parse",
      status: "skipped",
      details: "HTML fetch did not produce parseable markup",
    });
  }

  const renderedPass = await runRenderedBrowserPass(extraction.normalizedUrl);
  stages.push({
    stage: "rendered_browser_pass",
    status: renderedPass.status,
    details: renderedPass.details,
  });

  if (renderedPass.status === "completed") {
    extraction.normalizedUrl = renderedPass.normalizedUrl;
    extraction.title = extraction.title ?? renderedPass.title;

    if (renderedPass.logoCandidates.length > extraction.logoCandidates.length) {
      extraction.logoCandidates = renderedPass.logoCandidates;
      extraction.assetCandidates = renderedPass.logoCandidates.map((candidate, index) => ({
        id: `rendered-asset-${index + 1}`,
        type: candidate.type === "icon" ? "icon" : "brand-asset",
        source: `rendered:${candidate.source}`,
        url: candidate.url,
        confidence: candidate.confidence,
      }));
    }

    if ((renderedPass.productCandidates?.length ?? 0) > (extraction.productCandidates?.length ?? 0)) {
      extraction.productCandidates = renderedPass.productCandidates.map((candidate, index) => ({
        id: `rendered-product-${index + 1}`,
        type: "product-image",
        source: `rendered:${candidate.source}`,
        url: candidate.url,
        confidence: candidate.confidence,
      }));
    }

    if (!pageText && renderedPass.html) {
      pageText = stripHtml(renderedPass.html).slice(0, 6000);
    }

    extraction.screenshotColors = renderedPass.screenshotColors ?? [];
    extraction.uiSignalColors = renderedPass.uiSignalColors ?? [];
    extraction.logoColors = renderedPass.logoColors ?? [];
    extraction.screenshotZoneDebug = renderedPass.screenshotZoneDebug ?? [];
    extraction.screenshotUrl = renderedPass.screenshotUrl ?? null;
  }

  stages.push({
    stage: "screenshot_vision_analysis",
    status: extraction.screenshotColors.length >= 3 ? "completed" : "partial",
    details: extraction.screenshotColors.length >= 3
      ? `Extracted ${extraction.screenshotColors.length} rendered screenshot colors`
      : "Rendered screenshot palette was limited or unavailable",
  });

  let llmAnalysis = null;
  let paletteAnalysis = null;
  if (includeAi && GEMINI_API_KEY) {
    try {
      llmAnalysis = await analyzeWebsiteWithGemini({
        url: extraction.normalizedUrl,
        hostname: parsedUrl.hostname,
        title: extraction.title,
        description: extraction.description,
        pageText,
        productCandidates: extraction.productCandidates ?? [],
      });
      paletteAnalysis = await analyzeWebsitePaletteWithGemini({
        url: extraction.normalizedUrl,
        hostname: parsedUrl.hostname,
      });
      stages.push({
        stage: "llm_brand_summary",
        status: llmAnalysis ? "completed" : "partial",
        details: llmAnalysis ? "Gemini analyzed website purpose, product type, and brand colors" : "Gemini returned no usable structured analysis",
      });
    } catch (error) {
      stages.push({
        stage: "llm_brand_summary",
        status: "failed",
        details: error instanceof Error ? error.message : "Gemini brand analysis failed",
      });
    }
  } else {
    stages.push({
      stage: "llm_brand_summary",
      status: "skipped",
      details: "Gemini API key not configured",
    });
  }

  extraction.summary = summarizeProject({
    host: parsedUrl.hostname,
    title: extraction.title,
    description: extraction.description,
    pageText,
    productType: inferProductTypeFromSignals({
      hostname: parsedUrl.hostname,
      title: extraction.title,
      description: extraction.description,
      pageText,
      productCandidates: extraction.productCandidates ?? [],
    }),
  });
  if (llmAnalysis?.websiteAbout) {
    extraction.summary = llmAnalysis.websiteAbout;
  }
  if (llmAnalysis?.projectSnapshot) {
    extraction.summary = llmAnalysis.projectSnapshot;
  }
  if (paletteAnalysis?.primaryColor || paletteAnalysis?.otherColors?.length) {
    extraction.aiSuggestedColors = [paletteAnalysis.primaryColor, ...(paletteAnalysis.otherColors ?? [])].filter(Boolean);
  } else if (llmAnalysis?.primaryColor || llmAnalysis?.otherColors?.length) {
    extraction.aiSuggestedColors = [llmAnalysis.primaryColor, ...(llmAnalysis.otherColors ?? [])].filter(Boolean);
  }
  if (llmAnalysis?.productType) {
    extraction.aiSuggestedProductType = llmAnalysis.productType;
  }
  if (llmAnalysis?.brandFeel) {
    extraction.aiSuggestedBrandFeel = llmAnalysis.brandFeel;
  }
  if (paletteAnalysis?.colorNotes) {
    extraction.aiColorNotes = paletteAnalysis.colorNotes;
  } else if (llmAnalysis?.colorNotes) {
    extraction.aiColorNotes = llmAnalysis.colorNotes;
  }
  extraction.language = detectContentLanguage({
    url: extraction.normalizedUrl,
    html,
    title: extraction.title,
    description: extraction.description,
    pageText,
  });

  return {
    parsedUrl: new URL(extraction.normalizedUrl),
    extraction,
    pageText,
  };
}

function buildAssistant(productType, host) {
  return {
    headline: `Brand system detected for ${host}.`,
    body: `We identified a ${productType} brand. Review the details below.`,
  };
}

// ─── Brand detection response building ───
app.post("/api/brand/detect", async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A valid URL is required." });
  }

  try {
    const t0 = Date.now();
    const extractionResult = await runExtractionPipeline(url, { includeAi: false });
    const t1 = Date.now();
    console.log(`[brand-detect-timing] Extraction pipeline: ${t1 - t0}ms`);

    const detection = (await detectBrandFromExtraction(extractionResult, { includeAi: false })) ?? buildFallbackDetection(url);
    const t2 = Date.now();
    console.log(`[brand-detect-timing] Brand detection: ${t2 - t1}ms`);
    console.log(`[brand-detect-timing] Total: ${t2 - t0}ms`);

    if (!detection) {
      return res.status(400).json({ error: "The URL could not be parsed. Include a valid domain." });
    }

    sessions.set(detection.brand.url, detection);
    sessionContext.set(detection.brand.url, {
      pageText: extractionResult?.pageText ?? "",
    });
    return res.json(detection);
  } catch (error) {
    console.warn("[brand-detect-fallback]", error instanceof Error ? error.message : "Unknown detection error");
    const fallback = buildFallbackDetection(url);

    if (fallback) {
      fallback.assistant.body = `Backend extraction failed and fallback mode was used. ${error instanceof Error ? error.message : "Unknown error."}`;
      if (fallback.extraction?.fallbackStages) {
        fallback.extraction.fallbackStages.unshift({
          stage: "firecrawl_or_backend_error",
          status: "failed",
          details: error instanceof Error ? error.message : "Unknown detection error",
        });
      }
      sessions.set(fallback.brand.url, fallback);
      return res.json(fallback);
    }

    return res.status(500).json({ error: error instanceof Error ? error.message : "Brand detection failed." });
  }
});

app.post("/api/brand/refine", async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A valid URL is required." });
  }

  const parsedUrl = ensureUrl(url);
  if (!parsedUrl) {
    return res.status(400).json({ error: "A valid URL is required." });
  }

  try {
    const extractionResult = await runExtractionPipeline(parsedUrl.toString(), { includeAi: false });
    const refined = (await detectBrandFromExtraction(extractionResult, { includeAi: false })) ?? buildFallbackDetection(parsedUrl.toString());

    if (!refined) {
      return res.status(500).json({ error: "Brand refinement failed." });
    }

    sessions.set(refined.brand.url, refined);
    sessionContext.set(refined.brand.url, {
      pageText: extractionResult?.pageText ?? "",
    });
    return res.json(refined);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Brand refinement failed." });
  }
});

// Register a sample project as a session (so generate works without Firecrawl)
app.post("/api/sample-project", (req, res) => {
  const { brand } = req.body ?? {};
  if (!brand?.url) {
    return res.status(400).json({ error: "Missing brand data." });
  }
  const parsedUrl = ensureUrl(brand.url);
  if (!parsedUrl) {
    return res.status(400).json({ error: "Invalid URL." });
  }
  const sessionKey = parsedUrl.toString();
  const session = {
    brand: {
      name: brand.name || "Brand",
      url: brand.url,
      summary: brand.summary || "",
      productType: brand.productType || "saas",
      languageLabel: brand.languageLabel || "English",
      vibe: brand.vibe || "",
      tone: brand.tone || "",
      tagline: brand.tagline || "",
      palette: brand.palette || [],
      fonts: brand.fonts || [],
      logoCandidates: brand.logoCandidates || [],
      extractedAssets: [],
      extractedProducts: [],
      primaryColor: brand.palette?.[0] || "#333333",
      category: brand.category || brand.productType || "",
    },
    extraction: {
      metadata: {
        firecrawlBranding: brand.firecrawlBranding || null,
      },
      logoCandidates: brand.logoCandidates || [],
      summary: brand.summary || "",
    },
    assets: [],
    assistant: { headline: `${brand.name} loaded.`, body: brand.summary || "" },
  };
  sessions.set(sessionKey, session);
  console.log("[sample-project] Registered session for:", sessionKey);
  return res.json({ ok: true });
});
app.get("/api/image-proxy", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  const sanitizedUrl = sanitizeRemoteAssetUrl(url);

  if (!sanitizedUrl) {
    return res.status(400).send("Invalid image URL.");
  }

  try {
    const response = await fetch(sanitizedUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "MarketingStackBot/0.1 (+https://marketingstack.app)",
      },
    });

    if (!response.ok) {
      return res.status(502).send("Unable to fetch image.");
    }

    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED_REFERENCE_IMAGE_TYPES.has(mimeType)) {
      return res.status(415).send("Unsupported image type.");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(bytes);
  } catch {
    return res.status(502).send("Unable to fetch image.");
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});



// ─── Pipeline save/load (in-memory for demo) ───
const pipelineStore = new Map();
app.post("/api/pipelines/save", (req, res) => {
  const { userId, pipelines, brandData } = req.body ?? {};
  if (!userId) return res.status(400).json({ error: "Missing userId." });
  pipelineStore.set(userId, { pipelines: pipelines || [], brandData: brandData || null });
  return res.json({ ok: true });
});
// ─── Stripe subscription endpoints ───

// Check subscription status
app.get("/api/subscription/status", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const sub = await checkUserSubscription(userId);
  return res.json(sub);
});

// Create checkout session
app.post("/api/subscription/checkout", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
  const { userId, email, plan } = req.body ?? {};
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      metadata: { userId, plan: plan || "pro" },
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "Marketing Stack Pro",
            description: "Unlock all pipeline types — Graphic Posts, Lifestyle Shots, Loop Videos, Motion Design Videos — with daily automated generation and priority support.",
          },
          unit_amount: 200000, // $2,000 in cents
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      success_url: `${req.headers.origin || "https://marketingstack.app"}/dashboard?subscription=success`,
      cancel_url: `${req.headers.origin || "https://marketingstack.app"}/dashboard?subscription=cancelled`,
    });
    return res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("[stripe] Checkout error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Stripe webhook
app.post("/api/subscription/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(400).send("Stripe not configured");
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(typeof req.body === "string" ? req.body : req.body.toString());
    }
  } catch (err) {
    console.error("[stripe] Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    if (userId && url && key) {
      await fetch(`${url}/rest/v1/user_subscriptions`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: session.metadata?.plan || "pro",
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      console.log(`[stripe] Subscription activated for user ${userId}`);
    }
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    const status = subscription.status === "active" ? "active" : "cancelled";
    if (url && key) {
      await fetch(`${url}/rest/v1/user_subscriptions?stripe_subscription_id=eq.${subscription.id}`, {
        method: "PATCH",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      console.log(`[stripe] Subscription ${subscription.id} status → ${status}`);
    }
  }

  return res.json({ received: true });
});

// Manage subscription (customer portal)
app.post("/api/subscription/portal", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
  const { userId } = req.body ?? {};
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const sub = await checkUserSubscription(userId);
  if (!sub.stripeCustomerId) return res.status(400).json({ error: "No subscription found" });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${req.headers.origin || "https://marketingstack.app"}/dashboard`,
    });
    return res.json({ url: session.url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Brand detection endpoint: http://localhost:${PORT}/api/brand/detect`);
  console.log(`Asset generation endpoint: http://localhost:${PORT}/api/assets/generate`);
});
