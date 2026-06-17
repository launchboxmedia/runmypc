import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface FilteredContent {
  content: any
  excluded: boolean
  exclusion_reason?: string
  flags?: string[]
}

const PSEUDO_LEGAL_PATTERNS = [
  'sovereign citizen',
  'legal loophole',
  'they don\'t want you to know',
  'secret law',
  'constitutional right to',
  'commerce clause',
  'strawman account'
]

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // phone
  /\b\d{3}-\d{2}-\d{4}\b/g // SSN
]

function stripPII(text: string): string {
  let cleaned = text
  for (const pattern of PII_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]')
  }
  return cleaned
}

function containsPseudoLegal(text: string): boolean {
  const lower = text.toLowerCase()
  return PSEUDO_LEGAL_PATTERNS.some(pattern => lower.includes(pattern))
}

export async function filterSocialContent(
  content: any[],
  platform: 'instagram' | 'tiktok' | 'linkedin'
): Promise<FilteredContent[]> {
  const results: FilteredContent[] = []

  for (const item of content) {
    const text = platform === 'instagram'
      ? (item.caption || item.text || '')
      : platform === 'tiktok'
      ? (item.text || item.desc || '')
      : (item.text || item.content || '')

    // Hard exclusions
    if (containsPseudoLegal(text)) {
      results.push({
        content: item,
        excluded: true,
        exclusion_reason: 'pseudo-legal language'
      })
      continue
    }

    // Strip PII
    const cleanedItem = { ...item }
    if (platform === 'instagram') {
      cleanedItem.caption = stripPII(cleanedItem.caption || '')
    } else if (platform === 'tiktok') {
      cleanedItem.text = stripPII(cleanedItem.text || '')
    } else {
      cleanedItem.text = stripPII(cleanedItem.text || '')
    }

    // Check for loophole/hack framing via Claude
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Does this post frame advice as a "loophole" or "hack" to exploit systems?

Post: ${text.slice(0, 500)}

Respond ONLY with JSON:
{ "is_loophole": boolean, "has_guaranteed_outcome": boolean, "off_topic": boolean }`
        }]
      })

      const analysisText = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const analysis = JSON.parse(analysisText.replace(/```json|```/g, '').trim())

      if (analysis.is_loophole) {
        results.push({
          content: cleanedItem,
          excluded: true,
          exclusion_reason: 'loophole/hack framing'
        })
        continue
      }

      const flags: string[] = []
      if (analysis.has_guaranteed_outcome) flags.push('guaranteed_outcome_claim')
      if (analysis.off_topic) flags.push('off_topic')

      // Check engagement vs content ratio
      const engagement = platform === 'instagram'
        ? (item.likesCount || item.likes || 0) + (item.commentsCount || item.comments || 0)
        : platform === 'tiktok'
        ? (item.diggCount || item.likes || 0)
        : (item.likesCount || item.likes || 0)

      const hasSubstance = text.length > 50

      if (engagement > 100 && !hasSubstance) {
        results.push({
          content: cleanedItem,
          excluded: true,
          exclusion_reason: 'insufficient_data'
        })
        continue
      }

      results.push({
        content: cleanedItem,
        excluded: false,
        flags: flags.length > 0 ? flags : undefined
      })
    } catch (error) {
      console.error('Filter analysis failed:', error)
      // On error, include with flag
      results.push({
        content: cleanedItem,
        excluded: false,
        flags: ['filter_analysis_failed']
      })
    }
  }

  return results
}

export async function filterRedditContent(content: any[]): Promise<FilteredContent[]> {
  const results: FilteredContent[] = []

  for (const item of content) {
    const text = item.title + ' ' + (item.selftext || '')

    // Only exclude clearly fraudulent or pseudo-legal
    if (containsPseudoLegal(text)) {
      results.push({
        content: item,
        excluded: true,
        exclusion_reason: 'pseudo-legal language'
      })
      continue
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Is this Reddit post promoting something clearly fraudulent?

Post: ${text.slice(0, 500)}

Respond ONLY with JSON:
{ "is_fraudulent": boolean }`
        }]
      })

      const analysisText = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const analysis = JSON.parse(analysisText.replace(/```json|```/g, '').trim())

      if (analysis.is_fraudulent) {
        results.push({
          content: item,
          excluded: true,
          exclusion_reason: 'fraudulent promotion'
        })
        continue
      }

      results.push({
        content: item,
        excluded: false
      })
    } catch (error) {
      console.error('Reddit filter failed:', error)
      results.push({
        content: item,
        excluded: false
      })
    }
  }

  return results
}

export function filterNewsContent(content: any[]): FilteredContent[] {
  // Basic source quality - assume Firecrawl returns decent sources
  // Can expand with domain blocklist if needed
  return content.map(item => ({
    content: item,
    excluded: false
  }))
}
