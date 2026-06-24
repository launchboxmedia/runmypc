// Post-render visual QA. Sends a final rendered still to a vision-capable model
// and asks a constrained legibility/CTA question. This is a QUALITY gate, not a
// security gate: on any QA error it fails OPEN (status PASS, reason notes the
// skip) so an already-rendered carousel is never blocked by a QA hiccup. A FAIL
// verdict is recorded (caller persists it) but does not delete delivered assets.
import OpenAI from 'openai'

const QA_MODEL = 'gpt-5.4-mini' // vision-capable; escalate to gpt-5.5 if needed
const QA_FALLBACK_MODEL = 'gpt-5.5'

export const VISION_QA_SYSTEM = [
  'You are an automated visual QA agent. Analyze this final social media graphic.',
  '1. Is the primary text completely legible against the background?',
  '2. Is the CTA keyword visible?',
  "Respond exactly with a JSON object containing { \"status\": \"PASS\" | \"FAIL\", \"reason\": string }.",
].join(' ')

export type VisionVerdict = { status: 'PASS' | 'FAIL'; reason: string }
export type VisionImage = Buffer | string // Buffer | data-URI | http(s) URL

// Inject for testing; default talks to OpenAI vision.
export type VisionDeps = { analyze: (imageUrl: string, system: string) => Promise<string> }

function toImageUrl(image: VisionImage): string {
  if (typeof image === 'string') return image // data-URI or http(s) URL
  return `data:image/png;base64,${image.toString('base64')}`
}

// Parse the model's JSON. Anything unparseable fails OPEN.
export function parseVerdict(raw: string): VisionVerdict {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : raw) as { status?: unknown; reason?: unknown }
    const status = parsed.status === 'FAIL' ? 'FAIL' : 'PASS'
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'no reason given'
    return { status, reason }
  } catch {
    return { status: 'PASS', reason: 'qa-skipped: unparseable QA response' }
  }
}

let _openai: OpenAI
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

async function analyzeWith(model: string, imageUrl: string, system: string): Promise<string> {
  const res = await openai().chat.completions.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    // gpt-5.x reject max_tokens; max_completion_tokens is accepted by 5.x AND gpt-4o.
    max_completion_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: [
          { type: 'text', text: 'QA this final graphic and return the JSON verdict.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ] as any,
      },
    ],
  })
  return res.choices[0]?.message.content ?? ''
}

const defaultDeps: VisionDeps = {
  async analyze(imageUrl, system) {
    try {
      return await analyzeWith(QA_MODEL, imageUrl, system)
    } catch (e) {
      console.warn('[visionQA] primary model failed, escalating:', e instanceof Error ? e.message : e)
      return await analyzeWith(QA_FALLBACK_MODEL, imageUrl, system)
    }
  },
}

export async function runVisionQA(image: VisionImage, depsOverride?: Partial<VisionDeps>): Promise<VisionVerdict> {
  const deps = { ...defaultDeps, ...depsOverride }
  try {
    const raw = await deps.analyze(toImageUrl(image), VISION_QA_SYSTEM)
    return parseVerdict(raw)
  } catch (e) {
    console.warn('[visionQA] analysis failed, failing open:', e instanceof Error ? e.message : e)
    return { status: 'PASS', reason: `qa-skipped: ${e instanceof Error ? e.message : 'analysis error'}` }
  }
}
