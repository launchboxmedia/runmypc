import { execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

type VideoSpec = {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'linkedin'
  hook: string
  body: string
  cta: string
  brandColor: string
  businessName: string
  handle: string
}

export async function generatePlatformVideo(spec: VideoSpec): Promise<string> {
  const { platform, hook, body, cta, brandColor, businessName, handle } = spec

  // Platform-specific dimensions
  const dimensions = {
    instagram: { width: 1080, height: 1920 },
    tiktok: { width: 1080, height: 1920 },
    youtube: { width: 1920, height: 1080 },
    linkedin: { width: 1920, height: 1080 }
  }

  const { width, height } = dimensions[platform]

  // Create temp HTML composition
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: ${brandColor};
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }
    #stage {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 80px;
      color: white;
      text-align: center;
    }
    .hook {
      font-size: 72px;
      font-weight: 900;
      line-height: 1.2;
      margin-bottom: 40px;
      animation: fadeInUp 0.8s ease-out;
    }
    .body {
      font-size: 42px;
      font-weight: 500;
      line-height: 1.5;
      margin-bottom: 60px;
      opacity: 0;
      animation: fadeInUp 0.8s ease-out 1s forwards;
    }
    .cta {
      font-size: 48px;
      font-weight: 700;
      padding: 30px 60px;
      background: white;
      color: ${brandColor};
      border-radius: 60px;
      opacity: 0;
      animation: fadeInUp 0.8s ease-out 2s forwards;
    }
    .handle {
      position: absolute;
      bottom: 40px;
      font-size: 36px;
      font-weight: 600;
      opacity: 0;
      animation: fadeInUp 0.8s ease-out 3s forwards;
    }
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="${platform}-video" data-start="0" data-width="${width}" data-height="${height}">
    <div class="hook clip" data-start="0" data-duration="6">${hook}</div>
    <div class="body clip" data-start="1" data-duration="6">${body.substring(0, 200)}</div>
    <div class="cta clip" data-start="2" data-duration="6">${cta}</div>
    <div class="handle clip" data-start="3" data-duration="6">${handle}</div>
  </div>
</body>
</html>
  `

  // Write temp HTML file
  const tmpDir = path.join(process.cwd(), 'tmp', 'hyperframes')
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true })
  }

  const htmlPath = path.join(tmpDir, `${platform}-${Date.now()}.html`)
  fs.writeFileSync(htmlPath, htmlContent)

  // Render to video via hyperframes CLI
  const outputPath = path.join(tmpDir, `${platform}-${uuidv4()}.mp4`)

  try {
    // Invoke hyperframes CLI: npx hyperframes render <input> <output>
    const cmd = `npx hyperframes render "${htmlPath}" "${outputPath}" --fps 30 --duration 6`
    execSync(cmd, { stdio: 'inherit' })
  } catch (error) {
    console.error('Hyperframes render failed:', error)
    throw new Error('Video generation failed')
  } finally {
    // Cleanup HTML
    if (fs.existsSync(htmlPath)) {
      fs.unlinkSync(htmlPath)
    }
  }

  return outputPath
}

export async function generateAllPlatformVideos(specs: {
  posts: Array<{ platform: string; hook: string; body: string; cta: string }>
  brandColor: string
  businessName: string
  handles: Record<string, string>
}): Promise<Array<{ platform: string; filePath: string }>> {
  const { posts, brandColor, businessName, handles } = specs

  const results: Array<{ platform: string; filePath: string }> = []

  // Generate one video per platform (use first post for each)
  const platformPosts = new Map<string, typeof posts[0]>()
  for (const post of posts) {
    if (!platformPosts.has(post.platform)) {
      platformPosts.set(post.platform, post)
    }
  }

  for (const [platform, post] of platformPosts) {
    if (!['instagram', 'tiktok', 'youtube', 'linkedin'].includes(platform)) continue

    const videoPath = await generatePlatformVideo({
      platform: platform as any,
      hook: post.hook,
      body: post.body,
      cta: post.cta,
      brandColor,
      businessName,
      handle: handles[platform] || `@${businessName.toLowerCase()}`
    })

    results.push({ platform, filePath: videoPath })
  }

  return results
}
