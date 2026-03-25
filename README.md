# Marketing Stack

**An AI Marketing Operating System powered by ElevenLabs Conversational AI and Firecrawl.**

Paste any website URL → AI detects the entire brand system → a voice assistant guides you through setup and manages your marketing dashboard entirely by voice.

🔗 **Live Demo**: [marketingstack.app](https://marketingstack.app)

---

## The Problem

Setting up a marketing stack for a brand is tedious. You need to manually extract brand colors, find logos, write descriptions, configure platforms, and set up content schedules. Most small businesses and creators skip this entirely because it's too much work.

## Our Solution

Marketing Stack turns a single URL into a fully configured marketing operating system — and an AI voice assistant handles the entire process conversationally.

---

## How We Use Firecrawl

Firecrawl is the backbone of our brand detection system. When a user pastes a URL, here's what happens:

### 1. Website Scraping
We call Firecrawl's `/v1/scrape` endpoint with:
```javascript
formats: ["html", "screenshot@fullPage"]
actions: [{ type: "screenshot", fullPage: true }]
```
Firecrawl returns the full HTML, a high-res screenshot, metadata (title, description, OG tags), structured branding data (colors, fonts, components), and all images found on the page.

### 2. Brand Color Extraction
From Firecrawl's branding object, we extract:
- **CSS colors** from `branding.colors` (primary, accent, background, text, link)
- **Component colors** from `branding.components` (button backgrounds, text colors, border colors)
- **Fallback colors** from CSS stylesheets parsed out of the HTML
- These go through our color pipeline: deduplication → luminance ranking → neutral detection → palette assembly

### 3. Logo Detection
We rank logo candidates from multiple Firecrawl sources:
- `branding.logos[]` — Firecrawl's detected logos (highest priority)
- Favicon links from HTML (`<link rel="icon">`, `<link rel="apple-touch-icon">`)
- SVG elements in the HTML with logo-related class/ID names
- Open Graph images as fallback

### 4. Font Extraction
From `branding.typography`, we extract font families and map them to the brand's visual identity.

### 5. Product Image Filtering
Firecrawl returns all images from the page. We filter aggressively to keep only actual product photos:
- **Skip**: hero banners, promotional images, UI screenshots, blog thumbnails, social icons, backgrounds, stock photos
- **Keep**: product shots, packshots, devices, clothing, food, equipment — anything with commerce signals in the URL or alt text

### 6. AI-Powered Analysis
After Firecrawl extracts the raw data, we send the page content to Gemini AI to:
- Classify the business into one of **77 product categories** (e.g., Nike → "sports / fitness brand", not "ecommerce brand")
- Generate a factual 2-3 sentence business summary
- The prompt includes disambiguation rules so the AI picks the most specific category, not a generic one

### The Result
From a single URL, Firecrawl + our pipeline produces: brand name, logo, color palette (up to 8 roles), font family, product type, business summary, website screenshot, and filtered product reference images. All in ~15 seconds.

**See**: `server.js` → `runFirecrawlExtractionPipeline()` for the complete pipeline.

---

## How We Use ElevenLabs Conversational AI

ElevenLabs powers our voice assistant "MS" (em-es), which controls the entire application through natural conversation.

### Architecture

We use the `useConversation` hook from `@elevenlabs/react` with:
- **WebSocket connection** for real-time audio
- **TTS speed override** at 1.15x for snappy responses
- **Dynamic prompt overrides** — different system prompts for onboarding vs dashboard mode
- **Automatic mode transition** — onboarding session ends → 800ms pause → dashboard session starts with new prompt

### 15 Client Tools

The voice agent has **15 client tools** that directly control the React UI. When the agent decides to use a tool, it executes a JavaScript function that modifies application state:

#### Onboarding Tools (Brand Setup)
| Tool | What it does |
|------|-------------|
| `setWebsiteUrl` | Fills in the URL input field |
| `detectBrand` | Clicks the Detect button, triggers Firecrawl pipeline |
| `goToStep` | Navigates between onboarding steps (0-3), forward or back |
| `setBrandName` | Edits the brand name field |
| `selectProductType` | Sets product category from 77 options |
| `selectLanguage` | Sets content language (14 languages) |
| `setSummary` | Writes the brand description |
| `setBrandColor` | Changes any of 8 color roles (primary, secondary, background, text, button, buttonText, accentBG, accentText) |
| `removeBrandColor` | Removes optional colors |
| `finishOnboarding` | Launches the dashboard |

#### Dashboard Tools (Content Management)
| Tool | What it does |
|------|-------------|
| `createPipeline` | Creates a new content pipeline with name, type, platforms |
| `selectPipeline` | Opens a pipeline by name (fuzzy matching) |
| `updatePipeline` | Changes any field on a pipeline |
| `deletePipeline` | Removes a pipeline |
| `enablePipeline` / `disablePipeline` | Activates or pauses automation |
| `getPipelineStatus` | Returns a summary of all pipelines |
| `getAnalytics` | Returns followers, reach, likes, daily impressions |
| `getCalendarSummary` | Returns upcoming and recent posts |
| `getConnectedAccounts` | Checks which social platforms are linked |
| `scrollToSection` | Navigates the user to any dashboard section |
| `openTestModal` / `closeTestModal` | Controls the test pipeline popup |
| `setAutoPost` | Toggles auto-post in test modal |
| `triggerTestGenerate` | Starts a test asset generation |

### Contextual Updates

We use `sendContextualUpdate()` to keep the agent informed about what's happening in the UI without interrupting the conversation:

```typescript
// When brand detection completes
voiceAgent.sendContextualUpdate(
  `Brand detected successfully! Brand name: "${data.brand.name}".
   Product type: "${data.brand.productType}".
   The user is now on Step 1 reviewing their brand identity.`
);

// When user moves to color step
voiceAgent.sendContextualUpdate(
  `STEP 3 ACTIVE. Current colors: Primary=#9CFF8F, Background=#04110D...
   On ANY positive response, call finishOnboarding IMMEDIATELY.`
);

// When pipelines change
voiceAgent.sendContextualUpdate(
  `Pipelines: "Daily Instagram" (active, Graphic Post, Every day),
   "Weekly Video" (paused, Motion Design Video, Weekly)`
);
```

### Cross-Component Communication

The voice agent lives in `App.tsx` but needs to control components like `PipelinePanel` and `UserDashboard`. We use custom DOM events:

```typescript
// Agent creates a pipeline → shows the form → selects the result
window.dispatchEvent(new CustomEvent("botface-show-new-form"));
window.dispatchEvent(new CustomEvent("botface-select-pipeline", { detail: { id } }));
window.dispatchEvent(new CustomEvent("botface-scroll-to", { detail: { section: "analytics" } }));
```

Components register event listeners and react accordingly, keeping the architecture decoupled.

### Stale Closure Prevention

Since `useConversation` captures tool callbacks at initialization, we use refs to ensure tools always access current React state:

```typescript
const handleDetectBrandRef = useRef<() => void>(() => {});
const finalizeOnboardingRef = useRef<() => void>(() => {});
const websiteUrlRef = useRef(websiteUrl);

// Keep refs in sync
handleDetectBrandRef.current = () => handleDetectBrand();
finalizeOnboardingRef.current = () => finalizeOnboarding();
websiteUrlRef.current = websiteUrl;
```

This prevents the common React + real-time SDK bug where async callbacks read stale state.

### Prompt Engineering

Both prompts enforce strict behavior:
```
SPEAKING RULES (CRITICAL):
- Maximum 2 SHORT sentences per response. Never more.
- Each sentence must be under 15 words.
- Never repeat what the user said.
- ALWAYS say a short sentence BEFORE calling any tool.
```

**See**: `src/App.tsx` lines 1544-1860 for the complete ElevenLabs integration.

---

## Features

### Voice-Guided Onboarding
- User signs in → MS greets them → guides through 4-step brand setup
- MS can detect brands, fill forms, navigate steps, and launch the dashboard
- Text transcript shown below the avatar in real-time

### Full Dashboard Voice Control
- Create, edit, enable, disable, delete pipelines by voice
- Check analytics: "How many views did we get yesterday?"
- Navigate: "Show me the calendar" → scrolls to calendar section
- Test pipelines: "Test the Instagram pipeline" → opens modal, generates preview

### Brand Detection
- Paste any URL → Firecrawl extracts everything in ~15 seconds
- 77 product categories with AI disambiguation
- Color palette with 8 roles, logo detection, font extraction
- Works even on JS-heavy sites (falls back to metadata + AI knowledge)

### Pipeline System
- 4 content types: Graphic Post, Lifestyle Shot, Loop Video, Motion Design Video
- 6 platforms: Instagram, X, Facebook, LinkedIn, TikTok, Threads
- Automated scheduling with configurable frequency
- Per-pipeline test modal with preview

---

## Tech Stack

| Layer | Technology | How we use it |
|-------|-----------|---------------|
| **Voice AI** | [ElevenLabs](https://elevenlabs.io) | `useConversation` hook, 15 client tools, contextual updates, mode switching |
| **Web Scraping** | [Firecrawl](https://firecrawl.dev) | Full-page scraping with screenshots, branding extraction, image collection |
| **AI Analysis** | Google Gemini | Product classification, brand summarization, content generation |
| **Frontend** | React 19 + TypeScript + Vite | Single-page app with voice-controlled components |
| **Styling** | TailwindCSS | Dark theme with green accent, glass-card design system |
| **Auth & DB** | Supabase | PostgreSQL, Google OAuth, row-level security |
| **Payments** | Stripe | Subscription management for Pro plan |

---

## Setup

```bash
git clone https://github.com/nosselil/marketing-stack-hackathon.git
cd marketing-stack-hackathon
npm install
cp .env.example .env
# Add your API keys to .env
```

### ElevenLabs Agent Setup

1. Create an agent at [elevenlabs.io/app/agents](https://elevenlabs.io/app/agents)
2. Add the client tools listed above (all type: Client)
3. Upload the knowledge base document with product types and FAQ
4. Set the system prompt (see `src/App.tsx` for onboarding + dashboard prompts)
5. Enable overrides for: prompt, first_message, speed
6. Copy the Agent ID → replace `YOUR_ELEVENLABS_AGENT_ID` in `src/App.tsx`

### Run

```bash
npm run dev          # Frontend on :5173
npm run dev:server   # Backend on :3001
```

---

## Project Structure

```
├── src/
│   ├── App.tsx              # Voice agent (lines 1544-1860), onboarding, dashboard
│   ├── PipelinePanel.tsx    # Pipeline management + voice bar UI
│   ├── UserDashboard.tsx    # Calendar, analytics, voice event listeners
│   ├── AuthPopup.tsx        # Google OAuth + email auth
│   ├── db.ts                # Supabase database helpers
│   ├── socialIcons.ts       # Platform icons + colors
│   └── *.css                # Dark theme styles
├── server.js                # Firecrawl pipeline, brand detection, social APIs
├── supabase-schema.sql      # Database schema
└── .env.example             # Environment variables
```

## License

MIT
