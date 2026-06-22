// Generate one carousel slide as a complete standalone HTML document via Haiku
// (mirrors the agent-composition pattern in lib/hyperframes.ts). The render
// service owns typography — HTML may only use the bundled font families and must
// embed nothing external. The cover visual (if any) is injected as a data-URI
// via the literal token __COVER_VISUAL__ (kept out of the prompt for size).
import Anthropic from '@anthropic-ai/sdk'
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { SlidePlan } from './types'

const HTML_MODEL = 'claude-haiku-4-5-20251001'
const COVER_TOKEN = '__COVER_VISUAL__'

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type SlideHtmlDeps = { generate: (prompt: string) => Promise<string> }

const defaultDeps: SlideHtmlDeps = {
  async generate(prompt: string) {
    const res = await anthropic().messages.create({
      model: HTML_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    return res.content[0]?.type === 'text' ? res.content[0].text : ''
  },
}

// Safety net: even with the prompt rule, Haiku occasionally emits a literal
// "NO GLYPH" placeholder marker where it wanted an icon it can't load. Remove
// any element whose visible content is that placeholder, then scrub stray text.
export function stripGlyphPlaceholders(html: string): string {
  // Tolerate inter-letter whitespace ("N O  G L Y P H") and hyphen/underscore
  // separators — Haiku sometimes letter-spaces the placeholder or puts it in an
  // SVG <text>, which a tight literal match would miss.
  const placeholder = /n\s*o[\s\-_]*g\s*l\s*y\s*p\s*h/gi
  return html
    // drop a wrapping tag whose entire text content is the placeholder
    .replace(new RegExp(`<([a-z]+)([^>]*)>\\s*${placeholder.source}\\s*<\\/\\1>`, 'gi'), '')
    // scrub any leftover occurrences (incl. inside <text>/<style>/attributes)
    .replace(placeholder, '')
}

// Deterministically stamp a brand logo into the top-left corner of a slide. Not
// Haiku-dependent: injected after generation so placement is consistent every
// time. position:fixed is relative to the render viewport (the slide). Returns
// the html unchanged when there is no logo.
export function stampLogo(html: string, logoDataUri: string | null | undefined): string {
  if (!logoDataUri) return html
  const mark = `<img src="${logoDataUri}" alt="" style="position:fixed;bottom:44px;left:44px;height:56px;width:auto;max-width:200px;object-fit:contain;z-index:2147483647;pointer-events:none;" />`
  const idx = html.toLowerCase().lastIndexOf('</body>')
  if (idx === -1) return html + mark
  return html.slice(0, idx) + mark + html.slice(idx)
}

// Pull the HTML document out of any markdown fences / stray prose Haiku adds.
export function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const docMatch = body.match(/<!doctype[\s\S]*$/i) || body.match(/<html[\s\S]*<\/html>/i)
  return (docMatch ? docMatch[0] : body).trim()
}

function buildPrompt(input: {
  resolved: ResolvedDesignSystem
  slide: SlidePlan
  handle?: string
  hasCoverVisual: boolean
  hasLogo: boolean
  retryNote?: string
}): string {
  const { resolved, slide, handle, hasCoverVisual, hasLogo, retryNote } = input
  const style = STYLE_LIBRARY[resolved.style_id]
  const role = slide.isCover ? 'COVER / HOOK (slide 1)' : slide.beat === 'cta' ? 'final CTA slide' : 'value slide'

  const coverImageInstruction = slide.isCover && hasCoverVisual
    ? `- A background visual is provided. Include exactly one <img id="cover-visual" src="${COVER_TOKEN}"> and position it per the layout. ${
        resolved.split_image_cover
          ? `SPLIT LAYOUT: the image fills one half of the frame (e.g. bottom or right); a solid ${resolved.background} block fills the other half and holds the headline.`
          : `The image is the backdrop; place the headline over a legible zone (add a scrim/overlay if needed for contrast).`
      } Do NOT put a data-URI in the src — use the literal ${COVER_TOKEN} token.`
    : slide.isCover
      ? `- No background image. Build a strong type-driven cover on the ${resolved.background} background.`
      : `- No images. Type and color only.`

  return [
    `Output ONLY a complete standalone HTML document for ONE Instagram carousel slide. No commentary, no markdown fences.`,
    ``,
    `SLIDE ROLE: ${role}`,
    `SLIDE TEXT (use this copy, you may lightly format but do not invent new claims): ${JSON.stringify(slide.text)}`,
    handle ? `Brand handle (show as @${handle} on the cover only): ${handle}` : '',
    ``,
    `HARD CONSTRAINTS:`,
    `- The root element MUST be exactly 1080px wide and 1350px tall, position relative, overflow hidden.`,
    `- Background color: ${resolved.background}. Primary/text color: ${resolved.primary_color}. Accent color: ${resolved.accent}.`,
    `- Fonts: use ONLY these font-family names (already bundled by the renderer): "${style.typography.display_font}" for display/headline and "${style.typography.body_font}" for body. NO @import, NO Google Fonts <link>, NO external CSS/JS, NO web requests of any kind.`,
    `- Embed nothing external except the provided cover image token. No icon fonts, no remote images, no emoji-as-icon.`,
    `- Icons/graphics: draw them with pure CSS (divs, borders, border-radius, gradients) or INLINE <svg> shapes only. NEVER output placeholder text, icon names, "icon", "image", or the literal words "NO GLYPH" / "no glyph" anywhere. If you cannot draw an element cleanly, omit it entirely.`,
    `- All text must fit inside a ≥64px safe margin and be fully visible — never clipped or overflowing. Use large, legible type.`,
    ``,
    `STYLE CHARACTER — ${style.display_name}:`,
    `- Typography treatment: ${style.typography.treatment}`,
    `- Layout: ${style.layout_descriptor}`,
    `- Hook device: ${style.hook_technique}`,
    coverImageInstruction,
    slide.beat === 'cta' ? `- This is the single closing call-to-action. Make the action obvious and bold.` : '',
    hasLogo ? `- A brand logo will be placed in the BOTTOM-LEFT corner (about 210x90px). Keep that corner clear — no text, badges, page dots, or key elements there.` : '',
    retryNote ? `\nPREVIOUS RENDER FAILED QA: ${retryNote}\nFix specifically: enlarge/relayout so ALL text is fully visible, legible, and high-contrast against the background.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generateSlideHtml(
  input: {
    resolved: ResolvedDesignSystem
    slide: SlidePlan
    handle?: string
    coverVisualDataUri?: string | null
    logoDataUri?: string | null
    retryNote?: string
  },
  deps: SlideHtmlDeps = defaultDeps
): Promise<string> {
  const hasCoverVisual = Boolean(input.slide.isCover && input.coverVisualDataUri)
  const hasLogo = Boolean(input.logoDataUri)
  const prompt = buildPrompt({
    resolved: input.resolved,
    slide: input.slide,
    handle: input.handle,
    hasCoverVisual,
    hasLogo,
    retryNote: input.retryNote,
  })

  const raw = await deps.generate(prompt)
  let html = stripGlyphPlaceholders(extractHtml(raw))

  if (hasCoverVisual && input.coverVisualDataUri) {
    html = html.split(COVER_TOKEN).join(input.coverVisualDataUri)
  } else {
    // No visual: remove any stray cover-image tag and leftover token.
    html = html.replace(/<img[^>]*id=["']cover-visual["'][^>]*>/gi, '').split(COVER_TOKEN).join('')
  }

  // Deterministic brand-mark stamp (top-left), independent of Haiku.
  html = stampLogo(html, input.logoDataUri)

  return html
}
