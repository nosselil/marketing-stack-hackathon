import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "./supabase";
import { AuthPopup } from "./AuthPopup";
import type { User } from "@supabase/supabase-js";
import { sampleProjects } from "./sampleProjects";
import type { SampleProject } from "./sampleProjects";
import { UserDashboard } from "./UserDashboard";
import "./UserDashboard.css";
import { PipelinePanel } from "./PipelinePanel";
import type { Pipeline } from "./PipelinePanel";
import "./PipelinePanel.css";
import { saveBrand, loadBrands, savePipeline, loadPipelines, saveGeneratedAsset } from "./db";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Download,
  Image as ImageIcon,
  Palette,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import "./App.css";

type ProductType =
  | "saas"
  | "ai tool / automation"
  | "developer tools"
  | "cybersecurity"
  | "marketplace"
  | "ecommerce brand"
  | "consumer app"
  | "telecom / internet provider"
  | "fintech / payments"
  | "banking / lending"
  | "insurance"
  | "gaming / entertainment"
  | "agency / service business"
  | "local service business"
  | "legal / law firm"
  | "recruiting / staffing"
  | "hr / payroll"
  | "nonprofit / community"
  | "media / content brand"
  | "education / coaching"
  | "school / university"
  | "travel / tourism"
  | "real estate / hospitality"
  | "events / nightlife"
  | "wedding / event services"
  | "photography / creative studio"
  | "health / wellness"
  | "medical clinic"
  | "dental / orthodontics"
  | "food / beverage brand"
  | "restaurant / cafe"
  | "bakery / dessert brand"
  | "chocolate / confectionery brand"
  | "grocery / supermarket"
  | "supplements / nutrition"
  | "beauty / skincare brand"
  | "fashion / apparel brand"
  | "jewelry / accessories brand"
  | "baby / kids brand"
  | "pet brand / pet services"
  | "sports / fitness brand"
  | "home / furniture brand"
  | "hardware / electronics"
  | "industrial / manufacturing"
  | "construction / trades"
  | "plumbing / HVAC"
  | "cleaning / maintenance service"
  | "solar / energy"
  | "agriculture / farming"
  | "automotive / mobility"
  | "automotive dealership"
  | "motorcycle / powersports dealership"
  | "boat / marine dealership"
  | "mechanic / auto repair"
  | "logistics / delivery"
  | "consumer electronics"
  | "mobile app"
  | "streaming / subscription"
  | "crypto / web3"
  | "consulting / professional services"
  | "coworking / office space"
  | "pharmacy / medical supply"
  | "cannabis / CBD"
  | "wine / spirits / brewery"
  | "coffee / tea brand"
  | "music / audio brand"
  | "art / gallery"
  | "print / publishing"
  | "government / public sector"
  | "religious / spiritual organization"
  | "charity / foundation"
  | "political campaign"
  | "personal brand / influencer"
  | "freelancer / solopreneur"
  | "startup (pre-launch)"
  | "other";

type StyleOption = {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
};

type RemotionScene = {
  id: string;
  title: string;
  durationSeconds: number;
  visual: string;
  motion: string;
  voiceover: string;
  icon: string;
};

type RemotionPlan = {
  blueprintId: string;
  blueprintLabel: string;
  blueprintSourcePath: string;
  durationSeconds: number;
  aspectRatio: string;
  iconLibrary: string;
  musicCue: string;
  voiceoverProvider: string;
  voiceoverCharacter: string;
  scenes: RemotionScene[];
};

type Asset = {
  id: string;
  title: string;
  meta: string;
  format: string;
  channel: string;
  status: string;
  concept: string;
  previewUrl?: string;
  mediaUrl?: string;
  provider?: string;
  providerMessage?: string;
  generationDebug?: {
    attemptedRemoteReferenceUrls: string[];
    attachedRemoteReferenceUrls: string[];
    attachedLocalReferenceFiles: string[];
    attachedReferenceCount: number;
    attachedLogoReferenceUrl?: string | null;
    attachedBrandAssetUrls?: string[];
    sceneFrameUrls?: string[];
    prompt: string;
  };
  remotionPlan?: RemotionPlan;
};

type LogoCandidate = {
  url: string;
  type: string;
  source: string;
  confidence: number;
  alt?: string;
};

type ExtractedAsset = {
  id: string;
  type: string;
  source: string;
  url: string;
  confidence: number;
};

function buildRemoteAssetPreviewUrl(url?: string | null) {
  if (!url) {
    return "";
  }

  if (url.startsWith("data:")) {
    return url;
  }

  return `${API_BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

type ExtractionStage = {
  stage: string;
  status: string;
  details: string;
};

type ExtractionResult = {
  sourceUrl: string;
  normalizedUrl: string;
  title: string | null;
  description: string | null;
  summary?: string | null;
  language?: {
    code: string;
    label: string;
  };
  metadata: {
    ogTitle?: string | null;
    ogImage?: string | null;
    twitterImage?: string | null;
  };
  cssColors: string[];
  uiSignalColors?: string[];
  logoColors?: string[];
  screenshotColors: string[];
  screenshotUrl?: string | null;
  screenshotZoneDebug?: Array<{
    id: string;
    weight: number;
    filter: string;
    colors: string[];
    imageUrl?: string;
  }>;
  fonts: string[];
  logoCandidates: LogoCandidate[];
  assetCandidates: ExtractedAsset[];
  productCandidates?: ExtractedAsset[];
  fallbackStages: ExtractionStage[];
};

type BrandDetectionResponse = {
  brand: {
    name: string;
    url: string;
    category: string;
    tone: string;
    vibe?: string;
    primaryColor: string;
    palette: string[];
    summary?: string;
    language?: string;
    languageLabel?: string;
    logoReadiness: string;
    editableFont: string;
    productType: ProductType;
    logoCandidates?: LogoCandidate[];
    extractedAssets?: ExtractedAsset[];
    extractedProducts?: ExtractedAsset[];
  };
  styles: StyleOption[];
  recommendedStyleId: string;
  assistant: {
    headline: string;
    body: string;
  };
  assets: Asset[];
  extraction?: ExtractionResult;
};

type AssetMutationResponse = {
  asset?: Asset;
  assets: Asset[];
  assistant: {
    headline: string;
    body: string;
  };
};

type EditablePaletteColor = {
  id: string;
  value: string;
  enabled: boolean;
};

type BrandColorConfig = {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  buttonBg: string;
  buttonText: string;
  accentBg: string;
  accentText: string;
};

const defaultBrandColorConfig: BrandColorConfig = {
  primary: "",
  secondary: "",
  background: "",
  text: "",
  buttonBg: "",
  buttonText: "",
  accentBg: "",
  accentText: "",
};

const brandColorRoles: { key: keyof BrandColorConfig; label: string; hint: string }[] = [
  { key: "primary", label: "Primary", hint: "Main brand color" },
  { key: "secondary", label: "Secondary", hint: "Supporting color" },
  { key: "background", label: "Background", hint: "Page background" },
  { key: "text", label: "Text", hint: "Body text color" },
  { key: "buttonBg", label: "Button", hint: "CTA button fill" },
  { key: "buttonText", label: "Button Text", hint: "Text on buttons" },
  { key: "accentBg", label: "Accent BG", hint: "Highlighted sections" },
  { key: "accentText", label: "Accent Text", hint: "Links & highlights" },
];

const workflowSteps = [
  "Paste a website",
  "Detect brand system",
  "Approve style direction",
  "Generate daily content",
];

const featureCards = [
  {
    title: "Brand detection",
    copy: "Instantly reads the brand system from a product URL and turns it into a usable content direction.",
    animation: "detect",
  },
  {
    title: "Autopublish to all your socials",
    copy: "Push approved content across Reddit, X, TikTok, Instagram, LinkedIn, and Facebook from one system.",
    animation: "socials",
  },
  {
    title: "Up to 60+ contents a day",
    copy: "Run a high-volume daily output across posts, blog drafts, visuals, and short-form assets without rebuilding the workflow.",
    animation: "volume",
  },
] as const;

const defaultStyles: StyleOption[] = [
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

const starterAssets: Asset[] = [
  {
    id: "starter-graphic-post",
    title: "Graphic post",
    meta: "Instagram / Image",
    format: "Image",
    channel: "Instagram",
    status: "Ready to generate",
    concept: "Designed visual or branded mockup with crisp hierarchy, product framing, and ad-led composition.",
    previewUrl: "/thumbnails/graphic-post.png",
  },
  {
    id: "starter-lifestyle-post",
    title: "Lifestyle shot",
    meta: "Instagram / Image",
    format: "Image",
    channel: "Instagram",
    status: "Ready to generate",
    concept: "Lifestyle or product-in-use creative that feels human, premium, and native to social.",
    previewUrl: "/thumbnails/lifestyle-shot.png",
  },
  {
    id: "starter-kling-video",
    title: "Kling video",
    meta: "Kling / Video",
    format: "Video",
    channel: "Kling",
    status: "Ready to generate",
    concept: "Premium AI video ad guided by the extracted brand system, product, and website styling.",
    previewUrl: "/thumbnails/kling-video.webm",
  },
  {
    id: "starter-remotion-video",
    title: "Motion Design video",
    meta: "Motion Design / Video",
    format: "Video",
    channel: "Remotion",
    status: "Draft",
    concept: "Short looping teaser built from product screenshots and motion captions.",
    previewUrl: "/thumbnails/remotion-video.webm",
  },
];

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.port === "5173"
    ? "http://127.0.0.1:3001"
    : "");

const productTypeOptions: ProductType[] = [
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
  "consumer electronics",
  "mobile app",
  "streaming / subscription",
  "crypto / web3",
  "consulting / professional services",
  "coworking / office space",
  "pharmacy / medical supply",
  "cannabis / CBD",
  "wine / spirits / brewery",
  "coffee / tea brand",
  "music / audio brand",
  "art / gallery",
  "print / publishing",
  "government / public sector",
  "religious / spiritual organization",
  "charity / foundation",
  "political campaign",
  "personal brand / influencer",
  "freelancer / solopreneur",
  "startup (pre-launch)",
  "other",
];

function productTypeBucket(productType: ProductType) {
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

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sanitizeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "asset-preview";
}

function createEditablePalette(colors: string[]) {
  const normalized = colors
    .filter((color) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color))
    .slice(0, 4);

  return Array.from({ length: 4 }, (_, index) => ({
    id: `palette-${index}`,
    value: normalized[index] ?? "",
    enabled: Boolean(normalized[index]),
  }));
}

function normalizeUrl(value: string) {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function toBrandName(hostname: string) {
  const root = hostname.replace(/^www\./, "").split(".")[0] || "brand";
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferProductTypeFromUrl(hostname: string): ProductType {
  const value = hostname.toLowerCase();

  if (/(ai|gpt|agent|agents|automation|copilot|assistant|workflow)/i.test(value)) {
    return "ai tool / automation";
  }

  if (/(dev|developer|api|sdk|cloud|infra|git|deploy|hosting|database)/i.test(value)) {
    return "developer tools";
  }

  if (/(security|secure|cyber|vpn|identity|auth|soc|firewall)/i.test(value)) {
    return "cybersecurity";
  }

  if (/(ooredoo|orange|vodafone|telecom|telco|internet|fiber|fibre|carrier|sim)/i.test(value)) {
    return "telecom / internet provider";
  }

  if (/(flouci|pay|payment|wallet|bank|fintech|checkout|card)/i.test(value)) {
    return "fintech / payments";
  }

  if (/(loan|mortgage|lending|creditunion|credit-union|banking)/i.test(value)) {
    return "banking / lending";
  }

  if (/(insurance|assurance|insure|policy|broker)/i.test(value)) {
    return "insurance";
  }

  if (/(market|classified|listing|directory|kijiji|airbnb|booking)/i.test(value)) {
    return "marketplace";
  }

  if (/(food|drink|coffee|tea|snack|restaurant|meal|bakery)/i.test(value)) {
    return "food / beverage brand";
  }

  if (/(restaurant|cafe|bistro|diner|grill|eatery|pizzeria)/i.test(value)) {
    return "restaurant / cafe";
  }

  if (/(bakery|patisserie|pastry|dessert|cookies|cookie)/i.test(value)) {
    return "bakery / dessert brand";
  }

  if (/(chocolate|chocolat|cocoa|confection|candy|biscuit|biscuits)/i.test(value)) {
    return "chocolate / confectionery brand";
  }

  if (/(grocery|supermarket|grocer|marketfresh|foodhall)/i.test(value)) {
    return "grocery / supermarket";
  }

  if (/(supplement|protein|vitamin|nutrition|wellnessshop|preworkout)/i.test(value)) {
    return "supplements / nutrition";
  }

  if (/(beauty|skincare|cosmetic|makeup|haircare|fragrance)/i.test(value)) {
    return "beauty / skincare brand";
  }

  if (/(fashion|apparel|shoe|shoes|jewelry|jewellery|bag|streetwear)/i.test(value)) {
    return "fashion / apparel brand";
  }

  if (/(jewelry|jewellery|watch|accessories|accessory|rings|necklace|bracelet)/i.test(value)) {
    return "jewelry / accessories brand";
  }

  if (/(baby|kids|children|toys|nursery|stroller)/i.test(value)) {
    return "baby / kids brand";
  }

  if (/(pet|pets|dog|cat|veterinary|vet|grooming)/i.test(value)) {
    return "pet brand / pet services";
  }

  if (/(sport|fitness|gym|training|athletic|athletics)/i.test(value)) {
    return "sports / fitness brand";
  }

  if (/(furniture|decor|interior|mattress|sofa|homegoods)/i.test(value)) {
    return "home / furniture brand";
  }

  if (/(hardware|electronics|gadget|device|laptop|phone|headphone|headphones)/i.test(value)) {
    return "hardware / electronics";
  }

  if (/(industrial|factory|manufacturing|machinery|equipment|b2bindustrial)/i.test(value)) {
    return "industrial / manufacturing";
  }

  if (/(construction|contractor|builders|roofing|renovation|remodel)/i.test(value)) {
    return "construction / trades";
  }

  if (/(plumb|hvac|heating|cooling|airconditioning|air-conditioning)/i.test(value)) {
    return "plumbing / HVAC";
  }

  if (/(cleaning|janitorial|maid|maintenance|facilityservice)/i.test(value)) {
    return "cleaning / maintenance service";
  }

  if (/(solar|energy|power|renewable|electricity)/i.test(value)) {
    return "solar / energy";
  }

  if (/(farm|farming|agri|agro|tractor|crop)/i.test(value)) {
    return "agriculture / farming";
  }

  if (/(car|auto|vehicle|mobility|ride|rideshare|ev)/i.test(value)) {
    return "automotive / mobility";
  }

  if (/(cardealer|car-dealer|motors|autosales|dealership)/i.test(value)) {
    return "automotive dealership";
  }

  if (/(motorcycle|motorbike|bike|bikes|powersport|atv|utv)/i.test(value)) {
    return "motorcycle / powersports dealership";
  }

  if (/(boat|marine|yacht|outboard|watercraft)/i.test(value)) {
    return "boat / marine dealership";
  }

  if (/(mechanic|autorepair|auto-repair|garage|servicecenter|service-centre)/i.test(value)) {
    return "mechanic / auto repair";
  }

  if (/(delivery|logistics|shipping|courier|freight|dispatch)/i.test(value)) {
    return "logistics / delivery";
  }

  if (/(travel|tour|trip|vacation|flight|airline|tourism)/i.test(value)) {
    return "travel / tourism";
  }

  if (/(game|gaming|stream|esports|music|video|movie|entertainment)/i.test(value)) {
    return "gaming / entertainment";
  }

  if (/(shop|store|supplement)/i.test(value)) {
    return "ecommerce brand";
  }

  if (/(agency|studio|consult|service)/i.test(value)) {
    return "agency / service business";
  }

  if (/(law|legal|attorney|lawyer|injuryfirm)/i.test(value)) {
    return "legal / law firm";
  }

  if (/(recruit|staffing|talent|jobs|careers|headhunt)/i.test(value)) {
    return "recruiting / staffing";
  }

  if (/(payroll|hr|humanresources|human-resources|peopleops)/i.test(value)) {
    return "hr / payroll";
  }

  if (/(nonprofit|charity|foundation|donate|community)/i.test(value)) {
    return "nonprofit / community";
  }

  if (/(clinic|care|health|wellness|med|therapy)/i.test(value)) {
    return "health / wellness";
  }

  if (/(clinic|medical|doctor|physio|physiotherapy|urgentcare)/i.test(value)) {
    return "medical clinic";
  }

  if (/(dental|dentist|orthodont|ortho)/i.test(value)) {
    return "dental / orthodontics";
  }

  if (/(course|academy|school|learn|coach|training)/i.test(value)) {
    return "education / coaching";
  }

  if (/(school|college|university|campus|faculty)/i.test(value)) {
    return "school / university";
  }

  if (/(news|media|mag|podcast|blog)/i.test(value)) {
    return "media / content brand";
  }

  if (/(event|festival|concert|club|nightlife|venue)/i.test(value)) {
    return "events / nightlife";
  }

  if (/(wedding|bridal|planner|eventplanning|event-planning)/i.test(value)) {
    return "wedding / event services";
  }

  if (/(photo|photography|videography|creative|productionstudio)/i.test(value)) {
    return "photography / creative studio";
  }

  if (/(home|realty|rent|stay|hotel|travel)/i.test(value)) {
    return "real estate / hospitality";
  }

  if (/(app|mobile|consumer)/i.test(value)) {
    return "consumer app";
  }

  return "saas";
}

function toneForProductType(productType: ProductType) {
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
    return "Busy, practical, trust-building";
  }

  if (productType === "telecom / internet provider") {
    return "Accessible, reliable, high-coverage";
  }

  if (productType === "fintech / payments") {
    return "Secure, modern, confidence-building";
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

  if (productType === "banking / lending") {
    return "Stable, clear, confidence-building";
  }

  if (productType === "insurance") {
    return "Trustworthy, reassuring, low-friction";
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

  if (productType === "ecommerce brand") {
    return "Aspirational, tactile, premium";
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
    "events / nightlife",
    "wedding / event services",
    "photography / creative studio",
    "construction / trades",
    "plumbing / HVAC",
    "cleaning / maintenance service",
  ].includes(productType)) {
    return "Trustworthy, human, reassuring";
  }

  if (productType === "media / content brand") {
    return "Editorial, sharp, current";
  }

  if (["health / wellness", "medical clinic", "dental / orthodontics", "supplements / nutrition"].includes(productType)) {
    return "Clean, calming, trustworthy";
  }

  return "Clear, modern, direct";
}

function categoryForProductType(productType: ProductType) {
  return productType
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function fontForProductType(productType: ProductType) {
  if (productTypeBucket(productType) === "physical") {
    return "Sora";
  }

  if ([
    "telecom / internet provider",
    "fintech / payments",
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

function buildDemoAsset({
  websiteUrl,
  productType,
  styleId,
  count,
}: {
  websiteUrl: string;
  productType: ProductType;
  styleId: string;
  count: number;
}): Asset {
  const normalizedValue = websiteUrl.trim() || "marketingstack.app";
  const host = normalizedValue
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0] || "marketingstack";
  const baseName = host.split(".")[0] || "marketingstack";
  const titlePrefix =
    productTypeBucket(productType) === "physical"
      ? "Studio reveal"
      : productTypeBucket(productType) === "service"
        ? "Service explainer"
        : "Graphic post";

  return {
    id: `${baseName}-demo-${Date.now()}-${count}`,
    title: `${titlePrefix} ${count}`,
    meta:
      productTypeBucket(productType) === "physical"
        ? "Instagram / Image"
        : productTypeBucket(productType) === "service"
          ? "LinkedIn / Blog"
          : "LinkedIn / Image",
    format: productTypeBucket(productType) === "service" ? "Blog" : "Image",
    channel: productTypeBucket(productType) === "service" ? "LinkedIn" : "Instagram",
    status: productTypeBucket(productType) === "service" ? "Coming soon" : "Generated",
    concept:
      productTypeBucket(productType) === "physical"
        ? `Studio-lit product composition for ${baseName} using the ${styleId} direction.`
        : productTypeBucket(productType) === "service"
          ? `Editorial service concept for ${baseName}; image output is still coming soon.`
          : `Screenshot-led campaign asset for ${baseName} using the ${styleId} direction.`,
  } satisfies Asset;
}

function buildLocalRemotionPlan({
  brandName,
  productType,
  styleId,
  title,
}: {
  brandName: string;
  productType: ProductType;
  styleId: string;
  title: string;
}): RemotionPlan {
  const blueprintLabel =
    productTypeBucket(productType) === "service"
      ? "Social media service"
      : productType === "saas" || productType === "consumer app"
        ? "SaaS dashboard"
        : "Product demo";

  return {
    blueprintId: blueprintLabel.toLowerCase().replace(/\s+/g, "-"),
    blueprintLabel,
    blueprintSourcePath: "/Users/w/Desktop/keeping/Botface_Code/Botface/Remotiontemplates",
    durationSeconds: 13.5,
    aspectRatio: "16:9",
    iconLibrary: "Lucide + brand icons",
    musicCue:
      productTypeBucket(productType) === "service"
        ? "warm trust-building pulse"
        : productTypeBucket(productType) === "physical"
          ? "glossy launch beat"
          : "modern product pulse",
    voiceoverProvider: "ElevenLabs-ready",
    voiceoverCharacter: productTypeBucket(productType) === "service" ? "expert" : "salesperson",
    scenes: [
      {
        id: "scene-1",
        title: "Hook",
        durationSeconds: 4,
        visual: `${brandName} opens on a bold ${title.toLowerCase()} hook with logo, palette, and first proof point.`,
        motion: `${styleId} motion language with a calm reveal and fast headline entrance.`,
        voiceover: `${brandName} in one line: show the problem and why this brand matters now.`,
        icon: "sparkles",
      },
      {
        id: "scene-2",
        title: "Proof",
        durationSeconds: 5,
        visual: `Bring in product screenshots, offer framing, and one differentiated feature for ${brandName}.`,
        motion: "UI cards slide with subtle depth and icon accents.",
        voiceover: `Explain the product value and what makes ${brandName} feel credible.`,
        icon: productTypeBucket(productType) === "service" ? "shield-check" : "panels-top-left",
      },
      {
        id: "scene-3",
        title: "CTA",
        durationSeconds: 4.5,
        visual: `Land on a clean CTA end-card with brand mark, URL, and a final promise.`,
        motion: "Soft zoom-out with a measured CTA pulse.",
        voiceover: `Invite viewers to try ${brandName} now.`,
        icon: "arrow-up-right",
      },
    ],
  };
}

function buildLocalRemotionAsset({
  websiteUrl,
  productType,
  styleId,
  selectedTemplate,
}: {
  websiteUrl: string;
  productType: ProductType;
  styleId: string;
  selectedTemplate: Asset;
}): Asset {
  const parsedUrl = normalizeUrl(websiteUrl);
  const brandName = toBrandName(parsedUrl?.hostname ?? "marketingstack");
  const remotionPlan = buildLocalRemotionPlan({
    brandName,
    productType,
    styleId,
    title: selectedTemplate.title,
  });

  return {
    id: `remotion-plan-${Date.now()}`,
    title: `${selectedTemplate.title} brief`,
    meta: "Remotion / Video",
    format: "Video",
    channel: "Remotion",
    status: "Brief ready",
    provider: "remotion-plan",
    providerMessage: "Backend video planner unavailable. Using the local Motion Design brief fallback.",
    concept: `Three-scene Motion Design brief for ${brandName}, using the ${remotionPlan.blueprintLabel.toLowerCase()} starter and ${styleId} direction.`,
    remotionPlan,
  } satisfies Asset;
}

function buildAssetPreviewDataUrl({
  asset,
  palette,
  brandName,
  styleName,
}: {
  asset: Asset | null;
  palette: string[];
  brandName: string;
  styleName: string;
}) {
  if (!asset) {
    return "";
  }

  if (asset.previewUrl) {
    return asset.previewUrl;
  }

  if (asset.remotionPlan) {
    const [accent = "#9CFF8F", secondary = "#57D19B", deep = "#04110D"] = palette;
    const sceneMarkup = asset.remotionPlan.scenes
      .slice(0, 3)
      .map((scene, index) => `
        <rect x="110" y="${220 + (index * 210)}" width="980" height="168" rx="34" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
        <text x="150" y="${276 + (index * 210)}" fill="rgba(255,255,255,0.66)" font-size="28" font-family="Inter, Arial, sans-serif">Scene ${index + 1} • ${scene.durationSeconds.toFixed(1)}s</text>
        <text x="150" y="${328 + (index * 210)}" fill="#FFFFFF" font-size="44" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeSvgText(scene.title)}</text>
        <foreignObject x="150" y="${350 + (index * 210)}" width="710" height="86">
          <div xmlns="http://www.w3.org/1999/xhtml" style="color: rgba(255,255,255,0.82); font-size: 28px; line-height: 1.3; font-family: Inter, Arial, sans-serif;">
            ${escapeSvgText(scene.visual)}
          </div>
        </foreignObject>
        <circle cx="970" cy="${304 + (index * 210)}" r="52" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
        <text x="970" y="${316 + (index * 210)}" text-anchor="middle" fill="${accent}" font-size="30" font-weight="700" font-family="Inter, Arial, sans-serif">${index + 1}</text>
      `)
      .join("");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${deep}" />
            <stop offset="55%" stop-color="${secondary}" />
            <stop offset="100%" stop-color="${accent}" />
          </linearGradient>
        </defs>
        <rect width="1200" height="1200" rx="72" fill="url(#bg)" />
        <rect x="72" y="72" width="1056" height="1056" rx="52" fill="rgba(4,17,13,0.38)" stroke="rgba(255,255,255,0.12)" />
        <text x="120" y="154" fill="rgba(255,255,255,0.72)" font-size="34" font-family="Inter, Arial, sans-serif">Motion Design brief • ${escapeSvgText(brandName)}</text>
        <text x="120" y="210" fill="#FFFFFF" font-size="72" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeSvgText(asset.title)}</text>
        ${sceneMarkup}
        <text x="120" y="1126" fill="rgba(255,255,255,0.7)" font-size="30" font-family="Inter, Arial, sans-serif">${escapeSvgText(asset.remotionPlan.blueprintLabel)} • ${escapeSvgText(asset.remotionPlan.voiceoverProvider)} • ${escapeSvgText(styleName)}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const [accent = "#9CFF8F", secondary = "#57D19B", deep = "#04110D"] = palette;
  const title = escapeSvgText(asset.title);
  const meta = escapeSvgText(asset.meta);
  const concept = escapeSvgText(asset.concept);
  const brand = escapeSvgText(brandName);
  const style = escapeSvgText(styleName);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${deep}" />
          <stop offset="55%" stop-color="${secondary}" />
          <stop offset="100%" stop-color="${accent}" />
        </linearGradient>
        <radialGradient id="orb" cx="76%" cy="18%" r="48%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.82" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="1200" rx="72" fill="url(#bg)" />
      <rect width="1200" height="1200" rx="72" fill="url(#orb)" />
      <rect x="72" y="72" width="1056" height="1056" rx="52" fill="rgba(4,17,13,0.34)" stroke="rgba(255,255,255,0.12)" />
      <text x="120" y="158" fill="rgba(255,255,255,0.78)" font-size="34" font-family="Inter, Arial, sans-serif">${brand}</text>
      <text x="120" y="284" fill="#FFFFFF" font-size="112" font-weight="700" font-family="Inter, Arial, sans-serif">${title}</text>
      <text x="120" y="350" fill="rgba(255,255,255,0.72)" font-size="38" font-family="Inter, Arial, sans-serif">${meta}</text>
      <rect x="120" y="426" width="456" height="10" rx="5" fill="${accent}" fill-opacity="0.92" />
      <foreignObject x="120" y="486" width="780" height="260">
        <div xmlns="http://www.w3.org/1999/xhtml" style="color: rgba(255,255,255,0.94); font-size: 44px; line-height: 1.28; font-family: Inter, Arial, sans-serif;">
          ${concept}
        </div>
      </foreignObject>
      <rect x="120" y="872" width="312" height="154" rx="34" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
      <text x="160" y="934" fill="rgba(255,255,255,0.66)" font-size="28" font-family="Inter, Arial, sans-serif">Direction</text>
      <text x="160" y="986" fill="#FFFFFF" font-size="42" font-weight="600" font-family="Inter, Arial, sans-serif">${style}</text>
      <circle cx="930" cy="920" r="156" fill="rgba(255,255,255,0.1)" />
      <circle cx="930" cy="920" r="114" fill="${accent}" fill-opacity="0.94" />
      <text x="930" y="936" text-anchor="middle" fill="${deep}" font-size="68" font-weight="700" font-family="Inter, Arial, sans-serif">MS</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function PhoneMockup({
  title,
  subtitle,
  variant,
}: {
  title: string;
  subtitle: string;
  variant: "brand" | "workflow" | "library";
}) {
  return (
    <div className={`phone phone-${variant}`}>
      <div className="phone-top">
        <span className="phone-dot" />
        <span className="phone-speaker" />
      </div>
      <div className="phone-content">
        <p className="phone-label">{subtitle}</p>
        <h3>{title}</h3>

        {variant === "brand" && (
          <div className="phone-stack">
            <div className="mini-chip">Brand detected</div>
            <div className="swatch-row">
              <span style={{ background: "#9CFF8F" }} />
              <span style={{ background: "#6EBB73" }} />
              <span style={{ background: "#244E37" }} />
            </div>
            <div className="soft-line" />
            <div className="soft-line short" />
          </div>
        )}

        {variant === "workflow" && (
          <div className="phone-stack">
            {workflowSteps.map((step) => (
              <div key={step} className="workflow-row">
                <Check size={14} />
                <span>{step}</span>
              </div>
            ))}
          </div>
        )}

        {variant === "library" && (
          <div className="phone-grid">
            {starterAssets.map((item) => (
              <div key={item.id} className="asset-tile">
                <div className="asset-thumb" />
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureCardAnimation({ variant }: { variant: "detect" | "socials" | "volume" }) {
  if (variant === "detect") {
    return (
      <div className="feature-anim feature-anim-detect" aria-hidden="true">
        <div className="feature-browser">
          <span className="feature-browser-dot" />
          <span className="feature-browser-dot" />
          <span className="feature-browser-dot" />
          <div className="feature-browser-url" />
          <div className="feature-browser-line wide" />
          <div className="feature-browser-line" />
          <div className="feature-browser-swatches">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="feature-floating-pill detect-pill-a">Tone</div>
        <div className="feature-floating-pill detect-pill-b">Palette</div>
      </div>
    );
  }

  if (variant === "socials") {
    return (
      <div className="feature-anim feature-anim-socials" aria-hidden="true">
        <div className="feature-social-ring ring-ultra" />
        <div className="feature-social-ring ring-xxxl" />
        <div className="feature-social-ring ring-max" />
        <div className="feature-social-ring ring-max-minus" />
        <div className="feature-social-ring ring-xxl" />
        <div className="feature-social-ring ring-xl-plus" />
        <div className="feature-social-ring ring-xl" />
        <div className="feature-social-ring ring-outer-plus" />
        <div className="feature-social-ring ring-outer" />
        <div className="feature-social-ring ring-mid-plus" />
        <div className="feature-social-ring ring-mid" />
        <div className="feature-social-ring ring-mid-minus" />
        <div className="feature-social-ring ring-inner-plus" />
        <div className="feature-social-ring ring-inner" />
        <div className="feature-social-ring ring-inner-minus" />
        <div className="feature-social-ring ring-core-plus" />
        <div className="feature-social-core">MS</div>
        <div className="feature-social-chip chip-reddit"><SocialIcon brand="reddit" /></div>
        <div className="feature-social-chip chip-x"><SocialIcon brand="x" /></div>
        <div className="feature-social-chip chip-tiktok"><SocialIcon brand="tiktok" /></div>
        <div className="feature-social-chip chip-instagram"><SocialIcon brand="instagram" /></div>
        <div className="feature-social-chip chip-linkedin"><SocialIcon brand="linkedin" /></div>
        <div className="feature-social-chip chip-facebook"><SocialIcon brand="facebook" /></div>
      </div>
    );
  }

  return (
    <div className="feature-anim feature-anim-volume" aria-hidden="true">
      <div className="feature-volume-meter">
        <div className="feature-volume-bar bar-a" />
        <div className="feature-volume-bar bar-b" />
        <div className="feature-volume-bar bar-c" />
      </div>
      <div className="feature-volume-counter">
        <strong>60+</strong>
        <span>daily outputs</span>
      </div>
      <div className="feature-volume-stack stack-a" />
      <div className="feature-volume-stack stack-b" />
    </div>
  );
}

function SocialIcon({ brand }: { brand: "reddit" | "x" | "tiktok" | "instagram" | "linkedin" | "facebook" }) {
  if (brand === "reddit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M14.2 15.3c-.5.5-1.3.8-2.2.8-.9 0-1.7-.3-2.2-.8-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0 .3.3.8.5 1.5.5s1.2-.2 1.5-.5c.2-.2.5-.2.7 0 .2.2.2.5 0 .7ZM9 12.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm5-1.2c0-1.1-.9-2-2-2-.6 0-1.2.3-1.5.7-1-.7-2.4-1.2-4-1.2l.8-2.5 2.1.5a1.5 1.5 0 1 0 .2-1c-.2 0-.4 0-.5.1l-2.5-.6a.5.5 0 0 0-.6.3l-1 3.1c-1.7 0-3.2.5-4.2 1.2A2 2 0 0 0 4 7a2 2 0 0 0 0 4v.2C4 14.4 7.6 17 12 17s8-2.6 8-5.8V11a2 2 0 0 0 0-2Z"
        />
      </svg>
    );
  }

  if (brand === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M18.9 2H21l-6.9 7.9L22 22h-6.2l-4.9-6.9L4.8 22H2.7l7.4-8.4L2.5 2h6.3l4.4 6.2L18.9 2Zm-2.2 18h1.7L7.8 3.9H6.1L16.7 20Z"
        />
      </svg>
    );
  }

  if (brand === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M14.8 3c.5 1.6 1.4 2.9 2.7 3.7 1 .6 2 .9 3 .9V10c-1.2 0-2.4-.3-3.5-.8v5.8a5 5 0 1 1-5-5h.4v2.5H12a2.5 2.5 0 1 0 2.8 2.5V3h2Z"
        />
      </svg>
    );
  }

  if (brand === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm9.75 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
        />
      </svg>
    );
  }

  if (brand === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3A2.03 2.03 0 0 0 3.2 5.03c0 1.11.9 2.02 2 2.02h.03a2.03 2.03 0 1 0 .02-4.06ZM20.8 12.86c0-3.38-1.8-4.96-4.2-4.96-1.94 0-2.8 1.07-3.29 1.82V8.5H9.94c.04.81 0 11.5 0 11.5h3.37v-6.42c0-.34.02-.68.13-.92.27-.68.9-1.38 1.95-1.38 1.38 0 1.94 1.04 1.94 2.56V20H20.8v-7.14Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.2-1.6 1.5-1.6H17V4.5c-.3 0-1.3-.1-2.5-.1-2.4 0-4 1.5-4 4.2V11H8v3.1h2.5V22h3Z"
      />
    </svg>
  );
}

function LockupVisual({ variant, isActive }: { variant: "detect" | "chaos" | "system" | "daily"; isActive: boolean }) {
  return (
    <div className={`lockup-product-graphic lockup-product-graphic-${variant} ${isActive ? "is-active" : ""}`}>
      {variant === "detect" && (
        <>
          <div className="graphic-panel graphic-browser">
            <div className="graphic-browser-top">
              <span />
              <span />
              <span />
            </div>
            <div className="graphic-url-bar">marketingstack.app</div>
            <div className="graphic-scan-grid">
              <div className="graphic-scan-block graphic-scan-logo" />
              <div className="graphic-scan-block graphic-scan-line" />
              <div className="graphic-scan-block graphic-scan-line short" />
              <div className="graphic-palette-row">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <div className="graphic-floating-chip chip-brand">Tone detected</div>
          <div className="graphic-floating-chip chip-style">Style recommended</div>
          <div className="graphic-badge-orb">MS</div>
        </>
      )}

      {variant === "chaos" && (
        <>
          <div className="graphic-core-hub">
            <div className="graphic-core-ring" />
            <div className="graphic-core-node">MS</div>
          </div>
          <div className="graphic-chaos-item chaos-instagram">IG</div>
          <div className="graphic-chaos-item chaos-linkedin">IN</div>
          <div className="graphic-chaos-item chaos-youtube">YT</div>
          <div className="graphic-chaos-item chaos-blog">Blog</div>
          <div className="graphic-chaos-item chaos-ads">Ads</div>
          <div className="graphic-chaos-item chaos-design">Design</div>
          <div className="graphic-chaos-line line-a" />
          <div className="graphic-chaos-line line-b" />
          <div className="graphic-chaos-line line-c" />
          <div className="graphic-chaos-line line-d" />
        </>
      )}

      {variant === "system" && (
        <>
          <div className="graphic-system-shell">
            <div className="graphic-system-header">
              <div className="graphic-system-brand">
                <span className="graphic-system-dot" />
                <strong>Brand OS</strong>
              </div>
              <span className="graphic-system-status">Aligned</span>
            </div>
            <div className="graphic-system-grid">
              <div className="graphic-system-card card-strategy">
                <span>Campaign plan</span>
              </div>
              <div className="graphic-system-card card-assets">
                <span>Asset generation</span>
              </div>
              <div className="graphic-system-card card-publish">
                <span>Publishing queue</span>
              </div>
              <div className="graphic-system-card card-video">
                <span>Video output</span>
              </div>
            </div>
          </div>
          <div className="graphic-system-flow flow-a" />
          <div className="graphic-system-flow flow-b" />
        </>
      )}

      {variant === "daily" && (
        <>
          <div className="graphic-calendar-card">
            <div className="graphic-calendar-top">
              <span>Monday</span>
              <span>Auto-run</span>
            </div>
            <div className="graphic-calendar-list">
              <div><span className="graphic-list-dot" />Graphic post ready</div>
              <div><span className="graphic-list-dot" />Blog draft queued</div>
              <div><span className="graphic-list-dot" />Motion design video rendered</div>
            </div>
          </div>
          <div className="graphic-output-stack stack-back" />
          <div className="graphic-output-stack stack-middle" />
          <div className="graphic-output-card">
            <div className="graphic-output-thumb" />
            <div className="graphic-output-lines">
              <span />
              <span />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const lockupContentRefs = useRef<Array<HTMLDivElement | null>>([]);
  const unlockTimersRef = useRef<number[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandData, setBrandData] = useState<BrandDetectionResponse | null>(null);
  const brandDataRef = useRef<BrandDetectionResponse | null>(null);
  const brandColorConfigRef = useRef<BrandColorConfig>(defaultBrandColorConfig);
  const [styleOptions, setStyleOptions] = useState(defaultStyles);
  const [selectedStyleId, setSelectedStyleId] = useState("minimal-mint");
  const [productType, setProductType] = useState<ProductType>("saas");
  const [assetTemplates, setAssetTemplates] = useState(starterAssets);
  const [selectedTemplateId, setSelectedTemplateId] = useState(starterAssets[0].id);
  const [generatedAssets, setGeneratedAssets] = useState<Asset[]>([]);
  const [selectedGeneratedAssetId, setSelectedGeneratedAssetId] = useState("");
  const [assistantCopy, setAssistantCopy] = useState({
    headline: "Let's set up your brand",
    body: "",
  });
  const [brandColorConfig, setBrandColorConfig] = useState<BrandColorConfig>(defaultBrandColorConfig);
  // Keep refs in sync for use in auth callback (avoids stale closure)
  useEffect(() => {
    brandDataRef.current = brandData;
    // Persist to localStorage so it survives OAuth redirects
    if (brandData?.brand) {
      try { localStorage.setItem("botface_pending_brand", JSON.stringify(brandData)); } catch {}
    }
  }, [brandData]);
  useEffect(() => {
    brandColorConfigRef.current = brandColorConfig;
    if (Object.values(brandColorConfig).some(v => v)) {
      try { localStorage.setItem("botface_pending_colors", JSON.stringify(brandColorConfig)); } catch {}
    }
  }, [brandColorConfig]);
  const [editingColorRole, setEditingColorRole] = useState<string>("");
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [userReferenceUrls, setUserReferenceUrls] = useState<string[]>([]);
  // Onboarding flow: 0=not started, 1=logo+language, 2=product+snapshot, 3=colors+style
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [pendingBrandData, setPendingBrandData] = useState<any>(null);

  // ─── ElevenLabs Voice Agent (onboarding + dashboard) ───
  const [voiceAgentStarted, setVoiceAgentStarted] = useState(false);
  const [voiceAgentMessage, setVoiceAgentMessage] = useState<string | null>(null);
  const [voiceAgentMode, setVoiceAgentMode] = useState<"onboarding" | "dashboard" | null>(null);
  const pendingBrandDataRef = useRef(pendingBrandData);
  pendingBrandDataRef.current = pendingBrandData;
  const handleDetectBrandRef = useRef<() => void>(() => {});
  const finalizeOnboardingRef = useRef<() => void>(() => {});
  const setWebsiteUrlRef = useRef(setWebsiteUrl);
  setWebsiteUrlRef.current = setWebsiteUrl;
  const websiteUrlRef = useRef(websiteUrl);
  websiteUrlRef.current = websiteUrl;
  const dashboardPipelinesRef = useRef<Pipeline[]>([]);

  const voiceAgent = useConversation({
    clientTools: {
      // ── Onboarding tools ──
      setWebsiteUrl: async (params: { url: string }) => {
        let url = params.url.trim();
        if (url && !url.startsWith("http")) url = "https://" + url;
        setWebsiteUrlRef.current(url);
        websiteUrlRef.current = url;
        return `URL set to ${url}`;
      },
      detectBrand: async () => {
        handleDetectBrandRef.current();
        // Return quickly so the agent doesn't time out — the contextual update
        // sent after detection completes will inform the agent of the result
        return "Brand detection started. I'll let you know when it's done — just wait a moment.";
      },
      goToStep: async (params: { step: number }) => {
        setOnboardingStep(params.step);
        return `Moved to step ${params.step}`;
      },
      setBrandName: async (params: { name: string }) => {
        setPendingBrandData((prev: any) => prev ? { ...prev, brand: { ...prev.brand, name: params.name } } : prev);
        return "Brand name set";
      },
      selectProductType: async (params: { type: string }) => {
        setPendingBrandData((prev: any) => prev ? { ...prev, brand: { ...prev.brand, productType: params.type } } : prev);
        setProductType(params.type as any);
        return "Product type set";
      },
      selectLanguage: async (params: { language: string }) => {
        setAssetLanguage(params.language);
        return "Language set";
      },
      setSummary: async (params: { summary: string }) => {
        setPendingBrandData((prev: any) => prev ? { ...prev, brand: { ...prev.brand, summary: params.summary } } : prev);
        return "Summary set";
      },
      setBrandColor: async (params: { role: string; color: string }) => {
        const validRoles = ["primary", "secondary", "background", "text", "buttonBg", "buttonText", "accentBg", "accentText"];
        const role = params.role.toLowerCase().replace(/\s+/g, "");
        const mapped = role === "button" ? "buttonBg" : role === "accent" ? "accentBg" : role;
        if (validRoles.includes(mapped)) {
          setBrandColorConfig((c) => ({ ...c, [mapped]: params.color.toUpperCase() }));
          return `${mapped} color set to ${params.color}`;
        }
        return `Unknown color role: ${params.role}. Valid roles: primary, secondary, background, text, buttonBg, buttonText, accentBg, accentText`;
      },
      removeBrandColor: async (params: { role: string }) => {
        const removableRoles = ["secondary", "buttonBg", "buttonText", "accentBg", "accentText"];
        const role = params.role.toLowerCase().replace(/\s+/g, "");
        const mapped = role === "button" ? "buttonBg" : role === "accent" ? "accentBg" : role;
        if (removableRoles.includes(mapped)) {
          setBrandColorConfig((c) => ({ ...c, [mapped]: "" }));
          return `${mapped} color removed`;
        }
        if (["primary", "background", "text"].includes(mapped)) {
          return `Cannot remove ${mapped} — it's a required color. You can change it with setBrandColor instead.`;
        }
        return `Unknown color role: ${params.role}`;
      },
      finishOnboarding: async () => {
        // Use ref to avoid stale closure — finalizeOnboarding checks pendingBrandData
        const data = pendingBrandDataRef.current;
        if (!data) return "No brand data to finalize. The user may need to complete earlier steps first.";
        // Call finalizeOnboarding via a fresh closure
        finalizeOnboardingRef.current();
        return "Dashboard launched successfully.";
      },
      urlDetected: async (params: { brandName: string; url: string }) => {
        return `Brand detected: ${params.brandName} from ${params.url}`;
      },
      startedFromScratch: async () => {
        return "User chose to start from scratch";
      },

      // ── Dashboard tools ──
      createPipeline: async (params: { name: string; postType: string; socials?: string[] }) => {
        // Map agent input to actual post type labels + format
        const typeMap: Record<string, { label: string; format: "Image" | "Video" }> = {
          "graphic": { label: "Graphic Post", format: "Image" },
          "graphic post": { label: "Graphic Post", format: "Image" },
          "lifestyle": { label: "Lifestyle Shot", format: "Image" },
          "lifestyle shot": { label: "Lifestyle Shot", format: "Image" },
          "kling": { label: "Loop Video", format: "Video" },
          "kling video": { label: "Loop Video", format: "Video" },
          "loop": { label: "Loop Video", format: "Video" },
          "loop video": { label: "Loop Video", format: "Video" },
          "remotion": { label: "Motion Design Video", format: "Video" },
          "remotion video": { label: "Motion Design Video", format: "Video" },
          "motion design": { label: "Motion Design Video", format: "Video" },
          "motion design video": { label: "Motion Design Video", format: "Video" },
          "image": { label: "Graphic Post", format: "Image" },
          "video": { label: "Motion Design Video", format: "Video" },
        };
        const matched = typeMap[params.postType.toLowerCase()] || typeMap["graphic"];
        // Show the new pipeline form first
        window.dispatchEvent(new CustomEvent("botface-show-new-form"));
        const newPipeline: Pipeline = {
          id: `pipeline-${Date.now()}`,
          name: params.name,
          postType: matched.label,
          format: matched.format,
          thumbnailUrl: null,
          socials: params.socials || ["instagram"],
          frequency: "Every day",
          preferredTime: "09:00",
          guidance: "",
          referenceImages: [],
          enabled: false,
          lastGenerated: null,
          lastPosted: null,
          nextScheduled: null,
          generatedExamples: [],
          facebookPageId: null,
          linkedinPageId: null,
        };
        // Brief delay so user sees the form, then add the pipeline and select it
        await new Promise((r) => setTimeout(r, 300));
        setDashboardPipelines((prev) => [...prev, newPipeline]);
        // Select the new pipeline to show its detail view
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("botface-select-pipeline", { detail: { id: newPipeline.id } }));
          window.dispatchEvent(new CustomEvent("botface-hide-new-form"));
        }, 100);
        return `Pipeline "${params.name}" created as ${matched.label} (${matched.format}). It's paused by default — the user can enable it when ready.`;
      },
      selectPipeline: async (params: { name: string }) => {
        const pipes = dashboardPipelinesRef.current;
        const target = pipes.find((p) => p.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!target) return `Pipeline "${params.name}" not found. Available: ${pipes.map((p) => p.name).join(", ") || "none"}`;
        // Dispatch a custom event that PipelinePanel can listen to
        window.dispatchEvent(new CustomEvent("botface-select-pipeline", { detail: { id: target.id } }));
        return `Selected pipeline "${target.name}"`;
      },
      updatePipeline: async (params: { name: string; field: string; value: any }) => {
        const pipes = dashboardPipelinesRef.current;
        const target = pipes.find((p) => p.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!target) return `Pipeline "${params.name}" not found`;
        setDashboardPipelines((prev) => prev.map((p) => p.id === target.id ? { ...p, [params.field]: params.value } : p));
        return `Updated ${params.field} on "${target.name}"`;
      },
      deletePipeline: async (params: { name: string }) => {
        const pipes = dashboardPipelinesRef.current;
        const target = pipes.find((p) => p.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!target) return `Pipeline "${params.name}" not found`;
        setDashboardPipelines((prev) => prev.filter((p) => p.id !== target.id));
        return `Pipeline "${target.name}" deleted`;
      },
      enablePipeline: async (params: { name: string }) => {
        const pipes = dashboardPipelinesRef.current;
        const target = pipes.find((p) => p.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!target) return `Pipeline "${params.name}" not found`;
        setDashboardPipelines((prev) => prev.map((p) => p.id === target.id ? { ...p, enabled: true } : p));
        return `Pipeline "${target.name}" enabled`;
      },
      disablePipeline: async (params: { name: string }) => {
        const pipes = dashboardPipelinesRef.current;
        const target = pipes.find((p) => p.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!target) return `Pipeline "${params.name}" not found`;
        setDashboardPipelines((prev) => prev.map((p) => p.id === target.id ? { ...p, enabled: false } : p));
        return `Pipeline "${target.name}" paused`;
      },
      getPipelineStatus: async () => {
        const pipes = dashboardPipelinesRef.current;
        if (pipes.length === 0) return "No pipelines configured yet. Suggest creating one.";
        return pipes.map((p, i) => `${i + 1}. "${p.name}" — ${p.postType}, ${p.format}, ${p.frequency}, ${p.enabled ? "active" : "paused"}, platforms: ${p.socials.join(", ")}, last posted: ${p.lastPosted || "never"}`).join("\n");
      },
      getConnectedAccounts: async () => {
        const accounts = connectedSocialAccounts;
        if (accounts.length === 0) return "No social accounts connected yet. The user needs to go to the Connected Accounts section in the dashboard to link their social media accounts . Without connected accounts, pipelines cannot post.";
        const connected = accounts.filter((a) => a.connected);
        const disconnected = accounts.filter((a) => !a.connected);
        let summary = `Connected: ${connected.map((a) => `${a.platform} (${a.username})`).join(", ") || "none"}`;
        if (disconnected.length > 0) summary += `. Not connected: ${disconnected.map((a) => a.platform).join(", ")}`;
        return summary;
      },
      openTestModal: async (params: { name: string }) => {
        const pipes = dashboardPipelinesRef.current;
        const target = pipes.find((p) => p.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!target) return `Pipeline "${params.name}" not found`;
        // First select the pipeline, then open test modal
        window.dispatchEvent(new CustomEvent("botface-select-pipeline", { detail: { id: target.id } }));
        setTimeout(() => window.dispatchEvent(new CustomEvent("botface-open-test-modal", { detail: { id: target.id } })), 100);
        return `Opened test modal for "${target.name}"`;
      },
      closeTestModal: async () => {
        window.dispatchEvent(new CustomEvent("botface-close-test-modal"));
        return "Test modal closed";
      },
      setAutoPost: async (params: { enabled: boolean }) => {
        window.dispatchEvent(new CustomEvent("botface-set-autopost", { detail: { enabled: params.enabled } }));
        return `Auto-post ${params.enabled ? "enabled" : "disabled"}`;
      },
      triggerTestGenerate: async () => {
        window.dispatchEvent(new CustomEvent("botface-trigger-test-generate"));
        return "Test generation started. This may take up to a minute.";
      },
      getAnalytics: async () => {
        // Dispatch event to request analytics data from UserDashboard
        return new Promise<string>((resolve) => {
          const handler = (e: Event) => {
            window.removeEventListener("botface-analytics-response", handler);
            resolve((e as CustomEvent).detail?.summary || "No analytics data available yet.");
          };
          window.addEventListener("botface-analytics-response", handler);
          window.dispatchEvent(new CustomEvent("botface-get-analytics"));
          setTimeout(() => {
            window.removeEventListener("botface-analytics-response", handler);
            resolve("Analytics data not available. The user may need to publish some posts first.");
          }, 500);
        });
      },
      getCalendarSummary: async () => {
        return new Promise<string>((resolve) => {
          const handler = (e: Event) => {
            window.removeEventListener("botface-calendar-response", handler);
            resolve((e as CustomEvent).detail?.summary || "No scheduled posts found.");
          };
          window.addEventListener("botface-calendar-response", handler);
          window.dispatchEvent(new CustomEvent("botface-get-calendar"));
          setTimeout(() => {
            window.removeEventListener("botface-calendar-response", handler);
            resolve("Calendar data not available.");
          }, 500);
        });
      },
      scrollToSection: async (params: { section: string }) => {
        const validSections = ["pipelines", "overview", "calendar", "analytics", "accounts", "settings"];
        const target = params.section.toLowerCase();
        if (target === "pipelines") {
          // Scroll to top of dashboard (pipeline panel is the main view)
          document.querySelector(".dashboard-section--fullpage")?.scrollIntoView({ behavior: "smooth" });
          return "Scrolled to pipelines";
        }
        if (validSections.includes(target)) {
          window.dispatchEvent(new CustomEvent("botface-scroll-to", { detail: { section: target } }));
          return `Scrolled to ${target}`;
        }
        return `Unknown section: ${params.section}. Valid sections: ${validSections.join(", ")}`;
      },
    },
    onMessage: ({ message, source }: { message: string; source: string }) => {
      if (source === "ai") setVoiceAgentMessage(message);
    },
    onConnect: () => { console.log("[voice-agent] Connected"); setVoiceAgentMessage("Connected! Say something..."); },
    onDisconnect: (details: any) => { console.log("[voice-agent] Disconnected:", JSON.stringify(details)); setVoiceAgentStarted(false); setVoiceAgentMessage(null); },
    onError: (err: any, context?: any) => {
      console.warn("[voice-agent] Error:", err, context);
      setVoiceAgentMessage(`Error: ${typeof err === "string" ? err : err?.message || "Connection issue"}`);
    },
    onAgentToolRequest: (tool: any) => {
      console.log("[voice-agent] Tool request:", tool);
    },
    onAgentToolResponse: (tool: any) => {
      console.log("[voice-agent] Tool response:", tool);
    },
    onDebug: (event: any) => {
      console.log("[voice-agent] Debug:", event);
    },
  });

  // Helper to request mic + start a voice session
  async function startVoiceSession(mode: "onboarding" | "dashboard") {
    if (voiceAgentStarted) return;
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (micErr: any) {
      console.warn("[voice-agent] Mic denied:", micErr?.message);
      setVoiceAgentMessage("Microphone access is needed to talk to MS. Please allow mic access and try again.");
      return;
    }
    try {
      setVoiceAgentMessage("Connecting...");
      const dashboardPrompt = `You are MS, the voice assistant for Marketing Stack, a dashboard assistant. The user manages content pipelines here.

SPEAKING RULES (CRITICAL):
- Maximum 2 SHORT sentences per response. Never more.
- Each sentence must be under 15 words.
- Never repeat what the user said.
- Never say "Great!" or "Sure!" or "Absolutely!"
- Sound casual and human, like texting a coworker.
- ALWAYS say a short sentence BEFORE calling any tool. Example: "Creating that now" then call createPipeline. "Let me check" then call getPipelineStatus. Never call a tool silently.

PIPELINE CREATION:
Ask for: name, type, platforms. Frequency defaults to daily. Don't ask for it.
Post types: graphic, lifestyle, loop video, motion design video.
"image" = Graphic Post. "video" = Motion Design Video.
Platforms: instagram, x, facebook, linkedin, tiktok, threads.

TOOLS:
- Pipelines: getPipelineStatus, createPipeline, selectPipeline, updatePipeline, deletePipeline, enablePipeline, disablePipeline
- Testing: openTestModal, triggerTestGenerate, setAutoPost, closeTestModal
- Data: getAnalytics, getCalendarSummary, getConnectedAccounts
- Navigation: scrollToSection (pipelines, overview, calendar, analytics, accounts, settings)
- To test: openTestModal → triggerTestGenerate → closeTestModal
- No connected accounts? Check with getConnectedAccounts, then scrollToSection("accounts").`;

      const onboardingPrompt = `You are MS, the voice assistant for Marketing Stack, guiding a new user through brand setup.

SPEAKING RULES (CRITICAL):
- Maximum 2 SHORT sentences per response. Never more.
- Each sentence must be under 15 words.
- Never repeat what the user said.
- Never say "Great!" or "Sure!" or "Absolutely!" — just do the thing.
- ALWAYS say a short sentence BEFORE calling any tool. Example: "Let me detect that" then call detectBrand. "Moving to the next step" then call goToStep. Never call a tool silently.

Step 0: User sees URL input + Start from scratch. If they say a URL, use setWebsiteUrl, then say "Let me detect that for you" and call detectBrand. After calling detectBrand, say "Give me a moment" and WAIT SILENTLY. Do NOT say anything else until you receive a contextual update saying "Brand detected successfully". Do NOT assume detection failed. If they want to start fresh, acknowledge briefly.
Step 1: Confirm brand name + language. Use setBrandName / selectLanguage. Then say "Moving on" and goToStep(2).
Step 2: Confirm product type + summary. Use selectProductType / setSummary. Then say "Almost done" and goToStep(3).
Step 3: The user sees their color palette. When the user says ANYTHING positive like "looks good", "yes", "launch", "go", "let's go", "that's fine", "perfect", "sure", "okay", "yep", or ANY form of agreement — you MUST call finishOnboarding immediately. Do NOT ask follow-up questions. Do NOT ask "are you sure?". Just say "Launching your dashboard" and call finishOnboarding. Use setBrandColor only if they explicitly ask to change a color.

Use goToStep to go forward or back (0-3).`;

      await voiceAgent.startSession({
        agentId: "YOUR_ELEVENLABS_AGENT_ID",
        connectionType: "websocket",
        overrides: {
          agent: {
            prompt: { prompt: mode === "dashboard" ? dashboardPrompt : onboardingPrompt },
            firstMessage: mode === "dashboard"
              ? "Hey! What can I help you with?"
              : "Hey! Drop your website link and I'll detect your brand, or start from scratch.",
          },
          tts: {
            speed: 1.15,
          },
        },
      });
      setVoiceAgentStarted(true);
      setVoiceAgentMode(mode);
    } catch (e: any) {
      console.warn("[voice-agent] Failed to start:", e.message, e);
      setVoiceAgentMessage("Could not connect to voice agent. Please try again.");
    }
  }

  const startVoiceAgent = () => startVoiceSession("onboarding");
  const startDashboardVoiceAgent = () => startVoiceSession("dashboard");

  // Send contextual updates when onboarding state changes
  useEffect(() => {
    if (!voiceAgentStarted || voiceAgent.status !== "connected" || voiceAgentMode !== "onboarding") return;
    if (onboardingStep === 1 && pendingBrandData) {
      voiceAgent.sendContextualUpdate(
        `User is now on Step 1 (Brand Identity). Brand name: "${pendingBrandData.brand.name || "empty"}". Language: "${assetLanguage}".`
      );
    } else if (onboardingStep === 2 && pendingBrandData) {
      voiceAgent.sendContextualUpdate(
        `User is now on Step 2 (Product Type). Product type: "${pendingBrandData.brand.productType || "not set"}". Summary: "${pendingBrandData.brand.summary || "empty"}".`
      );
    } else if (onboardingStep === 3) {
      const c = brandColorConfig;
      voiceAgent.sendContextualUpdate(`STEP 3 ACTIVE. Current colors: Primary=${c.primary || "not set"}, Secondary=${c.secondary || "not set"}, Background=${c.background || "not set"}, Text=${c.text || "not set"}, Button=${c.buttonBg || "not set"}, ButtonText=${c.buttonText || "not set"}, AccentBG=${c.accentBg || "not set"}, AccentText=${c.accentText || "not set"}. Ask "Do these colors look good?" — then on ANY positive response, call finishOnboarding IMMEDIATELY. Do not ask follow-up questions. Trigger words: yes, looks good, sure, okay, fine, launch, go, perfect, yep, that works.`);
    }
  }, [onboardingStep, voiceAgentStarted, voiceAgentMode]);

  // Transition from onboarding to dashboard mode
  useEffect(() => {
    if (onboardingStep === 0 && voiceAgentStarted && brandData && voiceAgentMode === "onboarding") {
      voiceAgent.endSession().catch(() => {});
      setVoiceAgentStarted(false);
      setVoiceAgentMode(null);
      setVoiceAgentMessage(null);
      // Auto-start dashboard voice after brief delay
      setTimeout(() => startVoiceSession("dashboard"), 800);
    }
  }, [onboardingStep, voiceAgentStarted, brandData, voiceAgentMode]);

  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const [savedBrands, setSavedBrands] = useState<Array<{ id: string; name: string; url: string; logoUrl: string; brandData: any }>>([]);
  const [initialPipeline, setInitialPipeline] = useState<any>(null);
  const [dashboardPipelines, setDashboardPipelines] = useState<Pipeline[]>([]);
  const [hasProSubscription, setHasProSubscription] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [connectedSocialAccounts, setConnectedSocialAccounts] = useState<Array<{ platform: string; username: string; connected: boolean }>>([]);

  // Keep pipeline ref in sync for voice agent tools
  useEffect(() => { dashboardPipelinesRef.current = dashboardPipelines; }, [dashboardPipelines]);

  // Send pipeline context to dashboard agent when pipelines change
  useEffect(() => {
    if (voiceAgentMode !== "dashboard" || !voiceAgentStarted || voiceAgent.status !== "connected") return;
    const summary = dashboardPipelines.length === 0
      ? "User has no pipelines yet."
      : `Pipelines: ${dashboardPipelines.map((p) => `"${p.name}" (${p.enabled ? "active" : "paused"}, ${p.postType}, ${p.frequency})`).join(", ")}`;
    voiceAgent.sendContextualUpdate(summary);
  }, [dashboardPipelines.length, voiceAgentMode, voiceAgentStarted]);

  async function handleConnectAccounts() {
    if (!user) return;
    const profileUsername = `botface_${user.id}`;
    try {
      // Step 1: Create profile (may already exist)
      await fetch(`${API_BASE}/api/social/create-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profileUsername }),
      }).catch(() => {});

      // Step 2: Get connect URL
      const response = await fetch(`${API_BASE}/api/social/connect-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profileUsername,
          redirect_url: window.location.origin + "/dashboard",
        }),
      });
      const data = await response.json();
      if (data.access_url) {
        window.open(data.access_url, "_blank");
      } else {
        console.error("No connect URL returned:", data);
      }
    } catch (error) {
      console.error("Connect accounts error:", error);
    }
  }

  async function fetchConnectedAccounts() {
    if (!user) return;
    const profileUsername = `botface_${user.id}`;
    try {
      const response = await fetch(`${API_BASE}/api/social/accounts/${profileUsername}`);
      const data = await response.json();
      if (data.accounts) {
        setConnectedSocialAccounts(
          data.accounts.map((a: any) => ({
            platform: a.platform || a.type || "",
            username: a.username || a.name || "",
            connected: true,
          }))
        );
      }
    } catch {}
  }

  const [leftPanelView, setLeftPanelView] = useState<"brands" | "detail">("brands");
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const [assetLanguage, setAssetLanguage] = useState("English");
  const [user, setUser] = useState<User | null>(null);
  const [isBrandLoading, setIsBrandLoading] = useState(true);
  const [showAuthPopup, setShowAuthPopup] = useState(false);

  // Fetch connected accounts on mount and when window regains focus (after connect flow)
  useEffect(() => {
    if (user) {
      fetchConnectedAccounts();
      const handleFocus = () => fetchConnectedAccounts();
      window.addEventListener("focus", handleFocus);
      return () => window.removeEventListener("focus", handleFocus);
    }
  }, [user]);

  const navigate = useNavigate();
  const location = useLocation();
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingHeroFrame, setIsGeneratingHeroFrame] = useState(false);
  const [heroFrameElapsedMs, setHeroFrameElapsedMs] = useState(0);
  const heroFrameStartedAtRef = useRef<number | null>(null);
  const [heroFrameUrl, setHeroFrameUrl] = useState<string | null>(null);
  const [heroFrameSlug, setHeroFrameSlug] = useState<string | null>(null);
  const [heroFrameLoopPrompt, setHeroFrameLoopPrompt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [generationElapsedMs, setGenerationElapsedMs] = useState(0);
  const generationStartedAtRef = useRef<number | null>(null);
  const [showAssetDetails, setShowAssetDetails] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSetupPanel, setShowSetupPanel] = useState(true);
  const [brandPanelCollapsed, setBrandPanelCollapsed] = useState(false);
  const [editablePalette, setEditablePalette] = useState<EditablePaletteColor[]>([]);
  const [editingPaletteId, setEditingPaletteId] = useState("");
  const [visibleLockupCards, setVisibleLockupCards] = useState<boolean[]>([false, false, false, false]);
  const [workflowUnlockStep, setWorkflowUnlockStep] = useState(0);
  const selectedTemplate = assetTemplates.find((asset) => asset.id === selectedTemplateId) ?? assetTemplates[0] ?? null;
  const selectedGeneratedAsset =
    generatedAssets.find((asset) => asset.id === selectedGeneratedAssetId) ?? generatedAssets[0] ?? null;
  const previewAsset = selectedGeneratedAsset ?? selectedTemplate ?? null;
  const activeStyle = styleOptions.find((style) => style.id === selectedStyleId) ?? styleOptions[0];
  function clearUnlockTimers() {
    unlockTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    unlockTimersRef.current = [];
  }

  function resetDashboardOutputs(nextTemplates: Asset[]) {
    setAssetTemplates(nextTemplates);
    setSelectedTemplateId(nextTemplates[0]?.id ?? "");
    setGeneratedAssets([]);
    setSelectedGeneratedAssetId("");
    setShowSetupPanel(true);
  }

  function finalizeOnboarding() {
    if (!pendingBrandData) return;
    const data = pendingBrandData;
    startTransition(() => {
      setBrandData(data);
      setSavedBrands((prev) => {
        const existing = prev.find((b) => b.url === data.brand.url);
        if (existing) return prev.map((b) => b.url === data.brand.url ? { ...b, brandData: data, name: data.brand.name, logoUrl: data.brand.logoCandidates?.[0]?.url || "" } : b);
        return [...prev, { id: `brand-${Date.now()}`, name: data.brand.name, url: data.brand.url, logoUrl: data.brand.logoCandidates?.[0]?.url || "", brandData: data }];
      });
      setLeftPanelView("detail");
      resetDashboardOutputs(data.assets);
      setAssistantCopy(data.assistant);
      setShowAssetDetails(false);
      setOnboardingStep(0);
      setPendingBrandData(null);
    });
    startWorkflowUnlockSequence();
  }

  function startWorkflowUnlockSequence() {
    clearUnlockTimers();
    setWorkflowUnlockStep(0);

    [1, 2, 3].forEach((step, index) => {
      const timerId = window.setTimeout(() => {
        setWorkflowUnlockStep(step);
      }, 220 + index * 220);

      unlockTimersRef.current.push(timerId);
    });
  }

  function createDemoBrandDetection(url: string): BrandDetectionResponse {
    const parsedUrl = normalizeUrl(url);
    const normalizedUrl = parsedUrl?.toString() ?? url;
    const hostname = parsedUrl?.hostname ?? "marketingstack.app";
    const brandName = toBrandName(hostname);
    const productType = inferProductTypeFromUrl(hostname);
    const palette: string[] = [];
    const faviconUrl = parsedUrl ? `${parsedUrl.origin}/favicon.ico` : "https://marketingstack.app/favicon.ico";
    const recommendedStyleId = productTypeBucket(productType) === "physical" ? "soft-editorial" : "minimal-mint";
    const hostLabel = hostname.replace(/^www\./, "");

    return {
      brand: {
        name: brandName,
        url: normalizedUrl,
        category: categoryForProductType(productType),
        tone: toneForProductType(productType),
        vibe: toneForProductType(productType),
        primaryColor: "",
        palette,
        summary: `${brandName} looks like a ${categoryForProductType(productType).toLowerCase()} with a ${toneForProductType(productType).toLowerCase()} positioning style.`,
        logoReadiness: "Fallback detection found a favicon candidate",
        editableFont: fontForProductType(productType),
        productType,
        logoCandidates: [
          {
            url: faviconUrl,
            type: "icon",
            source: "fallback:favicon",
            confidence: 0.56,
            alt: `${brandName} icon`,
          },
        ],
        extractedAssets: [
          {
            id: "demo-asset-1",
            type: "icon",
            source: "fallback:favicon",
            url: faviconUrl,
            confidence: 0.56,
          },
        ],
      },
      styles: defaultStyles.map((style) => ({
        ...style,
        recommended: style.id === recommendedStyleId,
      })),
      recommendedStyleId,
      assistant: {
        headline: `Fallback detection mapped a working brand profile for ${hostLabel}.`,
        body: "The backend extractor was unavailable, so the dashboard used URL-based heuristics and a favicon candidate to keep the workflow moving.",
      },
      assets: [
        buildDemoAsset({
          websiteUrl: normalizedUrl,
          productType,
          styleId: recommendedStyleId,
          count: 1,
        }),
        {
          ...buildDemoAsset({
            websiteUrl: normalizedUrl,
            productType,
            styleId: recommendedStyleId,
            count: 2,
          }),
          title: productTypeBucket(productType) === "service" ? "Trust builder 2" : "Lifestyle shot 2",
          meta: "Instagram / Image",
          format: "Image",
          channel: "Instagram",
          concept: "Lifestyle or product-in-use creative that feels human, premium, and native to social.",
          status: "Ready to generate",
        },
        {
          ...buildDemoAsset({
            websiteUrl: normalizedUrl,
            productType,
            styleId: recommendedStyleId,
            count: 3,
          }),
          title: productTypeBucket(productType) === "service" ? "Kling video 3" : "Kling video 3",
          meta: "Kling / Video",
          format: "Video",
          channel: "Kling",
          status: "Ready to generate",
          concept: "Premium AI video ad guided by the extracted brand system, product, and website styling.",
        },
        {
          ...buildDemoAsset({
            websiteUrl: normalizedUrl,
            productType,
            styleId: recommendedStyleId,
            count: 4,
          }),
          title: productTypeBucket(productType) === "service" ? "Client proof 4" : "Motion design video 4",
          meta: "Motion Design / Video",
          format: "Video",
          channel: "Remotion",
          status: "Draft",
        },
      ],
      extraction: {
        sourceUrl: normalizedUrl,
        normalizedUrl,
        title: brandName,
        description: `${categoryForProductType(productType)} detected from URL structure`,
        summary: `${brandName} looks like a ${categoryForProductType(productType).toLowerCase()} with a ${toneForProductType(productType).toLowerCase()} positioning style.`,
        metadata: {
          ogTitle: brandName,
          ogImage: null,
          twitterImage: null,
        },
        cssColors: [],
        screenshotColors: [],
        fonts: [fontForProductType(productType), "Inter Tight"],
        logoCandidates: [
          {
            url: faviconUrl,
            type: "icon",
            source: "fallback:favicon",
            confidence: 0.56,
            alt: `${brandName} icon`,
          },
        ],
        assetCandidates: [
          {
            id: "demo-asset-1",
            type: "icon",
            source: "fallback:favicon",
            url: faviconUrl,
            confidence: 0.56,
          },
        ],
        fallbackStages: [
          { stage: "raw_html_parse", status: "failed", details: "Backend extractor unavailable from the current preview session" },
          { stage: "css_parse", status: "skipped", details: "No server-side fetch available in fallback mode" },
          { stage: "rendered_browser_pass", status: "skipped", details: "Playwright pass runs only on the backend" },
          { stage: "favicon_probe", status: "completed", details: "Resolved favicon from the submitted domain" },
          { stage: "url_heuristics", status: "completed", details: "Inferred product type only from hostname signals" },
        ],
      },
    };
  }

  function selectProductType(nextType: ProductType) {
    setProductType(nextType);

    if (productTypeBucket(nextType) === "service") {
      setAssistantCopy({
        headline: "Service workflows are visible, but image generation is still marked coming soon.",
        body: "",
      });
      return;
    }

    setAssistantCopy({
      headline: `Workflow updated for ${nextType}.`,
      body: "",
    });
  }

  // Keep refs in sync for voice agent clientTools
  handleDetectBrandRef.current = () => handleDetectBrand();
  finalizeOnboardingRef.current = () => finalizeOnboarding();

  async function handleDetectBrand() {
    // Use ref for URL to handle voice agent calling setWebsiteUrl then detectBrand
    // before React state flushes
    const currentUrl = websiteUrlRef.current || websiteUrl;
    if (!currentUrl.trim()) {
      setErrorMessage("Enter a website URL before running detection.");
      return;
    }

    setIsDetecting(true);
    setErrorMessage("");
    setCustomLogoUrl(null);
    const normalizedUrl = currentUrl.trim();

    try {
      const response = await fetch(`${API_BASE}/api/brand/detect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const data = (await response.json()) as BrandDetectionResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Brand detection failed.");
      }

      // Store detection result without activating dashboard — start onboarding flow
      startTransition(() => {
        setPendingBrandData(data);
        // Pre-populate editable state so user can modify during onboarding
        setEditablePalette(createEditablePalette(data.brand.palette ?? []));
        setEditingPaletteId("");
        const fc = (data.extraction?.metadata as any)?.firecrawlBranding;
        if (fc?.colors || fc?.components) {
          setBrandColorConfig({
            primary: fc.colors?.primary || data.brand.palette?.[0] || "",
            secondary: fc.colors?.accent || data.brand.palette?.[1] || "",
            background: fc.colors?.background || "",
            text: fc.colors?.textPrimary || "",
            buttonBg: fc.components?.buttonPrimary?.background || fc.colors?.accent || "",
            buttonText: fc.components?.buttonPrimary?.textColor || "",
            accentBg: fc.colors?.accent || "",
            accentText: fc.colors?.link || fc.colors?.accent || "",
          });
        }
        setAssetLanguage(data.brand.languageLabel || "English");
        const firstProduct = (data.brand.extractedProducts ?? data.extraction?.productCandidates ?? []).find((p: any) => p.url);
        if (firstProduct?.url) setUserReferenceUrls([buildRemoteAssetPreviewUrl(firstProduct.url)]);
        setStyleOptions(data.styles);
        setSelectedStyleId(data.recommendedStyleId);
        setProductType(data.brand.productType as any);
        setOnboardingStep(1);
        // Signal detectBrand tool that detection is complete
        window.dispatchEvent(new CustomEvent("botface-brand-detected"));
        // Notify voice agent about detected brand
        if (voiceAgentStarted && voiceAgent.status === "connected") {
          voiceAgent.sendContextualUpdate(
            `Brand detected successfully! Brand name: "${data.brand.name}". URL: "${data.brand.url}". Product type: "${data.brand.productType}". Language: "${data.brand.languageLabel || "English"}". The user is now on Step 1 reviewing their brand identity. Comment on the brand and help them confirm or adjust.`
          );
        }
      });

      fetch(`${API_BASE}/api/brand/refine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: data.brand.url ?? normalizedUrl }),
      })
        .then(async (refineResponse) => {
          const refinedData = (await refineResponse.json()) as BrandDetectionResponse & { error?: string };
          if (!refineResponse.ok) {
            return;
          }

          startTransition(() => {
            setBrandData(refinedData);
            setEditablePalette(createEditablePalette(refinedData.brand.palette ?? []));
            setEditingPaletteId("");
            setStyleOptions(refinedData.styles);
            setSelectedStyleId(refinedData.recommendedStyleId);
            setProductType(refinedData.brand.productType);
            setAssistantCopy(refinedData.assistant);
          });
        })
        .catch(() => undefined);
    } catch (error) {
      const fallbackData = createDemoBrandDetection(normalizedUrl);

      startTransition(() => {
        setBrandData(fallbackData);
        setEditablePalette(createEditablePalette(fallbackData.brand.palette ?? []));
        setEditingPaletteId("");
        setStyleOptions(fallbackData.styles);
        setSelectedStyleId(fallbackData.recommendedStyleId);
        setProductType(fallbackData.brand.productType);
        resetDashboardOutputs(fallbackData.assets);
        setAssistantCopy(fallbackData.assistant);
        setShowAssetDetails(false);
      });

      const message = error instanceof Error ? error.message : "Brand detection fell back to demo mode.";
      setErrorMessage(message);
      setAssistantCopy({
        headline: `Fallback detection mapped a working brand profile for ${(normalizeUrl(normalizedUrl)?.hostname ?? normalizedUrl).replace(/^www\./, "")}.`,
        body: `Live detection failed in the browser, so the dashboard used fallback mode instead. Error: ${message}`,
      });
      startWorkflowUnlockSequence();
    } finally {
      setIsDetecting(false);
    }
  }

  async function handleGenerateHeroFrame() {
    setIsGeneratingHeroFrame(true);
    heroFrameStartedAtRef.current = Date.now();
    setErrorMessage("");
    setHeroFrameUrl(null);
    setHeroFrameSlug(null);
    setAssistantCopy({
      headline: "Generating test frame preview.",
      body: "Gemini is composing a branded reference frame. You can approve it or regenerate for a different variation.",
    });
    try {
      const response = await fetch(`${API_BASE}/api/kling/hero-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: brandData?.brand.url ?? websiteUrl.trim(),
          styleId: selectedStyleId,
          productType,
          brandColorConfig: Object.fromEntries(
            Object.entries(brandColorConfig).filter(([_, v]) => v && v.length > 3)
          ),
          assetLanguage,
          customLogoUrl: customLogoUrl || undefined,
          brandName: brandData?.brand.name || undefined,
          brandSummary: brandData?.brand.summary || undefined,
          brandFont: brandData?.brand.editableFont || undefined,
          palette: extractedColors,
          assetTemplate: selectedTemplate
            ? {
                title: selectedTemplate.title,
                meta: selectedTemplate.meta,
                format: selectedTemplate.format,
                channel: selectedTemplate.channel,
                concept: selectedTemplate.concept,
              }
            : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Test frame generation failed.");
      setHeroFrameUrl(data.heroFrameUrl?.startsWith("/") ? `${API_BASE}${data.heroFrameUrl}` : data.heroFrameUrl);
      setHeroFrameSlug(data.heroFrameSlug);
      setHeroFrameLoopPrompt(data.klingLoopPrompt);
      setAssistantCopy({
        headline: "Test frame ready for review.",
        body: data.klingLoopPrompt ? `Motion prompt: "${data.klingLoopPrompt}"` : "Approve the frame to proceed with Kling video generation, or regenerate for a different variation.",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Test frame generation failed.");
      setAssistantCopy({
        headline: "Test frame generation failed.",
        body: error instanceof Error ? error.message : "Try again or check the console for details.",
      });
    } finally {
      setIsGeneratingHeroFrame(false);
      heroFrameStartedAtRef.current = null;
    }
  }

  function handleResetHeroFrame() {
    setHeroFrameUrl(null);
    setHeroFrameSlug(null);
    setHeroFrameLoopPrompt(null);
  }

  async function handleSelectSampleProject(project: SampleProject) {
    // Build a mock brand detection response from the sample data
    const mockBrandData = {
      brand: {
        name: project.name,
        url: project.url,
        summary: project.summary,
        productType: project.productType,
        languageLabel: project.languageLabel,
        vibe: project.vibe,
        tone: project.tone,
        tagline: project.tagline,
        palette: project.palette,
        fonts: project.fonts,
        logoCandidates: [{ url: `${API_BASE}${project.logo}`, type: "image", source: "sample", confidence: 1, alt: `${project.name} logo` }],
        extractedAssets: [],
        extractedProducts: [],
        primaryColor: project.palette[0],
        category: project.type,
      },
      extraction: {
        metadata: {
          firecrawlBranding: {
            colors: {
              primary: project.brandColors.primary,
              accent: project.brandColors.secondary,
              background: project.brandColors.background,
              textPrimary: project.brandColors.text,
            },
            components: {
              buttonPrimary: { background: project.brandColors.buttonBg, textColor: project.brandColors.buttonText },
            },
          },
        },
        logoCandidates: [],
        summary: project.summary,
      },
      styles: [
        { id: "minimal-mint", name: "Minimal mint", description: "Calm, premium, product-first", recommended: true },
        { id: "soft-editorial", name: "Soft editorial", description: "Sharper hierarchy, more contrast", recommended: false },
        { id: "performance-grid", name: "Performance grid", description: "Bold, structured, data-rich", recommended: false },
      ],
      isSampleProject: true,
      recommendedStyleId: "minimal-mint",
      assets: [],
      assistant: {
        headline: `${project.name} brand loaded.`,
        body: project.summary,
      },
    };

    // Register the sample project as a server session so generate works
    await fetch(`${API_BASE}/api/sample-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: {
          ...mockBrandData.brand,
          firecrawlBranding: mockBrandData.extraction.metadata.firecrawlBranding,
        },
      }),
    }).catch(() => {});

    startTransition(() => {
      setBrandData(mockBrandData as any);
      // Save to brands list
      setSavedBrands((prev) => {
        const existing = prev.find((b) => b.url === project.url);
        if (existing) return prev;
        return [...prev, { id: `brand-${Date.now()}`, name: project.name, url: project.url, logoUrl: project.logo, brandData: mockBrandData }];
      });
      setLeftPanelView("detail");
      setEditablePalette(createEditablePalette(project.palette));
      setEditingPaletteId("");
      setBrandColorConfig(project.brandColors);
      setAssetLanguage(project.languageLabel);
      setCustomLogoUrl(project.logo);
      setStyleOptions(mockBrandData.styles as any);
      setSelectedStyleId(mockBrandData.recommendedStyleId);
      setProductType(project.productType as any);
      setGeneratedAssets([]);
      setSelectedGeneratedAssetId("");
      setShowSetupPanel(true);
      setAssistantCopy(mockBrandData.assistant);
    });
    startWorkflowUnlockSequence();
  }

  async function handleGenerateAsset() {
    setIsGenerating(true);
    setErrorMessage("");
    generationStartedAtRef.current = Date.now();
    setGenerationElapsedMs(0);
    setAssistantCopy({
      headline: isRemotionTemplateSelected
        ? "Rendering your motion design video."
        : isKlingTemplateSelected
          ? "Preparing your Kling video."
        : isVeoTemplateSelected
          ? "Generating your Veo 3.1 video."
          : "Generating your asset.",
      body: isRemotionTemplateSelected
        ? "This can take longer than image generation. If the local renderer cannot finish, the dashboard will show the fallback brief and the reason."
        : isKlingTemplateSelected
          ? "Kling is generating a 5-second 9:16 video from the real logo, website screenshot, and your detected brand system."
        : isVeoTemplateSelected
          ? "This can take longer than image generation while Veo renders the MP4 from the attached logo and product references."
          : "The current preview will update when the asset is ready.",
    });

    try {
      const response = await fetch(`${API_BASE}/api/assets/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: brandData?.brand.url ?? websiteUrl.trim(),
          styleId: selectedStyleId,
          productType,
          palette: extractedColors,
          brandColorConfig: Object.fromEntries(
            Object.entries(brandColorConfig).filter(([_, v]) => v && v.length > 3)
          ),
          assetLanguage,
          heroFrameSlug: heroFrameSlug ?? undefined,
          customLogoUrl: customLogoUrl || undefined,
          userReferenceUrls: userReferenceUrls.length > 0 ? userReferenceUrls : undefined,
          // User-modified brand overrides — these take priority over detected values
          brandName: brandData?.brand.name || undefined,
          brandSummary: brandData?.brand.summary || undefined,
          brandFont: brandData?.brand.editableFont || undefined,
          assetTemplate: selectedTemplate
            ? {
                title: selectedTemplate.title,
                meta: selectedTemplate.meta,
                format: selectedTemplate.format,
                channel: selectedTemplate.channel,
                concept: selectedTemplate.concept,
              }
            : null,
        }),
      });

      const data = (await response.json()) as AssetMutationResponse & { error?: string };

      if (!response.ok || !data.asset) {
        throw new Error(data.error ?? "Asset generation failed.");
      }

      startTransition(() => {
        setGeneratedAssets((current) => [data.asset!, ...current.filter((item) => item.id !== data.asset!.id)]);
        setSelectedGeneratedAssetId(data.asset!.id);
        setShowSetupPanel(false);
        setAssistantCopy(data.assistant);
        setHeroFrameUrl(null);
        setHeroFrameSlug(null);
        setHeroFrameLoopPrompt(null);
      });
    } catch (error) {
      const fallbackAsset =
        isRemotionTemplateSelected
          ? buildLocalRemotionAsset({
              websiteUrl: brandData?.brand.url ?? websiteUrl,
              productType,
              styleId: selectedStyleId,
              selectedTemplate: selectedTemplate ?? starterAssets[0],
            })
          : buildDemoAsset({
              websiteUrl: brandData?.brand.url ?? websiteUrl,
              productType,
              styleId: selectedStyleId,
              count: generatedAssets.length + 1,
            });

      const userFriendlyError = error instanceof Error ? error.message : "Asset generation failed.";

      startTransition(() => {
        setGeneratedAssets((current) => [fallbackAsset, ...current]);
        setSelectedGeneratedAssetId(fallbackAsset.id);
        setShowSetupPanel(false);
        setAssistantCopy({
          headline: `Generation failed — showing preview instead.`,
          body:
            fallbackAsset.provider === "remotion-plan"
              ? "Video generation is taking longer than expected. Please try again. A local brief has been created as a fallback."
              : isKlingTemplateSelected
                ? "Kling video generation failed. Please try again later. A local preview has been created as a fallback."
              : isVeoTemplateSelected
                ? "Veo video generation failed. Please try again later. A local preview has been created as a fallback."
              : `Generation failed: ${userFriendlyError}. A local preview has been created as a fallback.`,
        });
      });

      setErrorMessage(userFriendlyError);
    } finally {
      setIsGenerating(false);
      generationStartedAtRef.current = null;
    }
  }

  // Load user data from Supabase
  async function loadUserData(userId: string) {
    try {
      // Load saved brand
      const brands = await loadBrands(userId);
      if (brands.length > 0) {
        const savedBrand = brands[0];
        const bd = savedBrand.brand_data;
        if (bd?.brand) {
          // Only load from DB if we don't already have brand data in state (e.g. from landing page)
          setBrandData((prev: any) => prev?.brand ? prev : bd);
          setEditablePalette((prev) => prev.length > 0 ? prev : createEditablePalette(bd.brand.palette ?? []));
          if (savedBrand.brand_colors && Object.keys(savedBrand.brand_colors).length > 0) {
            setBrandColorConfig((prev) => Object.values(prev).some((v) => v) ? prev : savedBrand.brand_colors as any);
          }
          setProductType(bd.brand.productType as any);
          setAssetLanguage(savedBrand.language || "English");
          setCustomLogoUrl((prev) => prev || savedBrand.logo_url || null);
          startWorkflowUnlockSequence();
        }
      } else if (brandData?.brand) {
        // No saved brands in DB but we have one from the landing page — keep it and start unlock
        startWorkflowUnlockSequence();
      }
      // Load saved pipelines (deduplicate by name in case of prior bugs)
      const pips = await loadPipelines(userId);
      if (pips.length > 0) {
        const seen = new Set<string>();
        const deduped = pips.filter((p) => {
          const key = p.name + "|" + p.postType;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Clean up duplicates from DB
        const dupeIds = pips.filter((p) => !deduped.includes(p)).map((p) => p.dbId).filter(Boolean);
        if (dupeIds.length > 0) {
          import("./db").then(({ deletePipeline }) => {
            dupeIds.forEach((id) => deletePipeline(id!).catch(() => {}));
          });
        }
        setDashboardPipelines(deduped);
      }
      // Check subscription status
      fetch(`${API_BASE}/api/subscription/status?userId=${userId}`)
        .then((r) => r.json())
        .then((sub) => { if (sub?.active) setHasProSubscription(true); })
        .catch(() => {});
    } catch (error) {
      console.error("Failed to load user data:", error);
    } finally {
      setIsBrandLoading(false);
    }
  }

  // Sync custom logo into brandData so it persists and gets sent to backend
  useEffect(() => {
    if (customLogoUrl && brandData?.brand) {
      const currentLogo = brandData.brand.logoCandidates?.[0]?.url;
      if (currentLogo !== customLogoUrl) {
        setBrandData((prev: any) => prev ? {
          ...prev,
          brand: {
            ...prev.brand,
            logoCandidates: [
              { url: customLogoUrl, type: "image", source: "custom-upload", confidence: 1, alt: "Custom logo" },
              ...(prev.brand.logoCandidates || []).filter((c: any) => c.source !== "custom-upload"),
            ],
          },
        } : prev);
      }
    }
  }, [customLogoUrl]);

  // Save brand to Supabase when it changes
  useEffect(() => {
    if (user && brandData?.brand) {
      const timeout = setTimeout(() => {
        saveBrand(user.id, brandData, brandColorConfig).catch(() => {});
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [brandData, brandColorConfig, user]);

  // Save pipelines to Supabase when they change
  useEffect(() => {
    if (!user || dashboardPipelines.length === 0) return;

    const timeout = setTimeout(async () => {
      for (const p of dashboardPipelines) {
        try {
          if (p.dbId) {
            // Existing pipeline — update it
            await savePipeline(user.id, p);
          } else {
            // New pipeline — insert and write back dbId
            const saved = await savePipeline(user.id, p);
            if (saved?.id) {
              setDashboardPipelines((prev) =>
                prev.map((pp) => pp.id === p.id ? { ...pp, dbId: saved.id } : pp)
              );
            }
          }
        } catch {}
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [dashboardPipelines, user]);

  // Auto-save pipelines to server when they change
  useEffect(() => {
    if (user && dashboardPipelines.length > 0 && brandData) {
      const timeout = setTimeout(() => {
        fetch(`${API_BASE}/api/pipelines/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, pipelines: dashboardPipelines, brandData }),
        }).catch(() => {});
      }, 2000); // Debounce 2s
      return () => clearTimeout(timeout);
    }
  }, [dashboardPipelines, user, brandData]);

  // Supabase auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Check if there's a pending brand from before OAuth redirect
        let pendingBrand = null;
        let pendingColors = null;
        try {
          const storedBrand = localStorage.getItem("botface_pending_brand");
          const storedColors = localStorage.getItem("botface_pending_colors");
          if (storedBrand) pendingBrand = JSON.parse(storedBrand);
          if (storedColors) pendingColors = JSON.parse(storedColors);
        } catch {}

        if (pendingBrand?.brand) {
          console.log("[auth] Restoring pending brand from localStorage on page load");
          setBrandData(pendingBrand as any);
          if (pendingColors) setBrandColorConfig(pendingColors);
          setIsBrandLoading(false);
          saveBrand(session.user.id, pendingBrand, pendingColors || defaultBrandColorConfig).then(() => {
            console.log("[auth] Pending brand saved to Supabase");
            try { localStorage.removeItem("botface_pending_brand"); localStorage.removeItem("botface_pending_colors"); } catch {}
          }).catch(() => {});
          startWorkflowUnlockSequence();
        } else {
          loadUserData(session.user.id);
        }
        if (location.pathname === "/") {
          navigate("/dashboard");
        }
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // Auto-redirect to dashboard on sign in
      if (event === "SIGNED_IN" && session?.user) {
        // Check ref first, then localStorage (survives OAuth page reload)
        let currentBrand = brandDataRef.current;
        let currentColors = brandColorConfigRef.current;
        if (!currentBrand?.brand) {
          try {
            const stored = localStorage.getItem("botface_pending_brand");
            if (stored) currentBrand = JSON.parse(stored);
          } catch {}
        }
        if (!Object.values(currentColors).some(v => v)) {
          try {
            const stored = localStorage.getItem("botface_pending_colors");
            if (stored) currentColors = JSON.parse(stored);
          } catch {}
        }

        console.log("[auth] SIGNED_IN | brand in ref:", !!brandDataRef.current?.brand, "| brand from localStorage:", !!currentBrand?.brand);

        if (currentBrand?.brand) {
          // Restore brand data into state
          setBrandData(currentBrand as any);
          setBrandColorConfig(currentColors);
          // Save to Supabase
          saveBrand(session.user.id, currentBrand, currentColors).then(() => {
            console.log("[auth] Brand saved to Supabase for", session.user.id);
            // Clear localStorage after successful save
            try { localStorage.removeItem("botface_pending_brand"); localStorage.removeItem("botface_pending_colors"); } catch {}
            loadUserData(session.user.id);
          }).catch((err) => {
            console.error("[auth] Brand save failed:", err);
            loadUserData(session.user.id);
          });
        } else {
          loadUserData(session.user.id);
        }
        if (location.pathname === "/") {
          navigate("/dashboard");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleLockupCards((current) => {
          const next = [...current];

          for (const entry of entries) {
            const index = Number(entry.target.getAttribute("data-lockup-index") ?? -1);

            if (index >= 0) {
              next[index] = entry.isIntersecting && entry.intersectionRatio > 0.35;
            }
          }

          return next;
        });
      },
      {
        threshold: [0.2, 0.35, 0.5, 0.7],
        rootMargin: "-12% 0px -12% 0px",
      }
    );

    lockupContentRefs.current.forEach((node) => {
      if (node) {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [location.pathname, user]);

  useEffect(() => {
    return () => clearUnlockTimers();
  }, []);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      const startedAt = generationStartedAtRef.current;
      setGenerationElapsedMs(startedAt ? Math.max(0, Date.now() - startedAt) : 0);
    };

    updateElapsed();
    const intervalId = window.setInterval(() => {
      updateElapsed();
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isGenerating]);

  // Hero frame generation timer
  useEffect(() => {
    if (!isGeneratingHeroFrame) {
      setHeroFrameElapsedMs(0);
      return;
    }
    const update = () => {
      const s = heroFrameStartedAtRef.current;
      setHeroFrameElapsedMs(s ? Math.max(0, Date.now() - s) : 0);
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [isGeneratingHeroFrame]);

  const isInDashboardMode = (location.pathname === "/dashboard" || location.pathname === "/demo" || location.pathname === "/") && user;
  const isDemoMode = location.pathname === "/demo" || location.pathname === "/";
  const isLandingPageRoute = location.pathname === "/landingpage";
  // showLandingContent: only on /landingpage now (homepage is demo mode)
  const showLandingContent = isLandingPageRoute;
  const isStylePanelUnlocked = (isInDashboardMode && brandData) || workflowUnlockStep >= 1;
  const isGeneratedPanelUnlocked = (isInDashboardMode && brandData) || workflowUnlockStep >= 2;
  const isHistoryPanelUnlocked = (isInDashboardMode && brandData) || workflowUnlockStep >= 3;
  const extractedLogos = brandData?.brand.logoCandidates ?? brandData?.extraction?.logoCandidates ?? [];
  const websiteScreenshotAsset =
    brandData?.extraction?.screenshotUrl
      ? {
          id: "website-screenshot",
          type: "website-screenshot",
          source: "firecrawl:screenshot",
          url: brandData.extraction.screenshotUrl,
          confidence: 0.99,
        }
      : null;
  const extractedAssetsBase = brandData?.brand.extractedAssets ?? brandData?.extraction?.assetCandidates ?? [];
  const extractedAssets = websiteScreenshotAsset && !extractedAssetsBase.some((asset) => asset.url === websiteScreenshotAsset.url)
    ? [websiteScreenshotAsset, ...extractedAssetsBase]
    : extractedAssetsBase;
  const extractedProducts = brandData?.brand.extractedProducts ?? brandData?.extraction?.productCandidates ?? [];
  const extractedColors = editablePalette
    .filter((color) => color.enabled && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.value))
    .map((color) => color.value);
  const extractionStages = brandData?.extraction?.fallbackStages ?? [];
  const primaryLogo = extractedLogos[0] ?? null;
  const primaryLogoPreviewUrl = buildRemoteAssetPreviewUrl(primaryLogo?.url);
  const extractionMode = (brandData as any)?.isSampleProject
    ? "Sample project"
    : extractionStages.some(
        (stage) =>
          (stage.stage === "raw_html_parse" || stage.stage === "firecrawl_scrape")
          && stage.status === "completed"
      )
      ? "Live extraction"
      : brandData
        ? "Fallback extraction"
        : "Waiting for detection";
  const isDashboardLoading = isInDashboardMode && user && isBrandLoading && !brandData;
  const isDashboardGated = (!brandData && !isDashboardLoading) || onboardingStep > 0 || !!pendingBrandData;

  // Auto-start voice agent in demo mode when onboarding gate appears
  useEffect(() => {
    if (isDemoMode && user && !voiceAgentStarted && !brandData && !isBrandLoading) {
      const timer = setTimeout(() => startVoiceSession("onboarding"), 1500);
      return () => clearTimeout(timer);
    }
  }, [isDemoMode, user, voiceAgentStarted, brandData, isBrandLoading]);
  const hasGeneratedOutputs = generatedAssets.length > 0;
  const isHistoryMode = hasGeneratedOutputs && !showSetupPanel;
  const projectSummary =
    brandData?.brand.summary ??
    brandData?.extraction?.summary ??
    brandData?.extraction?.description ??
    "Paste a product site and the app will map the business, brand direction, and starter asset plan.";
  const selectedAssetPreviewUrl = buildAssetPreviewDataUrl({
    asset: previewAsset,
    palette: extractedColors,
    brandName: brandData?.brand.name ?? "Marketing Stack",
    styleName: activeStyle?.name ?? "Minimal mint",
  });
  const rawMediaUrl = previewAsset?.format === "Video" ? previewAsset.mediaUrl ?? "" : selectedAssetPreviewUrl;
  const selectedAssetMediaUrl = rawMediaUrl && rawMediaUrl.startsWith("/") ? `${API_BASE}${rawMediaUrl}` : rawMediaUrl;
  const isVideoTemplateSelected = selectedTemplate?.format === "Video";
  const isRemotionTemplateSelected = selectedTemplate?.channel === "Remotion";
  const isKlingTemplateSelected = selectedTemplate?.channel === "Kling" || selectedTemplate?.channel === "Veo 3.1";
  const isVeoTemplateSelected = selectedTemplate?.channel === "Veo 3.1";
  const canDownloadSelectedGeneratedAsset = Boolean(
    selectedGeneratedAsset &&
    (selectedGeneratedAsset.format === "Video" ? selectedGeneratedAsset.mediaUrl : (selectedGeneratedAsset.previewUrl ?? buildAssetPreviewDataUrl({
      asset: selectedGeneratedAsset,
      palette: extractedColors,
      brandName: brandData?.brand.name ?? "Marketing Stack",
      styleName: activeStyle?.name ?? "Minimal mint",
    })))
  );

  async function downloadAsset(asset: Asset) {
    const assetExtension =
      asset.format === "Video" ? "mp4" :
      asset.previewUrl?.startsWith("data:image/png") ? "png" :
      asset.previewUrl?.startsWith("data:image/jpeg") ? "jpg" :
      asset.previewUrl?.startsWith("data:image/webp") ? "webp" :
      "svg";
    const assetUrl =
      asset.format === "Video"
        ? asset.mediaUrl
        : asset.previewUrl ?? buildAssetPreviewDataUrl({
            asset,
            palette: extractedColors,
            brandName: brandData?.brand.name ?? "Marketing Stack",
            styleName: activeStyle?.name ?? "Minimal mint",
          });

    if (!assetUrl) {
      return;
    }

    const filename = `${sanitizeFilename(`${brandData?.brand.name ?? "online-brand"}-${asset.title}`)}.${assetExtension}`;

    if (assetUrl.startsWith("data:")) {
      // Data URL (base64) — convert to blob and download
      const byteString = atob(assetUrl.split(",")[1]);
      const mimeString = assetUrl.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } else {
      // Server URL or external — fetch as blob and download
      const fetchUrl = assetUrl.startsWith("/") ? `${API_BASE}${assetUrl}` : assetUrl;
      try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Failed to fetch");
        const blob = await response.blob();
        if (blob.size < 100) throw new Error("Empty file");
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(fetchUrl, "_blank");
      }
    }
  }

  function handleDownloadAsset() {
    if (!selectedGeneratedAsset) {
      return;
    }
    downloadAsset(selectedGeneratedAsset);
  }

  function updatePaletteColor(colorId: string, nextValue: string) {
    setEditablePalette((current) =>
      current.map((color) => (color.id === colorId ? { ...color, value: nextValue.toUpperCase(), enabled: true } : color))
    );
  }

  function togglePaletteColor(colorId: string) {
    setEditablePalette((current) =>
      current.map((color) => (color.id === colorId ? { ...color, enabled: !color.enabled } : color))
    );
  }

  // Demo page: clean login screen when not authenticated
  if (isDemoMode && !user) {
    return (
      <div className="app-shell demo-page">
        <div className="demo-login-container">
          <div className="demo-login-card glass-card">
            <img src="/botface.webp" alt="MS" className="demo-login-avatar" />
            <h1>Marketing Stack</h1>
            <p className="meta">AI Marketing Operating System</p>
            <p className="demo-login-subtitle">Sign in to start your brand setup with our AI assistant</p>
            <button className="button button-primary" onClick={() => setShowAuthPopup(true)}>
              Sign in to get started
            </button>
          </div>
        </div>
        {showAuthPopup && (
          <AuthPopup
            onClose={() => setShowAuthPopup(false)}
            onAuthenticated={() => {
              setShowAuthPopup(false);
              navigate(location.pathname === "/demo" ? "/demo" : "/");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {showLandingContent && <header className="topbar">
        <div className="brand">
          <div className="brand-mark">MS</div>
          <div>
            <p className="meta">marketingstack.app</p>
            <h1>AI Marketing Operating System</h1>
          </div>
        </div>

        <nav className="nav">
          {showLandingContent && (
            <>
              <a href="#product">Product</a>
              <a href="#dashboard">Dashboard</a>
              <a href="#workflow">Workflow</a>
            </>
          )}
          {user ? (
            <button
              className="button button-secondary"
              onClick={() => navigate(isInDashboardMode ? "/" : "/dashboard")}
              title={user.email ?? ""}
            >
              {isInDashboardMode ? "← Creator only" : `${user.email?.split("@")[0] ?? "Account"} ✓`}
            </button>
          ) : (
            <button className="button button-secondary" onClick={() => setShowAuthPopup(true)}>
              Sign in
            </button>
          )}
        </nav>
      </header>}

      <main>
        {showLandingContent && <><section className="hero section">
          <div className="hero-copy">
            <div className="eyebrow-pill">
              <Sparkles size={14} />
              <span>Calm AI growth infrastructure</span>
            </div>

            <h2>
              Your <span className="accent">AI marketing team</span>, running every day.
            </h2>

            <p>
              Paste a product link. Detect the brand. Approve the direction. Generate blogs, posts, and product
              creatives from one quiet operating system.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#dashboard">
                Get started
                <ArrowRight size={16} />
              </a>
              <a className="button button-secondary" href="#dashboard">
                See dashboard
              </a>
            </div>
          </div>

          <div className="device-stage">
            <PhoneMockup title="AI Brand Kit" subtitle="Detection" variant="brand" />
            <PhoneMockup title="Daily Workflow" subtitle="Automation" variant="workflow" />
            <PhoneMockup title="Generated Library" subtitle="Outputs" variant="library" />
          </div>
        </section>


        <section className="lockup-section" id="product">
          <div className="lockup-wrapper">
            <div className="lockup-content-wrapper">
              <div
                ref={(node) => {
                  lockupContentRefs.current[0] = node;
                }}
                className={`lockup-content lockup-content-1 ${visibleLockupCards[0] ? "is-visible" : ""}`}
                data-lockup-index="0"
              >
                <div className="lockup-mobile-visual">
                  <LockupVisual variant="detect" isActive={visibleLockupCards[0]} />
                </div>
                <div className="lockup-meta">
                  <p className="lockup-kicker">What the product does</p>
                  <h2 className="lockup-headline">
                    We detect the <span className="lockup-text-highlight">brand</span>, then build the entire marketing
                    system around it.
                  </h2>
                  <p className={`lockup-desc ${visibleLockupCards[0] ? "is-visible" : ""}`}>
                    The product starts with a URL. It reads the brand language, suggests a style system, and uses that
                    to generate publishing-ready assets with consistency across channels.
                  </p>
                </div>
                <div className="lockup-desktop-visual">
                  <div className="lockup-inline-card">
                    <LockupVisual variant="detect" isActive={visibleLockupCards[0]} />
                  </div>
                </div>
              </div>

              <div
                ref={(node) => {
                  lockupContentRefs.current[1] = node;
                }}
                className={`lockup-content lockup-content-2 ${visibleLockupCards[1] ? "is-visible" : ""}`}
                data-lockup-index="1"
              >
                <div className="lockup-mobile-visual">
                  <LockupVisual variant="chaos" isActive={visibleLockupCards[1]} />
                </div>
                <div className="lockup-meta">
                  <p className="lockup-kicker">What happens next</p>
                  <h2 className="lockup-headline">
                    Then we pull the brand through the <span className="lockup-text-highlight">chaos</span> of channels,
                    tools, and production systems.
                  </h2>
                  <p className={`lockup-desc ${visibleLockupCards[1] ? "is-visible" : ""}`}>
                    Marketing Stack turns a messy stack into one controlled operating layer for social posts, graphics,
                    videos, campaign ideas, blog drafts, and launch assets.
                  </p>
                </div>
                <div className="lockup-desktop-visual">
                  <div className="lockup-inline-card">
                    <LockupVisual variant="chaos" isActive={visibleLockupCards[1]} />
                  </div>
                </div>
              </div>

              <div
                ref={(node) => {
                  lockupContentRefs.current[2] = node;
                }}
                className={`lockup-content lockup-content-3 ${visibleLockupCards[2] ? "is-visible" : ""}`}
                data-lockup-index="2"
              >
                <div className="lockup-mobile-visual">
                  <LockupVisual variant="system" isActive={visibleLockupCards[2]} />
                </div>
                <div className="lockup-meta">
                  <p className="lockup-kicker">Where it lands</p>
                  <h2 className="lockup-headline">
                    Everything resolves into one calm <span className="lockup-text-highlight">operating system</span>.
                  </h2>
                  <p className={`lockup-desc ${visibleLockupCards[2] ? "is-visible" : ""}`}>
                    One approved brand system becomes a clean workflow for campaigns, post generation, blogs, image
                    production, and video output, all orchestrated from a single layer.
                  </p>
                </div>
                <div className="lockup-desktop-visual">
                  <div className="lockup-inline-card">
                    <LockupVisual variant="system" isActive={visibleLockupCards[2]} />
                  </div>
                </div>
              </div>

              <div
                ref={(node) => {
                  lockupContentRefs.current[3] = node;
                }}
                className={`lockup-content lockup-content-4 ${visibleLockupCards[3] ? "is-visible" : ""}`}
                data-lockup-index="3"
              >
                <div className="lockup-mobile-visual">
                  <LockupVisual variant="daily" isActive={visibleLockupCards[3]} />
                </div>
                <div className="lockup-meta">
                  <p className="lockup-kicker">Daily outcome</p>
                  <h2 className="lockup-headline">
                    Your marketing runs with <span className="lockup-text-highlight">consistency</span> every day.
                  </h2>
                  <p className={`lockup-desc ${visibleLockupCards[3] ? "is-visible" : ""}`}>
                    From launch posts to blogs and short-form videos, the system keeps the brand coherent without
                    rebuilding the stack from scratch each time.
                  </p>
                </div>
                <div className="lockup-desktop-visual">
                  <div className="lockup-inline-card">
                    <LockupVisual variant="daily" isActive={visibleLockupCards[3]} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section features-grid" id="workflow">
          {featureCards.map((card) => {
            return (
              <article key={card.title} className="glass-card feature-card">
                <FeatureCardAnimation variant={card.animation} />
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            );
          })}
        </section></>}

        <section className={`section dashboard-section ${isInDashboardMode ? "dashboard-section--fullpage" : ""}`} id="dashboard">
          <div className={`dashboard-shell glass-card ${isDashboardGated || isDashboardLoading ? "is-gated" : ""}`}>
            <div className="dashboard-grid">
              <div className={`dashboard-panel left-panel ${isStylePanelUnlocked ? "is-unlocked" : "is-locked"} ${isInDashboardMode && brandPanelCollapsed ? "left-panel--collapsed" : ""}`}>
                <div className="panel-head">
                  <span className="meta">{isInDashboardMode ? "Brand" : "Brand extraction"}</span>
                  {isInDashboardMode && (
                    <button className="brand-panel-toggle" onClick={() => setBrandPanelCollapsed((c) => !c)} title={brandPanelCollapsed ? "Expand brand panel" : "Collapse brand panel"}>
                      {brandPanelCollapsed ? "›" : "‹"}
                    </button>
                  )}
                </div>

                {/* Brands list view (dashboard mode only) */}
                <div className="detected-url">
                  <span className="meta">Source</span>{" "}
                  <strong>{brandData?.brand.url ?? websiteUrl}</strong>
                  <button
                    className="source-reset-btn"
                    onClick={() => {
                      setBrandData(null);
                      setPendingBrandData(null);
                      setOnboardingStep(0);
                      setWebsiteUrl("");
                      setGeneratedAssets([]);
                      setShowSetupPanel(true);
                      setCustomLogoUrl(null);
                      setUserReferenceUrls([]);
                      setBrandColorConfig(defaultBrandColorConfig);
                      setEditablePalette([]);
                    }}
                    title="Detect a new brand"
                  >
                    Reset
                  </button>
                </div>
                <div className="project-summary-card">
                  <div className="language-visual-row">
                    <div className="language-selector">
                      <span className="meta">Language</span>
                      <select
                        className="language-dropdown"
                        value={assetLanguage}
                        onChange={(e) => setAssetLanguage(e.target.value)}
                      >
                        {[
                          "English", "French", "Spanish", "German", "Italian", "Portuguese",
                          "Dutch", "Arabic", "Japanese", "Korean", "Chinese", "Russian",
                          "Turkish", "Hindi", "Swedish", "Norwegian", "Danish", "Finnish",
                          "Polish", "Czech", "Greek", "Hebrew", "Thai", "Vietnamese", "Indonesian",
                        ].map((lang) => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </div>
                    <div className="language-selector">
                      <span className="meta">Direction</span>
                      <select
                        className="language-dropdown"
                        value={selectedStyleId}
                        onChange={(e) => setSelectedStyleId(e.target.value)}
                      >
                        {styleOptions.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.recommended ? `${style.name} - recommended` : style.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="project-category-editor">
                    <select
                      className="project-category-select"
                      value={productType}
                      onChange={(event) => selectProductType(event.target.value as ProductType)}
                      disabled={!isStylePanelUnlocked}
                    >
                      {productTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {categoryForProductType(type)}
                        </option>
                      ))}
                    </select>
                    <span className="project-category-icon" aria-hidden="true">
                      <Pencil size={14} />
                    </span>
                  </div>
                  <p
                    contentEditable
                    suppressContentEditableWarning
                    className="project-summary-editable"
                    onBlur={(e) => {
                      const newSummary = e.currentTarget.textContent?.trim() || "";
                      if (newSummary && brandData) {
                        setBrandData((prev: any) => prev ? { ...prev, brand: { ...prev.brand, summary: newSummary } } : prev);
                      }
                    }}
                  >{projectSummary}</p>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="meta">Brand feel</span>
                    <strong style={{ fontSize: "0.88rem" }}>{brandData?.brand.vibe ?? brandData?.brand.tone ?? "Pending detection"}</strong>
                  </div>
                </div>
                <div className="brand-kit extracted-brand-kit">
                  <div className="brand-inline-grid">
                    <div className="brand-logo-product-row">
                    <div className="brand-inline-logo" aria-disabled={!isStylePanelUnlocked}>
                      <span className="meta">Logo</span>
                      <div
                        className={`logo-upload-box ${customLogoUrl || primaryLogoPreviewUrl ? "has-logo" : ""}`}
                        onClick={() => logoFileInputRef.current?.click()}
                      >
                        {customLogoUrl || primaryLogoPreviewUrl ? (
                          <img
                            src={customLogoUrl || primaryLogoPreviewUrl}
                            alt={primaryLogo?.alt || `${brandData?.brand.name ?? "Brand"} logo`}
                            onError={(e) => {
                              // If proxy fails (SVG etc), try direct URL
                              const target = e.currentTarget;
                              if (primaryLogo?.url && !target.dataset.retried) {
                                target.dataset.retried = "1";
                                target.src = primaryLogo.url;
                              }
                            }}
                          />
                        ) : (
                          <span className="logo-upload-placeholder">
                            <Plus size={20} />
                          </span>
                        )}
                        <span className="logo-upload-overlay">
                          <Pencil size={14} />
                        </span>
                      </div>
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file && user) {
                            const path = `${user.id}/${Date.now()}-logo.${file.name.split('.').pop()}`;
                            const { data } = await supabase.storage.from('brand-assets').upload(path, file);
                            if (data) {
                              const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(path);
                              setCustomLogoUrl(publicUrl);
                            }
                          } else if (file) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              setCustomLogoUrl(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                    <div className="brand-inline-product" aria-disabled={!isStylePanelUnlocked}>
                      <span className="meta">References <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>(Products, screenshots, mascot...)</span></span>
                      <div className="reference-uploads-row">
                        {userReferenceUrls.map((url, i) => (
                          <div key={i} className="logo-upload-box has-logo" style={{ width: 64, height: 64, borderRadius: 12 }}>
                            <img src={url} alt={`Reference ${i + 1}`} />
                            <span className="logo-upload-overlay" onClick={() => setUserReferenceUrls((prev) => prev.filter((_, j) => j !== i))}>
                              ✕
                            </span>
                          </div>
                        ))}
                        {userReferenceUrls.length < 3 && (
                          <div
                            className="logo-upload-box"
                            style={{ width: 64, height: 64, borderRadius: 12 }}
                            onClick={() => referenceFileInputRef.current?.click()}
                          >
                            <span className="logo-upload-placeholder">
                              <Plus size={16} />
                            </span>
                          </div>
                        )}
                      </div>
                      <input
                        ref={referenceFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || userReferenceUrls.length >= 3) return;
                          if (file && user) {
                            const path = `${user.id}/${Date.now()}-ref.${file.name.split('.').pop()}`;
                            const { data } = await supabase.storage.from('brand-assets').upload(path, file);
                            if (data) {
                              const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(path);
                              setUserReferenceUrls((prev) => [...prev, publicUrl]);
                            }
                          } else if (file) {
                            const reader = new FileReader();
                            reader.onload = () => setUserReferenceUrls((prev) => [...prev, reader.result as string]);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                    </div>
                    <div className="brand-inline-palette" aria-disabled={!isStylePanelUnlocked}>
                      <span className="meta">Brand Colors</span>
                      <div className="brand-color-config">
                        {brandColorRoles.map((role) => {
                          const val = brandColorConfig[role.key];
                          const isEditing = editingColorRole === role.key;
                          return (
                            <div key={role.key} className={`color-role-item ${isEditing ? "color-role-item--editing" : ""}`} onClick={() => !isEditing && setEditingColorRole(role.key)} style={{ cursor: isEditing ? "default" : "pointer" }}>
                              {isEditing ? (
                                <>
                                  <label className="color-role-swatch color-role-swatch--editing" style={{ background: val || "#888" }}>
                                    <Pencil size={12} color="white" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }} />
                                    <input
                                      type="color"
                                      value={val || "#FFFFFF"}
                                      onChange={(e) => setBrandColorConfig((c) => ({ ...c, [role.key]: e.target.value.toUpperCase() }))}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", top: 0, left: 0, cursor: "pointer" }}
                                    />
                                  </label>
                                  <input
                                    type="text"
                                    className="color-role-hex-inline"
                                    value={val || ""}
                                    placeholder="#000000"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setBrandColorConfig((c) => ({ ...c, [role.key]: v.toUpperCase() }));
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="color-role-trash-btn"
                                    onClick={(e) => { e.stopPropagation(); setBrandColorConfig((c) => ({ ...c, [role.key]: "" })); setEditingColorRole(""); }}
                                    title="Clear color"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="color-role-check-btn"
                                    onClick={(e) => { e.stopPropagation(); setEditingColorRole(""); }}
                                    title="Done"
                                  >
                                    <Check size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <div
                                    className={`color-role-swatch ${!val ? "is-empty" : ""}`}
                                    style={val ? { background: val } : undefined}
                                  >
                                    <span className="palette-swatch-icon">
                                      {val ? <Pencil size={10} /> : <Plus size={12} />}
                                    </span>
                                  </div>
                                  <div className="color-role-info">
                                    <span className="color-role-name">{role.label}</span>
                                    {val ? (
                                      <span className="color-role-hex">{val}</span>
                                    ) : (
                                      <span className="color-role-hint">{role.hint}</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isInDashboardMode ? (
                <div className="dashboard-panel pipeline-panel">
                  <div className="panel-head">
                    <span className="meta">Pipelines</span>
                  </div>
                  <PipelinePanel
                    pipelines={dashboardPipelines}
                    onUpdate={setDashboardPipelines}
                    brandName={brandData?.brand.name || "Brand"}
                    connectedAccounts={connectedSocialAccounts}
                    profileUsername={user ? `botface_${user.id}` : undefined}
                    voiceTranscript={voiceAgentMode === "dashboard" ? voiceAgentMessage : null}
                    voiceIsSpeaking={voiceAgentMode === "dashboard" ? voiceAgent.isSpeaking : false}
                    voiceStarted={voiceAgentMode === "dashboard" && voiceAgentStarted}
                    onStartVoice={startDashboardVoiceAgent}
                    onEndVoice={() => { voiceAgent.endSession().catch(() => {}); setVoiceAgentStarted(false); setVoiceAgentMode(null); setVoiceAgentMessage(null); }}
                    hasProSubscription={hasProSubscription}
                    onShowPaywall={() => setShowPaywall(true)}
                    onTestPipeline={async (pipeline) => {
                      if (!user) return;
                      // Save pipelines + brand data to server first
                      await fetch(`${API_BASE}/api/pipelines/save`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id, pipelines: dashboardPipelines, brandData }),
                      }).catch(() => {});
                      // Test the pipeline
                      const res = await fetch(`${API_BASE}/api/pipelines/test`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id, pipelineId: pipeline.id }),
                      });
                      const data = await res.json();
                      if (data.ok) {
                        setDashboardPipelines((prev) => prev.map((p) => p.id === pipeline.id ? { ...p, ...data.pipeline } : p));
                      }
                    }}
                    onTestGenerate={async (pipeline) => {
                      if (!user) return null;
                      // Save pipelines + brand data to server first
                      await fetch(`${API_BASE}/api/pipelines/save`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id, pipelines: dashboardPipelines, brandData }),
                      }).catch(() => {});
                      // Generate only (no posting)
                      const res = await fetch(`${API_BASE}/api/pipelines/generate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id, pipelineId: pipeline.id }),
                      });
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || "Generation failed.");
                      if (data.pipeline) {
                        setDashboardPipelines((prev) => prev.map((p) => p.id === pipeline.id ? { ...p, ...data.pipeline } : p));
                      }
                      return { url: data.url, caption: data.caption, format: data.format };
                    }}
                    onTestPost={async (pipeline, assetUrl, caption) => {
                      if (!user) return;
                      const res = await fetch(`${API_BASE}/api/pipelines/post`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id, pipelineId: pipeline.id, assetUrl, caption }),
                      });
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || "Posting failed.");
                      if (data.pipeline) {
                        setDashboardPipelines((prev) => prev.map((p) => p.id === pipeline.id ? { ...p, ...data.pipeline } : p));
                      }
                    }}
                    onConnectAccounts={handleConnectAccounts}
                  />
                </div>
              ) : null}
              {showLandingContent && <div className={`dashboard-panel center-panel ${isGeneratedPanelUnlocked ? "is-unlocked" : "is-locked"}`}>

                {/* Post type description card — above template cards, with Botface */}
                {selectedTemplate && (
                  <div className="video-hint-card video-hint-card--with-avatar video-hint-card--transparent">
                    <div className="video-hint-card-content">
                      <p>
                        {isKlingTemplateSelected
                          ? <>I'll create a short <b><i>vertical video (9:16)</i></b> for you. First I'll generate a test frame from your brand — you get to review it before I render the final <b><i>5-second video</i></b>.</>
                          : isVeoTemplateSelected && !isKlingTemplateSelected
                          ? <>I'll put together an <b><i>8-second widescreen video (16:9)</i></b> using your logo and website as visual anchors. I write the storyboard, then render the final <b><i>MP4</i></b>.</>
                          : isRemotionTemplateSelected
                          ? <>I'll build a <b><i>motion video (4:5)</i></b> with animated scenes, voiceover, and background music — all adapted to your brand. You'll get a real <b><i>MP4</i></b> back.</>
                          : selectedTemplate?.title?.toLowerCase().includes("lifestyle")
                          ? <>I'll generate a <b><i>square image (1080x1080)</i></b> that feels like a real lifestyle or product-in-use shot — authentic, premium, and native to social.</>
                          : <>I'll design a polished <b><i>square image (1080x1080)</i></b> with your brand colors, logo, and style. Clean hierarchy, ad-ready composition.</>}
                      </p>
                    </div>
                    <div className="video-hint-card-avatar">
                      <img src="/botface.webp" alt="MS" />
                    </div>
                  </div>
                )}

                {/* Template selection cards — shown before generation */}
                {showSetupPanel && !isGenerating && !isGeneratingHeroFrame && !(isKlingTemplateSelected && heroFrameUrl) && (
                  <div className="template-selection-top">
                    <div className="template-card-grid template-card-grid--top">
                      {assetTemplates.map((item) => (
                        <button
                          key={item.id}
                          className={`template-card ${selectedTemplateId === item.id ? "active" : ""}`}
                          onClick={() => setSelectedTemplateId(item.id)}
                          disabled={!isHistoryPanelUnlocked}
                        >
                          <div className="template-card-thumb-wrap">
                            {item.previewUrl?.endsWith(".webm") ? (
                              <video className="template-card-thumb-media" src={item.previewUrl} poster={item.previewUrl.replace(".webm", "-poster.jpg")} muted autoPlay loop playsInline />
                            ) : (
                              <img className="template-card-thumb-media" src={item.previewUrl || ""} alt={item.title} />
                            )}
                          </div>
                          <strong>{item.title}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hero frame loading — shown while generating hero frame */}
                {isGeneratingHeroFrame && (
                  <div className="hero-frame-loading onboarding-step">
                    <div className="preview-canvas">
                      <div className="preview-glow" />
                      <div className="preview-card preview-card--9x16 is-loading">
                        <div className="preview-image preview-image-empty">
                          <ImageIcon size={22} />
                          <strong>Generating test frame</strong>
                          <span>Gemini is composing a branded reference frame for your Kling video.</span>
                        </div>
                        <div className="preview-loading-overlay" aria-live="polite">
                          <div className="generation-progress">
                            <div className="generation-progress-bar">
                              <div className="generation-progress-fill" style={{ width: `${Math.min(95, (heroFrameElapsedMs / 1000 / 30) * 100)}%` }} />
                            </div>
                            <div className="generation-progress-info">
                              <strong>{(heroFrameElapsedMs / 1000).toFixed(0)}s</strong>
                              <span className="meta">~30s estimated</span>
                            </div>
                            <span className="preview-loader-label">Generating test frame</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hero frame review — image on left, actions on right */}
                {isKlingTemplateSelected && heroFrameUrl && showSetupPanel && !isGenerating && !isGeneratingHeroFrame && (
                  <div className="hero-frame-review hero-frame-review--horizontal onboarding-step">
                    <img src={heroFrameUrl} alt="Hero frame preview" className="hero-frame-preview-img" />
                    <div className="hero-frame-side">
                      {heroFrameLoopPrompt ? (
                        <p className="hero-frame-loop-prompt">Motion: &ldquo;{heroFrameLoopPrompt}&rdquo;</p>
                      ) : null}
                      <div className="hero-frame-actions hero-frame-actions--vertical">
                        <button
                          className="button button-primary"
                          onClick={handleGenerateAsset}
                          disabled={isGenerating}
                        >
                          Approve & Generate
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={handleGenerateHeroFrame}
                          disabled={isGenerating || isGeneratingHeroFrame}
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview card — shown during/after generation */}
                {(!showSetupPanel || isGenerating) && (
                <>
                <div className="panel-head">
                  <span className="meta">Preview</span>
                  <Play size={15} />
                </div>
                <h3>{previewAsset?.title ?? selectedTemplate?.title ?? "Image post workflow"}</h3>
                </>
                )}
                <div className="preview-canvas" style={showSetupPanel && !isGenerating ? { display: "none" } : undefined}>
                  <div className="preview-glow" />
                  <button
                    type="button"
                    className={`preview-card preview-card-button ${isGenerating ? "is-loading" : ""} ${isKlingTemplateSelected ? "preview-card--9x16" : isRemotionTemplateSelected ? "preview-card--4x5" : "preview-card--square"}`}
                    onClick={() => setShowPreviewModal(true)}
                    disabled={!(previewAsset?.format === "Video" ? selectedAssetMediaUrl : selectedAssetPreviewUrl)}
                  >
                    {previewAsset?.format === "Video" && selectedAssetMediaUrl ? (
                      <video
                        className="preview-image"
                        src={selectedAssetMediaUrl}
                        poster={selectedAssetPreviewUrl}
                        muted
                        playsInline
                        autoPlay
                        loop
                      />
                    ) : selectedAssetPreviewUrl ? (
                      <img
                        className="preview-image"
                        src={selectedAssetPreviewUrl}
                        alt={previewAsset?.title ?? "Generated asset preview"}
                      />
                    ) : (
                      <div className="preview-image preview-image-empty">
                        <ImageIcon size={22} />
                        <strong>{previewAsset?.meta ?? "Screenshot-led creative"}</strong>
                        <span>{previewAsset?.concept ?? "Pick an asset to preview the current workflow."}</span>
                      </div>
                    )}
                    {isGenerating ? (() => {
                      const elapsed = generationElapsedMs / 1000;
                      const estimatedSeconds = isKlingTemplateSelected ? 90 : isRemotionTemplateSelected ? 25 : 30;
                      const progress = Math.min(95, (elapsed / estimatedSeconds) * 100);
                      const label = isKlingTemplateSelected ? "Loop video" : isRemotionTemplateSelected ? "Motion design video" : "image";
                      return (
                        <div className="preview-loading-overlay" aria-live="polite">
                          <div className="generation-progress">
                            <div className="generation-progress-bar">
                              <div className="generation-progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="generation-progress-info">
                              <strong>{elapsed.toFixed(0)}s</strong>
                              <span className="meta">~{estimatedSeconds}s estimated</span>
                            </div>
                            <span className="preview-loader-label">Generating {label}</span>
                          </div>
                        </div>
                      );
                    })() : null}
                  </button>
                  {(!showSetupPanel || isGenerating) && (
                  <div className="preview-meta preview-meta--side">
                    <div>
                      <span className="meta">Status</span>
                      <strong>{previewAsset?.status ?? "Generating..."}</strong>
                    </div>
                    <div>
                      <span className="meta">Output</span>
                      <strong>
                        {previewAsset?.format ?? "Image"}{" "}
                        {previewAsset?.provider === "gemini"
                          ? "via Gemini"
                          : previewAsset?.provider === "kling"
                            ? "via Kling"
                          : previewAsset?.provider === "veo"
                            ? "via Veo 3.1"
                          : previewAsset?.provider === "remotion-render"
                            ? "via Motion Design render"
                          : previewAsset?.provider === "remotion-plan"
                            ? "via Motion Design brief"
                            : isGenerating ? "generating..." : "demo preview"}
                      </strong>
                    </div>
                  </div>
                  )}
                </div>
                {previewAsset?.providerMessage && !showSetupPanel ? (
                  <p className="preview-provider-message">{previewAsset.providerMessage}</p>
                ) : null}
                {previewAsset?.generationDebug ? (
                  <details className="asset-debug-panel">
                    <summary>Generation debug</summary>
                    {(previewAsset.generationDebug as any)?.geminiScript ? (
                      <pre className="debug-prompt-copy">{(previewAsset.generationDebug as any)?.geminiScript}</pre>
                    ) : null}
                    {(previewAsset.generationDebug as any)?.sceneTypes ? (
                      <p className="meta">Scenes: {(previewAsset.generationDebug as any)?.sceneTypes}</p>
                    ) : null}
                    {(previewAsset.generationDebug as any)?.totalDuration ? (
                      <p className="meta">Duration: {(previewAsset.generationDebug as any)?.totalDuration}s</p>
                    ) : null}
                    {previewAsset.generationDebug.attachedReferenceCount != null ? (
                      <p className="meta">Attached references: {previewAsset.generationDebug.attachedReferenceCount}</p>
                    ) : null}
                    {previewAsset.generationDebug.attachedLocalReferenceFiles ? (
                      <p className="meta">
                        Local refs: {previewAsset.generationDebug.attachedLocalReferenceFiles.join(", ") || "none"}
                      </p>
                    ) : null}
                    {previewAsset.generationDebug.attachedLogoReferenceUrl ? (
                      <p className="meta">
                        Logo ref: {previewAsset.generationDebug.attachedLogoReferenceUrl}
                      </p>
                    ) : null}
                    {previewAsset.generationDebug.attachedRemoteReferenceUrls ? (
                      <p className="meta">
                        Remote refs: {previewAsset.generationDebug.attachedRemoteReferenceUrls.join(", ") || "none"}
                      </p>
                    ) : null}
                    {previewAsset.generationDebug.sceneFrameUrls?.length ? (
                      <div className="debug-scene-frame-grid">
                        {previewAsset.generationDebug.sceneFrameUrls.map((url: string, index: number) => (
                          <div key={url} className="debug-scene-frame-card">
                            <img src={url} alt={`Scene frame ${index + 1}`} />
                            <span className="meta">Scene {index + 1}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {previewAsset.generationDebug.prompt ? (
                      <pre className="debug-prompt-copy">{previewAsset.generationDebug.prompt}</pre>
                    ) : null}
                  </details>
                ) : null}
                {!(isKlingTemplateSelected && heroFrameUrl && showSetupPanel && !isGenerating) ? (
                  <div className="preview-actions">
                    {isKlingTemplateSelected && showSetupPanel ? (
                      <button
                        className="button button-primary"
                        onClick={handleGenerateHeroFrame}
                        disabled={!isGeneratedPanelUnlocked || isGeneratingHeroFrame || isGenerating}
                      >
                        {isGeneratingHeroFrame ? "Generating test frame..." : "Generate Test Frame"}
                      </button>
                    ) : (
                      <button
                        className="button button-primary"
                        onClick={showSetupPanel ? handleGenerateAsset : (() => {
                          if (!user) {
                            setShowAuthPopup(true);
                          } else {
                            // Create pipeline from the generated asset
                            const asset = previewAsset;
                            if (asset) {
                              const newPipeline: Pipeline = {
                                id: `pipeline-${Date.now()}`,
                                name: `${asset.title} for ${brandData?.brand.name || "Brand"}`,
                                postType: asset.title || "Graphic Post",
                                format: asset.format || "Image",
                                thumbnailUrl: asset.previewUrl || null,
                                socials: ["instagram"],
                                frequency: "Every day",
                                preferredTime: "09:00",
                                guidance: "",
                                referenceImages: [],
                                enabled: true,
                                lastGenerated: new Date().toLocaleDateString(),
                                lastPosted: null,
                                nextScheduled: null,
                                generatedExamples: asset.previewUrl ? [{ id: asset.id, url: asset.previewUrl, date: "Just now" }] : [],
                              };
                              setInitialPipeline(newPipeline);
                              setDashboardPipelines((prev) => [...prev, newPipeline]);
                            }
                            navigate("/dashboard");
                          }
                        })}
                        disabled={!isGeneratedPanelUnlocked || isGenerating}
                      >
                        {isGenerating ? (isVideoTemplateSelected ? "Rendering video..." : "Generating...") : showSetupPanel ? "Generate asset" : "Post online"}
                      </button>
                    )}
                    <button
                      className="button button-secondary"
                      onClick={handleDownloadAsset}
                      disabled={
                        !isGeneratedPanelUnlocked ||
                        !canDownloadSelectedGeneratedAsset
                      }
                    >
                      Download
                    </button>
                  </div>
                ) : null}
                {/* Output controls */}
                <div className="output-controls-section">
                {!showSetupPanel ? (
                  <>
                    <div className="history-list history-list-expanded">
                      {generatedAssets.map((item) => (
                        <div key={item.id} className={`history-row-wrap ${selectedGeneratedAssetId === item.id ? "active" : ""}`}>
                          <button
                            className={`history-row ${selectedGeneratedAssetId === item.id ? "active" : ""}`}
                            onClick={() => setSelectedGeneratedAssetId(item.id)}
                            disabled={!isHistoryPanelUnlocked}
                          >
                            <div
                              className="history-thumb"
                              style={{
                                backgroundImage: `url("${buildAssetPreviewDataUrl({
                                  asset: item,
                                  palette: extractedColors,
                                  brandName: brandData?.brand.name ?? "Marketing Stack",
                                  styleName: activeStyle?.name ?? "Minimal mint",
                                })}")`,
                              }}
                            />
                            <div>
                            <strong>{item.title}</strong>
                            <span>
                                {item.provider === "gemini"
                                  ? "Gemini output"
                                  : item.provider === "kling"
                                    ? "Loop video"
                                  : item.provider === "veo"
                                    ? "Veo MP4"
                                  : item.provider === "remotion-render"
                                    ? "Rendered MP4"
                                    : item.provider === "remotion-plan"
                                      ? "Motion Design brief"
                                      : item.meta}
                              </span>
                            </div>
                          </button>
                          <button
                            className="history-download-button"
                            type="button"
                            onClick={() => downloadAsset(item)}
                            disabled={item.format === "Video" ? !item.mediaUrl : !(item.previewUrl ?? true)}
                            aria-label={`Download ${item.title}`}
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="button button-secondary history-back-button"
                      type="button"
                      onClick={() => setShowSetupPanel(true)}
                    >
                      Go back
                    </button>
                  </>
                ) : null}
              </div>
            </div>}
            {showAssetDetails ? (
              <div className="asset-modal-backdrop" role="presentation" onClick={() => setShowAssetDetails(false)}>
                <div className="asset-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="panel-head">
                    <span className="meta">Brand references</span>
                    <button className="button button-secondary small" type="button" onClick={() => setShowAssetDetails(false)}>
                      Close
                    </button>
                  </div>
                  <h3>{brandData?.brand.name ?? "Brand"} references</h3>
                  <p className="asset-modal-copy">Internal references used to guide generation toward the right logo, colors, and visual language.</p>
                  <div className="panel-head compact">
                    <span className="meta">Extracted assets</span>
                  </div>
                  <div className="asset-signal-list modal-asset-signal-list">
                    {(extractedAssets.length > 0 ? extractedAssets : [{ id: "none", type: "pending", source: "Awaiting detection", url: "", confidence: 0 }])
                      .slice(0, 12)
                      .map((item) => (
                        <div key={item.id} className="asset-signal-chip asset-reference-chip">
                          {item.url ? <img src={buildRemoteAssetPreviewUrl(item.url)} alt={item.type} /> : <div className="asset-reference-placeholder">MS</div>}
                          <strong>{item.type.replaceAll("-", " ")}</strong>
                        </div>
                      ))}
                  </div>
                  <div className="panel-head compact">
                    <span className="meta">Extracted products</span>
                  </div>
                  <div className="asset-signal-list modal-asset-signal-list">
                    {(extractedProducts.length > 0 ? extractedProducts : [{ id: "none-products", type: "pending", source: "No products found yet", url: "", confidence: 0 }])
                      .slice(0, 12)
                      .map((item) => (
                        <div key={item.id} className="asset-signal-chip asset-reference-chip">
                          {item.url ? <img src={buildRemoteAssetPreviewUrl(item.url)} alt={item.type} /> : <div className="asset-reference-placeholder">MS</div>}
                          <strong>{item.type.replaceAll("-", " ")}</strong>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : null}
            {showPreviewModal && (previewAsset?.format === "Video" ? selectedAssetMediaUrl : selectedAssetPreviewUrl) ? (
              <div className="asset-modal-backdrop" role="presentation" onClick={() => setShowPreviewModal(false)}>
                <div className="preview-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <button className="preview-modal-close" type="button" onClick={() => setShowPreviewModal(false)}>✕</button>
                  <div className="preview-modal-content">
                    <div className="preview-modal-asset">
                      {previewAsset?.format === "Video" && selectedAssetMediaUrl ? (
                        <video src={selectedAssetMediaUrl} controls playsInline preload="metadata" poster={selectedAssetPreviewUrl} />
                      ) : (
                        <img src={selectedAssetPreviewUrl} alt={previewAsset?.title ?? "Generated asset"} />
                      )}
                    </div>
                    <div className="preview-modal-info">
                      {(customLogoUrl || primaryLogoPreviewUrl) && (
                        <div className="preview-modal-logo">
                          <img src={customLogoUrl || primaryLogoPreviewUrl} alt="Logo" />
                        </div>
                      )}
                      <strong className="preview-modal-brand">{brandData?.brand.name ?? "Brand"}</strong>
                      <p className="preview-modal-description">{(previewAsset as any)?.postDescription || previewAsset?.concept || "Post description will appear here after generation."}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            </div>
            {isDashboardLoading ? (
              <div className="dashboard-gate-backdrop">
                <div className="dashboard-gate-dialog glass-card">
                  <div className="dashboard-gate-avatar">
                    <img src="/botface.webp" alt="MS" />
                  </div>
                  <strong>Loading your brand...</strong>
                  <div className="dashboard-loading-bar">
                    <div className="dashboard-loading-fill" />
                  </div>
                </div>
              </div>
            ) : isDashboardGated ? (
              <div className="dashboard-gate-backdrop">
                <div className="dashboard-gate-dialog glass-card">
                  <div className="dashboard-gate-avatar">
                    <img src="/botface.webp" alt="MS" />
                  </div>

                  {/* Voice agent indicator */}
                  {voiceAgentStarted && (
                    <div className="voice-agent-indicator">
                      <div className={`voice-agent-dot ${voiceAgent.isSpeaking ? "voice-agent-dot--speaking" : ""}`} />
                      <span className="meta">{voiceAgent.isSpeaking ? "MS is speaking..." : "Listening..."}</span>
                    </div>
                  )}
                  {voiceAgentMessage && (
                    <p className="voice-agent-transcript">{voiceAgentMessage}</p>
                  )}
                  {!voiceAgentStarted && isDashboardGated && (
                    <button className="voice-agent-start-btn" onClick={startVoiceAgent}>
                      <span>🎙</span> Talk to MS
                    </button>
                  )}

                  {/* Step 0: URL input (initial state) */}
                  {onboardingStep === 0 && (
                    <>
                      <strong>Let's set up your brand</strong>
                      {assistantCopy.body ? <p>{assistantCopy.body}</p> : null}
                      <div className="assistant-input-row">
                        <input
                          className="url-input assistant-url-input"
                          type="url"
                          placeholder="https://yourbrand.com"
                          value={websiteUrl}
                          onChange={(event) => setWebsiteUrl(event.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && websiteUrl.trim() && !isDetecting) handleDetectBrand(); }}
                        />
                        <button className="button button-primary small" onClick={handleDetectBrand} disabled={isDetecting || !websiteUrl.trim()}>
                          {isDetecting ? "Detecting..." : "Detect"}
                        </button>
                      </div>
                      <button
                        className="button button-secondary"
                        style={{ width: "100%", marginTop: 8 }}
                        onClick={() => {
                          const blankBrand: BrandDetectionResponse = {
                            brand: {
                              name: "",
                              url: "",
                              category: "",
                              tone: "",
                              primaryColor: "#9cff8f",
                              summary: "",
                              productType: "saas" as ProductType,
                              languageLabel: assetLanguage || "English",
                              palette: ["#9cff8f", "#0f1f16", "#ffffff"],
                              logoReadiness: "none",
                              editableFont: "Inter",
                              logoCandidates: [],
                            },
                            styles: defaultStyles,
                            recommendedStyleId: "minimal-mint",
                            assistant: { headline: "Set up your brand from scratch.", body: "" },
                            assets: starterAssets,
                            extraction: {} as any,
                          };
                          setPendingBrandData(blankBrand);
                          setOnboardingStep(1);
                          if (voiceAgentStarted && voiceAgent.status === "connected") {
                            voiceAgent.sendContextualUpdate("User clicked Start from scratch. They want to set up their brand manually without a website URL. Help them fill in their brand name and language.");
                          }
                        }}
                      >
                        Start from scratch
                      </button>
                      {errorMessage ? <p className="assistant-warning">{errorMessage}</p> : null}
                      {/* Sample projects hidden during onboarding */}
                    </>
                  )}

                  {/* Step 1: Logo + Language */}
                  {onboardingStep === 1 && pendingBrandData && (
                    <div className="onboarding-step" key="step-1">
                      <div className="onboarding-step-indicator">Step 1 of 3</div>
                      <strong>Your brand identity</strong>
                      <p>We detected your logo and language. Does this look right?</p>
                      <div className="onboarding-row">
                        <div className="onboarding-logo-section">
                          <span className="onboarding-label">Logo</span>
                          <div className="onboarding-logo-preview">
                            {pendingBrandData.brand.logoCandidates?.[0]?.url ? (
                              <img src={pendingBrandData.brand.logoCandidates[0].url} alt="Detected logo" />
                            ) : (
                              <div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", color: "rgba(255,255,255,0.25)", fontSize: "0.7rem" }}>No logo</div>
                            )}
                          </div>
                          <label className="button button-secondary small" style={{ cursor: "pointer", marginTop: 6, fontSize: "0.68rem" }}>
                            Change
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const dataUrl = reader.result as string;
                                    setPendingBrandData((prev: any) => ({
                                      ...prev,
                                      brand: {
                                        ...prev.brand,
                                        logoCandidates: [{ url: dataUrl, type: "image", source: "custom-upload", confidence: 1 }, ...(prev.brand.logoCandidates || []).slice(1)],
                                      },
                                    }));
                                    setCustomLogoUrl(dataUrl);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                        <div className="onboarding-fields onboarding-fields--narrow">
                          <label>
                            <span className="onboarding-label">Brand name</span>
                            <input
                              className="url-input"
                              value={pendingBrandData.brand.name}
                              onChange={(e) => setPendingBrandData({ ...pendingBrandData, brand: { ...pendingBrandData.brand, name: e.target.value } })}
                            />
                          </label>
                          <label>
                            <span className="onboarding-label">Language</span>
                            <select
                              className="url-input"
                              value={assetLanguage}
                              onChange={(e) => setAssetLanguage(e.target.value)}
                            >
                              {["English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Arabic", "Japanese", "Korean", "Chinese", "Hindi", "Russian", "Turkish"].map((lang) => (
                                <option key={lang} value={lang}>{lang}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                      <div className="onboarding-actions">
                        <button className="button small" onClick={() => setOnboardingStep(0)} style={{ opacity: 0.6 }}>Back</button>
                        <button className="button button-primary small" onClick={() => setOnboardingStep(2)}>Next</button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Product + Snapshot */}
                  {onboardingStep === 2 && pendingBrandData && (
                    <div className="onboarding-step" key="step-2">
                      <div className="onboarding-step-indicator">Step 2 of 3</div>
                      <strong>About your product</strong>
                      <p>Here is what we understood about your brand.</p>
                      <div className="onboarding-fields" style={{ width: "100%" }}>
                        <label>
                          <span className="onboarding-label">Product type</span>
                          <select
                            className="url-input"
                            value={productTypeOptions.includes(pendingBrandData.brand.productType) ? pendingBrandData.brand.productType : "other"}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPendingBrandData({ ...pendingBrandData, brand: { ...pendingBrandData.brand, productType: val } });
                              setProductType(val as any);
                            }}
                          >
                            {productTypeOptions.map((pt) => (
                              <option key={pt} value={pt}>{pt}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="onboarding-label">Summary</span>
                          <textarea
                            className="url-input"
                            rows={3}
                            value={pendingBrandData.brand.summary || ""}
                            onChange={(e) => setPendingBrandData({ ...pendingBrandData, brand: { ...pendingBrandData.brand, summary: e.target.value } })}
                            style={{ resize: "vertical", fontFamily: "inherit" }}
                          />
                        </label>
                        <div className="onboarding-references">
                          <span className="onboarding-label">References (Products, Screenshots, Mascot...)</span>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, alignItems: "flex-start" }}>
                            {pendingBrandData.extraction?.screenshotUrl && (
                              <div className="onboarding-ref-card">
                                <div style={{ position: "relative" }}>
                                  <img src={pendingBrandData.extraction.screenshotUrl} alt="Website screenshot" style={{ width: 100, height: 72, objectFit: "cover", borderRadius: 8 }} />
                                  <button className="onboarding-ref-delete" onClick={() => setPendingBrandData((prev: any) => ({ ...prev, extraction: { ...prev.extraction, screenshotUrl: null } }))}>x</button>
                                </div>
                                <span className="onboarding-ref-type">Screenshot</span>
                              </div>
                            )}
                            {pendingBrandData.brand.extractedProducts?.map((p: any, i: number) => (
                              <div key={i} className="onboarding-ref-card">
                                <div style={{ position: "relative" }}>
                                  <img src={p.url} alt={p.source || `Reference ${i + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
                                  <button className="onboarding-ref-delete" onClick={() => setPendingBrandData((prev: any) => ({
                                    ...prev,
                                    brand: { ...prev.brand, extractedProducts: prev.brand.extractedProducts.filter((_: any, idx: number) => idx !== i) },
                                  }))}>x</button>
                                </div>
                                <span className="onboarding-ref-type">{p.type === "product-image" ? "Product" : p.source?.includes("logo") ? "Logo" : p.type || "Reference"}</span>
                              </div>
                            ))}
                            {(pendingBrandData.brand.extractedProducts?.length || 0) + (pendingBrandData.extraction?.screenshotUrl ? 1 : 0) < 3 && (
                              <label className="onboarding-ref-add">
                                <span>+</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        setPendingBrandData((prev: any) => ({
                                          ...prev,
                                          brand: {
                                            ...prev.brand,
                                            extractedProducts: [
                                              ...(prev.brand.extractedProducts || []),
                                              { url: reader.result, type: "product-image", source: "user-upload", confidence: 1 },
                                            ],
                                          },
                                        }));
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="onboarding-actions">
                        <button className="button small" onClick={() => setOnboardingStep(1)} style={{ opacity: 0.6 }}>Back</button>
                        <button className="button button-primary small" onClick={() => setOnboardingStep(3)}>Next</button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Colors */}
                  {onboardingStep === 3 && pendingBrandData && (
                    <div className="onboarding-step" key="step-3">
                      <div className="onboarding-step-indicator">Step 3 of 3</div>
                      <strong>Brand colors</strong>
                      <p>Your brand colors. You can always change these later in the dashboard.</p>
                      {/* Primary row: Primary, Background, Text */}
                      <div className="onboarding-colors-row">
                        {(["primary", "background", "text"] as const).map((key) => {
                          const labels: Record<string, string> = { primary: "Primary", background: "Background", text: "Text" };
                          return (
                            <label key={key} className="onboarding-color-editable">
                              <input
                                type="color"
                                value={brandColorConfig[key] || "#FFFFFF"}
                                onChange={(e) => setBrandColorConfig((c) => ({ ...c, [key]: e.target.value.toUpperCase() }))}
                                style={{ width: 36, height: 36, border: "none", borderRadius: 10, cursor: "pointer", background: "none", padding: 0 }}
                              />
                              <span>{labels[key]}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="onboarding-divider" />
                      <span className="onboarding-label" style={{ alignSelf: "flex-start" }}>Optional</span>
                      <div className="onboarding-colors-row">
                        {(["secondary", "buttonBg", "buttonText", "accentBg", "accentText"] as const).map((key) => {
                          const labels: Record<string, string> = { secondary: "Secondary", buttonBg: "Button", buttonText: "Button Text", accentBg: "Accent BG", accentText: "Accent Text" };
                          const val = brandColorConfig[key];
                          return (
                            <div key={key} className="onboarding-color-editable" style={{ position: "relative" }}>
                              <label>
                                <input
                                  type="color"
                                  value={val || "#888888"}
                                  onChange={(e) => setBrandColorConfig((c) => ({ ...c, [key]: e.target.value.toUpperCase() }))}
                                  style={{ width: 28, height: 28, border: "none", borderRadius: 8, cursor: "pointer", background: "none", padding: 0, opacity: val ? 1 : 0.3 }}
                                />
                                <span>{labels[key]}</span>
                              </label>
                              {val && (
                                <button
                                  className="onboarding-color-remove"
                                  onClick={() => setBrandColorConfig((c) => ({ ...c, [key]: "" }))}
                                  title="Remove color"
                                >×</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="onboarding-actions">
                        <button className="button small" onClick={() => setOnboardingStep(2)} style={{ opacity: 0.6 }}>Back</button>
                        <button className="button button-primary small" onClick={finalizeOnboarding}>Launch dashboard</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {isInDashboardMode && user && (
            <UserDashboard
              user={user}
              onLogout={async () => {
                await supabase.auth.signOut();
                setUser(null);
                navigate("/");
              }}
              onBackToCreator={() => navigate("/")}
              onTimezoneChange={(tz) => {
                setBrandData((prev: any) => prev ? { ...prev, timezone: tz } : prev);
              }}
              hasProSubscription={hasProSubscription}
              onShowPaywall={() => setShowPaywall(true)}
            />
          )}
        </section>
        {showLandingContent && <section className="section cta-section">
          <div className="cta-shell">
            <p className="section-kicker">Start with one link</p>
            <h3>Your marketing system can start in minutes.</h3>
            <p>Brand detection, style approval, content generation, and publishing workflows from one minimal interface.</p>
            <a className="button button-primary" href="#product">
              Get started
            </a>
          </div>
        </section>}
      </main>
      {showPaywall && (
        <div className="paywall-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPaywall(false); }}>
          <div className="paywall-card glass-card">
            <button className="paywall-close" onClick={() => setShowPaywall(false)}>&times;</button>
            <div className="paywall-badge">PRO</div>
            <h2>Unlock All Pipelines</h2>
            <p className="paywall-desc">Get full access to AI-powered content generation — images and videos — on autopilot across all your social platforms.</p>
            <div className="paywall-features">
              <div className="paywall-feature">Graphic Post &amp; Lifestyle Shot Pipelines</div>
              <div className="paywall-feature">Loop Video Generation</div>
              <div className="paywall-feature">Motion Design Videos</div>
              <div className="paywall-feature">Daily Video &amp; Image Pipelines</div>
              <div className="paywall-feature">Priority Support</div>
            </div>
            <div className="paywall-price">
              <span className="paywall-amount">$2,000</span>
              <span className="paywall-period">/month</span>
            </div>
            <button
              className="button button-primary paywall-cta"
              disabled={isCheckingOut}
              onClick={async () => {
                if (!user) return;
                setIsCheckingOut(true);
                try {
                  const res = await fetch(`${API_BASE}/api/subscription/checkout`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: user.id, email: user.email, plan: "pro" }),
                  });
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                  else setIsCheckingOut(false);
                } catch {
                  setIsCheckingOut(false);
                }
              }}
            >
              {isCheckingOut ? "Redirecting to checkout..." : "Subscribe Now"}
            </button>
            <p className="paywall-note">Cancel anytime. Billed monthly.</p>
          </div>
        </div>
      )}
      {showAuthPopup && (
        <AuthPopup
          onClose={() => setShowAuthPopup(false)}
          onAuthenticated={() => {
            setShowAuthPopup(false);
            navigate("/dashboard");
          }}
        />
      )}
    </div>
  );
}
