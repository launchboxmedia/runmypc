import { withRetry } from '@/lib/retry'

function getBaseUrl() {
  return process.env.FLIPBOOKPRO_BASE_URL || 'https://bookbuilderpro.app'
}

export class FlipBookProClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    return withRetry(
      async () => {
        const res = await fetch(`${getBaseUrl()}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: body ? JSON.stringify(body) : undefined
        })

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(`FlipBookPro API error ${res.status}: ${error.error}`)
        }

        return res
      },
      {
        maxAttempts: 3,
        delayMs: 2000,
        backoffMultiplier: 2,
        onRetry: (attempt, error) => {
          console.log(`FlipBookPro API retry attempt ${attempt}:`, error.message)
        }
      }
    )
  }

  async createBook(params: { title: string; persona?: string }) {
    const res = await this.request('POST', '/api/books', params)
    return res.json() as Promise<{ book: { id: string; title: string } }>
  }

  async setupBook(bookId: string, params: {
    title: string
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
    subtitle?: string
    author_name?: string
    niche?: string
    offer_description?: string
    chapters?: Array<{ title: string; brief: string }>
  }) {
    const res = await this.request('POST', `/api/books/${bookId}/setup`, {
      title: params.title,
      persona: params.persona,
      visualStyle: params.visual_style,
      vibe: params.vibe,
      writingTone: params.writing_tone,
      readerLevel: params.reader_level,
      palette: params.palette,
      coverDirection: params.cover_direction,
      targetAudience: params.target_audience,
      offerType: params.offer_type,
      ctaIntent: params.cta_intent,
      subtitle: params.subtitle,
      authorName: params.author_name,
      niche: params.niche,
      offerDescription: params.offer_description,
      chapters: params.chapters
    })
    return res.json()
  }

  async detectChapters(outline: string) {
    const res = await this.request('POST', '/api/detect-chapters', { outline })
    return res.json() as Promise<{ chapters: Array<{ title: string; brief: string }> }>
  }

  async critiqueOutline(bookId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/critique`, {})
    return res.json()
  }

  async generateDraft(bookId: string, chapterIndex: number) {
    // Fire-and-fetch — never consume the stream
    this.request('POST', `/api/books/${bookId}/generate-draft`, {
      chapterIndex
    }).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 15000))
  }

  async critiqueChapter(bookId: string, pageId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/critique-chapter`, { pageId })
    return res.json()
  }

  async generateChapterImage(bookId: string, pageId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/generate-chapter-image`, { pageId })
    return res.json()
  }

  async generateCoverImage(bookId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/generate-cover-image`, {})
    return res.json()
  }

  async generateBackMatter(bookId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/back-matter`, {})
    return res.json()
  }

  async generateBackCover(bookId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/back-cover`, {})
    return res.json()
  }

  async prePublishCheck(bookId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/pre-publish-check`, {})
    return res.json() as Promise<{ blockers: string[]; warnings: string[] }>
  }

  async publishBook(bookId: string) {
    const res = await this.request('POST', `/api/books/${bookId}/publish`, {})
    return res.json() as Promise<{ slug: string; published_at: string }>
  }
}
