import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic

function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

export async function resolveBookSetup(params: {
  topic: string
  userPreferences: {
    persona?: string | null
    palette?: string | null
    tone?: string | null
    reader_level?: string | null
  }
}): Promise<{
  title: string
  subtitle: string
  persona: string
  visual_style: string
  vibe: string
  writing_tone: string
  reader_level: string
  palette: string
  cover_direction: string
  target_audience: string
  offer_type: string
  cta_intent: string
  niche: string
  offer_description: string
  outline: string
}> {
  const { topic, userPreferences } = params

  const client = getClient()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an expert ebook strategist. Given this topic determine all metadata needed to create a high-converting ebook.

Topic: ${topic}

User preferences (use these if set, otherwise decide autonomously):
- Persona: ${userPreferences.persona || 'decide autonomously'}
- Palette: ${userPreferences.palette || 'decide autonomously'}
- Tone: ${userPreferences.tone || 'decide autonomously'}
- Reader level: ${userPreferences.reader_level || 'decide autonomously'}

Valid personas: creator, publisher, business, coach, author
Valid palettes: teal-cream, navy-gold, burgundy-sand, slate-copper, forest-amber, charcoal-rose
Valid visual_styles: photorealistic, cinematic, illustrated, watercolor, minimalist, vintage
Valid vibes: professional, warm, energetic, calm, authoritative
Valid writing_tones: conversational, authoritative, inspirational, educational, practical
Valid reader_levels: beginner, intermediate, advanced
Valid cover_directions: bold_operator, clean_corporate, editorial_modern, cinematic_abstract, retro_illustrated, studio_product
Valid offer_types: lead_magnet, paid_product, course_companion, resource_guide
Valid cta_intents: email_capture, purchase, consultation, community

Respond ONLY with valid JSON no markdown. Use \\n for newlines in the outline field:
{
  "title": "compelling ebook title",
  "subtitle": "supporting subtitle",
  "persona": "one of the valid personas",
  "visual_style": "one of the valid visual styles",
  "vibe": "one of the valid vibes",
  "writing_tone": "one of the valid tones",
  "reader_level": "one of the valid reader levels",
  "palette": "one of the valid palettes",
  "cover_direction": "one of the valid cover directions",
  "target_audience": "specific description of target reader",
  "offer_type": "one of the valid offer types",
  "cta_intent": "one of the valid cta intents",
  "niche": "specific niche category",
  "offer_description": "what transformation this book delivers",
  "outline": "10 chapter titles separated by \\n each with a one-sentence brief after a colon"
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}
