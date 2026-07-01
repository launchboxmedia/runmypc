// Carousel design-system style library. 5 named styles, each a complete design
// system (typography pairing + layout grid + signature hook technique).
//
// Colors are deliberately NOT baked into the descriptors — color comes from the
// customer (or is derived). The ONLY baked colors are `implied_tone`, the
// fallback palette used when job + profile + logo all yield no color. Locked
// 2026-06-22 with sign-off; each carries a rationale comment.

export type StyleId =
  | 'bold_personal'
  | 'clean_direct'
  | 'warm_handmade'
  | 'sharp_professional'
  | 'premium_editorial'

export type Palette = { primary: string; accent: string; background: string }

// Per-style typography sizing + spacing constraints.
// Replaces the universal hardcoded values in slideHtml.ts so each style's
// font pairing can breathe at its natural rhythm.
export type FontConstraints = {
  title_size: number            // px — base title size for body slides
  title_hero_size: string       // clamp() for .hero-text (cover + CTA)
  title_hero_line_height: number
  title_line_height: number
  title_tracking: string        // letter-spacing CSS value
  title_transform: string       // text-transform CSS value
  title_weight: number          // font-weight
  subhead_size: number          // px — also used for callout boxes
  subhead_line_height: number
  body_size: number             // px — bullets, checklist, anchor
  body_line_height: number
}

// Low-opacity geometric background SVG for body slides.
// Use the literal token GEO_COLOR anywhere a fill or stroke should use the
// resolved primary/fg color — slideHtml.ts replaces it before injection.
// All animations must attach to the GSAP timeline (no CSS @keyframes).
export type GeometricBg = {
  svg: string      // standalone inline SVG; position:absolute;inset:0;opacity:0
  opacity: number  // GSAP target opacity (0.02–0.05)
}

export type StyleDescriptor = {
  id: StyleId
  display_name: string
  description: string
  preview_image_url: string
  typography: {
    display_font: string // contract name; the font FILE is bundled in Phase B
    body_font: string
    treatment: string
  }
  font_constraints: FontConstraints
  layout_descriptor: string
  hook_technique: string
  // Default cover mode for this style; overridden by job/profile split_image_cover.
  default_split_cover: boolean
  geometric_bg: GeometricBg
  implied_tone: Palette
}

export const STYLE_LIBRARY: Record<StyleId, StyleDescriptor> = {
  bold_personal: {
    id: 'bold_personal',
    display_name: 'Bold & Personal',
    description: 'Huge type and a real person looking right at your reader.',
    preview_image_url: '/style-previews/bold_personal.png',
    typography: {
      display_font: 'Anton',
      body_font: 'Inter',
      treatment: 'Extreme-weight ultra-bold geometric sans display, all caps, massive tracking, tight leading, locked into a solid block. No body copy on the cover.',
    },
    font_constraints: {
      title_size: 88,
      title_hero_size: 'clamp(84px,10vw,148px)',
      title_hero_line_height: 0.88,
      title_line_height: 0.92,
      title_tracking: '0.04em',
      title_transform: 'uppercase',
      title_weight: 400,   // Anton has one weight; the heaviness is inherent
      subhead_size: 36,
      subhead_line_height: 1.3,
      body_size: 32,
      body_line_height: 1.4,
    },
    layout_descriptor: 'Top-center handle pill. Headline in the upper 45%. Large masked human/character cutout breaking the lower frame boundary in the bottom 55%. Directional swipe badge floating mid-right. Page dots at bottom center.',
    hook_technique: 'High-contrast typographic scale paired with a realistic human cutout executing a direct physical gesture (e.g. a stopping hand) aimed at the reader.',
    default_split_cover: false,  // full-bleed cutout person; split dilutes impact
    geometric_bg: {
      svg: '<svg id="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0" fill="GEO_COLOR"><rect x="-200" y="320" width="1600" height="88" transform="rotate(-14 540 675)"/><rect x="-200" y="620" width="1600" height="44" transform="rotate(-14 540 675)"/><rect x="-200" y="960" width="1600" height="88" transform="rotate(-14 540 675)"/></svg>',
      opacity: 0.03,
    },
    // near-black canvas, white type, one hot stop-sign accent
    implied_tone: { background: '#0B0B0F', primary: '#FFFFFF', accent: '#FF3B30' },
  },

  clean_direct: {
    id: 'clean_direct',
    display_name: 'Clean & Direct',
    description: 'Crisp, no-nonsense comparisons and one clear focal point.',
    preview_image_url: '/style-previews/clean_direct.png',
    typography: {
      display_font: 'Montserrat',
      body_font: 'Inter',
      treatment: 'Medium-weight geometric sans subheadline inside a thin outlined container; clean sentence-case body with heavy bolding on key phrases; or heavy display sans + light geometric body for single-asset variants.',
    },
    font_constraints: {
      title_size: 72,
      title_hero_size: 'clamp(68px,8.5vw,120px)',
      title_hero_line_height: 1.0,
      title_line_height: 1.1,
      title_tracking: '-0.01em',
      title_transform: 'none',
      title_weight: 800,
      subhead_size: 38,
      subhead_line_height: 1.45,
      body_size: 34,
      body_line_height: 1.5,
    },
    layout_descriptor: 'Top-center handle, pill-enclosed title, then either (a) two-column side-by-side comparison mockups with floating cross/check badges, or (b) a single centered asset dead-center with type framing it above/below and wide clean margins.',
    hook_technique: 'Side-by-side A/B comparison with explicit right/wrong iconography, OR a singular centered focal asset with directional pointer graphics driving attention to one point.',
    default_split_cover: false,
    geometric_bg: {
      svg: '<svg id="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0"><defs><pattern id="dots-p" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse"><circle cx="36" cy="36" r="3" fill="GEO_COLOR"/></pattern></defs><rect width="1080" height="1350" fill="url(#dots-p)"/></svg>',
      opacity: 0.04,
    },
    // bright canvas, ink text, single trustworthy blue
    implied_tone: { background: '#FFFFFF', primary: '#111827', accent: '#2563EB' },
  },

  warm_handmade: {
    id: 'warm_handmade',
    display_name: 'Warm & Handmade',
    description: 'A personal, hand-assembled collage feel over real photos.',
    preview_image_url: '/style-previews/warm_handmade.png',
    typography: {
      display_font: 'Fredoka',
      body_font: 'Kalam',
      treatment: 'Thick rounded organic sans for titles (soft, custom feel); delicate high-tracked serif or casual handwritten script for subtext and callouts.',
    },
    font_constraints: {
      title_size: 76,
      title_hero_size: 'clamp(72px,9vw,128px)',
      title_hero_line_height: 1.1,
      title_line_height: 1.2,
      title_tracking: '0.01em',
      title_transform: 'none',
      title_weight: 700,
      subhead_size: 40,
      subhead_line_height: 1.6,
      body_size: 36,
      body_line_height: 1.65,
    },
    layout_descriptor: 'Layered card-on-canvas structure over lifestyle photo backgrounds — torn-paper textures, dashed-border cards, angled phone mockups, push-pins anchoring elements to the canvas.',
    hook_technique: 'Skeuomorphic tactile elements (3D push-pins, torn paper, hand-drawn arrows/stars/sparkles) combined with custom vector outlines tracing objects in the photo to create a personal, physical-collage feel.',
    default_split_cover: true,  // split + solid bg suits warm personal narrative
    geometric_bg: {
      svg: '<svg id="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0" fill="GEO_COLOR"><circle cx="100" cy="180" r="200"/><circle cx="980" cy="420" r="260"/><circle cx="160" cy="950" r="180"/><circle cx="920" cy="1150" r="220"/><circle cx="540" cy="675" r="320"/></svg>',
      opacity: 0.03,
    },
    // cream/kraft canvas, warm brown, soft amber
    implied_tone: { background: '#F4ECDD', primary: '#4A3728', accent: '#E08A3C' },
  },

  sharp_professional: {
    id: 'sharp_professional',
    display_name: 'Sharp & Professional',
    description: 'Structured, educational, walkthrough-style slides.',
    preview_image_url: '/style-previews/sharp_professional.png',
    typography: {
      display_font: 'Archivo',
      body_font: 'Inter',
      treatment: 'Extra-bold hyper-compressed ultra-tall sans display caps with tight leading; clean mid-weight geometric sans for body/bullets; occasional handwritten script for conversational subheadlines only.',
    },
    font_constraints: {
      title_size: 66,
      title_hero_size: 'clamp(62px,8vw,108px)',
      title_hero_line_height: 0.92,
      title_line_height: 1.0,
      title_tracking: '-0.03em',
      title_transform: 'uppercase',
      title_weight: 900,
      subhead_size: 34,
      subhead_line_height: 1.4,
      body_size: 30,
      body_line_height: 1.45,
    },
    layout_descriptor: 'Rigid split horizontal grid (upper/lower hemispheres divided by a thin rule), solid square page-number block in a corner, minimalist vector utility icons, left-aligned bullets — OR centered dashboard/software screenshots with heavy textured airbrush framing and hand-drawn pointer arrows.',
    hook_technique: 'Structural rigidity and micro-enclosures (boxed page numbers, rule lines) signaling organized educational content, OR real software UI screenshots framed with grunge/airbrush borders and faux click-pointer icons mimicking an active walkthrough.',
    default_split_cover: false,
    geometric_bg: {
      svg: '<svg id="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0"><defs><pattern id="grid-p" x="0" y="0" width="108" height="135" patternUnits="userSpaceOnUse"><path d="M 108 0 L 0 0 0 135" fill="none" stroke="GEO_COLOR" stroke-width="0.75"/></pattern></defs><rect width="1080" height="1350" fill="url(#grid-p)"/></svg>',
      opacity: 0.04,
    },
    // cool slate canvas, crisp off-white, sharp cyan
    implied_tone: { background: '#0F172A', primary: '#F8FAFC', accent: '#38BDF8' },
  },

  premium_editorial: {
    id: 'premium_editorial',
    display_name: 'Premium & Editorial',
    description: 'Magazine-grade, cinematic, or native-feed camouflage.',
    preview_image_url: '/style-previews/premium_editorial.png',
    typography: {
      display_font: 'Playfair Display',
      body_font: 'Inter',
      treatment: 'Clean lowercase sans or ultra-bold high-contrast serif display headlines paired with a fluid elegant italic serif for accent words; geometric sans body with selective bolding; thin step-indicator rules at top margins where multi-step.',
    },
    font_constraints: {
      title_size: 80,
      title_hero_size: 'clamp(76px,9.5vw,136px)',
      title_hero_line_height: 1.0,
      title_line_height: 1.08,
      title_tracking: '0.04em',
      title_transform: 'none',
      title_weight: 700,
      subhead_size: 38,
      subhead_line_height: 1.5,
      body_size: 34,
      body_line_height: 1.55,
    },
    layout_descriptor: 'Open, generous-whitespace grid over full-bleed studio/lifestyle photography or moody atmospheric backgrounds; centered surreal 3D elements or photographic cutouts; clean white rounded cards for comparisons; optionally native-app UI camouflage (context menus, notification pills, profile bars) replicated full-bleed.',
    hook_technique: 'Cinematic/surreal photographic concepts OR complete native-interface camouflage (the slide looks like a real social post, not a deck) — both aimed at premium, editorial-magazine perception.',
    default_split_cover: false,
    geometric_bg: {
      svg: '<svg id="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0" fill="GEO_COLOR"><polygon points="540,60 572,92 540,124 508,92"/><polygon points="188,380 220,412 188,444 156,412"/><polygon points="892,268 924,300 892,332 860,300"/><polygon points="148,830 180,862 148,894 116,862"/><polygon points="932,980 964,1012 932,1044 900,1012"/><polygon points="540,1240 572,1272 540,1304 508,1272"/><line x1="72" y1="675" x2="1008" y2="675" stroke="GEO_COLOR" stroke-width="0.75" fill="none"/></svg>',
      opacity: 0.025,
    },
    // off-white editorial canvas, near-black, muted bronze jewel
    implied_tone: { background: '#F7F5F1', primary: '#141414', accent: '#7A5C3E' },
  },
}

export const STYLE_LIST: StyleDescriptor[] = [
  STYLE_LIBRARY.bold_personal,
  STYLE_LIBRARY.clean_direct,
  STYLE_LIBRARY.warm_handmade,
  STYLE_LIBRARY.sharp_professional,
  STYLE_LIBRARY.premium_editorial,
]
