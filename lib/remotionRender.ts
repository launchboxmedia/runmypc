import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

type RenderParams = {
  hook: string
  body: string
  cta: string
  platform: string
  brandColor: string
  businessName: string
  handle: string
  outputPath: string
}

export async function renderSocialVideo(params: RenderParams): Promise<string> {
  const {
    hook,
    body,
    cta,
    platform,
    brandColor,
    businessName,
    handle,
    outputPath
  } = params

  // Build props JSON
  const props = JSON.stringify({
    hook,
    body: body.slice(0, 200),
    cta,
    platform,
    brandColor: brandColor || '#E8622A',
    businessName,
    handle
  })

  const propsFile = path.join(process.cwd(), `tmp-props-${Date.now()}.json`)
  fs.writeFileSync(propsFile, props)

  try {
    // Render via Remotion CLI
    execSync(
      `npx remotion render SocialPost "${outputPath}" --props="${propsFile}" --gl=angle`,
      {
        stdio: 'pipe',
        cwd: process.cwd()
      }
    )
    return outputPath
  } finally {
    // Cleanup props file
    if (fs.existsSync(propsFile)) fs.unlinkSync(propsFile)
  }
}

export async function renderAllPlatformVideos(params: {
  posts: Array<{ platform: string; hook: string; body: string; cta: string }>
  brandColor: string
  businessName: string
  handles: Record<string, string>
  jobId: string
  userId: string
}): Promise<Array<{ platform: string; filePath: string }>> {
  const { posts, brandColor, businessName, handles, jobId, userId } = params
  const results: Array<{ platform: string; filePath: string }> = []

  // Create output directory
  const outputDir = path.join(process.cwd(), 'tmp', 'videos', jobId)
  fs.mkdirSync(outputDir, { recursive: true })

  // Render one video per platform (use first post)
  const platforms = [...new Set(posts.map(p => p.platform))]

  for (const platform of platforms) {
    const post = posts.find(p => p.platform === platform)
    if (!post) continue

    const handle = handles[platform] || `@${businessName.toLowerCase().replace(/\s+/g, '')}`
    const outputPath = path.join(outputDir, `${platform}-video.mp4`)

    try {
      await renderSocialVideo({
        hook: post.hook,
        body: post.body,
        cta: post.cta,
        platform,
        brandColor: brandColor || '#E8622A',
        businessName,
        handle,
        outputPath
      })

      results.push({ platform, filePath: outputPath })
    } catch (err) {
      console.error(`Remotion render failed for ${platform}:`, err)
      // Continue — don't fail the whole job for one platform
    }
  }

  return results
}

export async function renderCarousel(params: {
  slides: Array<{ content: string; slideType: 'hook' | 'insight' | 'cta' }>
  brandColor: string
  businessName: string
  handle: string
  outputDir: string
}): Promise<string[]> {
  const { slides, brandColor, businessName, handle, outputDir } = params
  const renderedPaths: string[] = []

  fs.mkdirSync(outputDir, { recursive: true })

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const outputPath = path.join(outputDir, `slide-${i + 1}.png`)

    const props = JSON.stringify({
      slideNumber: i + 1,
      totalSlides: slides.length,
      content: slide.content,
      slideType: slide.slideType,
      brandColor,
      businessName,
      handle
    })

    const propsFile = path.join(process.cwd(), `tmp-carousel-props-${Date.now()}-${i}.json`)
    fs.writeFileSync(propsFile, props)

    try {
      execSync(
        `npx remotion still CarouselSlide "${outputPath}" --props="${propsFile}" --frame=15`,
        { stdio: 'pipe', cwd: process.cwd() }
      )
      renderedPaths.push(outputPath)
    } catch (err) {
      console.error(`Carousel slide ${i + 1} failed:`, err)
    } finally {
      if (fs.existsSync(propsFile)) fs.unlinkSync(propsFile)
    }
  }

  return renderedPaths
}
