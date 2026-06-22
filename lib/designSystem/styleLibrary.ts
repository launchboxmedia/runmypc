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
  layout_descriptor: string
  hook_technique: string
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
    layout_descriptor: 'Top-center handle pill. Headline in the upper 45%. Large masked human/character cutout breaking the lower frame boundary in the bottom 55%. Directional swipe badge floating mid-right. Page dots at bottom center.',
    hook_technique: 'High-contrast typographic scale paired with a realistic human cutout executing a direct physical gesture (e.g. a stopping hand) aimed at the reader.',
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
    layout_descriptor: 'Top-center handle, pill-enclosed title, then either (a) two-column side-by-side comparison mockups with floating cross/check badges, or (b) a single centered asset dead-center with type framing it above/below and wide clean margins.',
    hook_technique: 'Side-by-side A/B comparison with explicit right/wrong iconography, OR a singular centered focal asset with directional pointer graphics driving attention to one point.',
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
    layout_descriptor: 'Layered card-on-canvas structure over lifestyle photo backgrounds — torn-paper textures, dashed-border cards, angled phone mockups, push-pins anchoring elements to the canvas.',
    hook_technique: 'Skeuomorphic tactile elements (3D push-pins, torn paper, hand-drawn arrows/stars/sparkles) combined with custom vector outlines tracing objects in the photo to create a personal, physical-collage feel.',
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
    layout_descriptor: 'Rigid split horizontal grid (upper/lower hemispheres divided by a thin rule), solid square page-number block in a corner, minimalist vector utility icons, left-aligned bullets — OR centered dashboard/software screenshots with heavy textured airbrush framing and hand-drawn pointer arrows.',
    hook_technique: 'Structural rigidity and micro-enclosures (boxed page numbers, rule lines) signaling organized educational content, OR real software UI screenshots framed with grunge/airbrush borders and faux click-pointer icons mimicking an active walkthrough.',
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
    layout_descriptor: 'Open, generous-whitespace grid over full-bleed studio/lifestyle photography or moody atmospheric backgrounds; centered surreal 3D elements or photographic cutouts; clean white rounded cards for comparisons; optionally native-app UI camouflage (context menus, notification pills, profile bars) replicated full-bleed.',
    hook_technique: 'Cinematic/surreal photographic concepts OR complete native-interface camouflage (the slide looks like a real social post, not a deck) — both aimed at premium, editorial-magazine perception.',
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
