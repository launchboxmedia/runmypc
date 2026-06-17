import Anthropic from '@anthropic-ai/sdk'
import * as path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import * as fs from 'fs'

let anthropic: Anthropic

function getClients() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return { anthropic }
}

export async function debugScraperResults() {
  const supabase = createAdminClient()
  const debugLog: any = {
    timestamp: new Date().toISOString(),
    platforms: {}
  }

  try {
    const { runApifyActor } = await import('@/lib/apify')
    const primaryTerm = 'credit repair'

    console.log('Starting debug scraping for:', primaryTerm)

    // Run all 4 scrapers in parallel
    const [instagramResults, tiktokResults, youtubeResults, linkedinResults] = await Promise.all([
      runApifyActor('apify/instagram-scraper', {
        directUrls: [`https://www.instagram.com/explore/tags/${primaryTerm.replace(/\s+/g, '')}/`],
        resultsType: 'posts',
        resultsLimit: 15
      }).catch((err) => {
        console.error('Instagram scraper error:', err)
        return []
      }),

      runApifyActor('clockworks/tiktok-scraper', {
        hashtags: [primaryTerm.replace(/\s+/g, '')],
        resultsPerPage: 15
      }).catch((err) => {
        console.error('TikTok scraper error:', err)
        return []
      }),

      runApifyActor('streamers/youtube-scraper', {
        searchQueries: [primaryTerm],
        maxResults: 15
      }).catch((err) => {
        console.error('YouTube scraper error:', err)
        return []
      }),

      runApifyActor('harvestapi/linkedin-post-search', {
        searchQueries: [primaryTerm],
        maxPosts: 15
      }).catch((err) => {
        console.error('LinkedIn scraper error:', err)
        return []
      })
    ])

    // Process Instagram
    console.log('\n=== INSTAGRAM RAW RESULTS ===')
    debugLog.platforms.instagram = {
      total_results: instagramResults.length,
      raw_results: instagramResults,
      engagement_fields_found: [],
      sorted_by_engagement: [],
      top_performer: null
    }

    if (instagramResults.length > 0) {
      // Try every possible engagement field
      const engagementFields = [
        'likesCount', 'likes', 'like_count', 'edge_liked_by',
        'commentsCount', 'comments', 'comment_count', 'edge_media_to_comment'
      ]

      const found = engagementFields.filter(field => {
        const sample = instagramResults[0]
        return sample && (
          sample[field] !== undefined ||
          (field.includes('.') && field.split('.').reduce((obj, key) => obj?.[key], sample) !== undefined)
        )
      })

      debugLog.platforms.instagram.engagement_fields_found = found

      // Try to sort by likesCount primarily
      const sorted = [...instagramResults].sort((a, b) => {
        const likesA = a.likesCount || a.likes || a.like_count || a.edge_liked_by?.count || 0
        const likesB = b.likesCount || b.likes || b.like_count || b.edge_liked_by?.count || 0
        return likesB - likesA
      })

      debugLog.platforms.instagram.sorted_by_engagement = sorted.map((post, idx) => ({
        rank: idx + 1,
        likes: post.likesCount || post.likes || post.like_count || post.edge_liked_by?.count || 0,
        comments: post.commentsCount || post.comments || post.comment_count || post.edge_media_to_comment?.count || 0,
        caption: (post.caption || post.text || '').slice(0, 100),
        raw: post
      }))

      debugLog.platforms.instagram.top_performer = debugLog.platforms.instagram.sorted_by_engagement[0]
    }

    // Process TikTok
    console.log('\n=== TIKTOK RAW RESULTS ===')
    debugLog.platforms.tiktok = {
      total_results: tiktokResults.length,
      raw_results: tiktokResults,
      engagement_fields_found: [],
      sorted_by_engagement: [],
      top_performer: null
    }

    if (tiktokResults.length > 0) {
      const engagementFields = [
        'diggCount', 'likes', 'heart', 'stats.diggCount',
        'playCount', 'videoMeta.playCount', 'webVideoData.stats.playCount'
      ]

      const found = engagementFields.filter(field => {
        const sample = tiktokResults[0]
        return sample && (
          sample[field] !== undefined ||
          (field.includes('.') && field.split('.').reduce((obj, key) => obj?.[key], sample) !== undefined)
        )
      })

      debugLog.platforms.tiktok.engagement_fields_found = found

      const sorted = [...tiktokResults].sort((a, b) => {
        const likesA = a.diggCount || a.likes || a.heart || a.stats?.diggCount || 0
        const likesB = b.diggCount || b.likes || b.heart || b.stats?.diggCount || 0
        return likesB - likesA
      })

      debugLog.platforms.tiktok.sorted_by_engagement = sorted.map((post, idx) => ({
        rank: idx + 1,
        likes: post.diggCount || post.likes || post.heart || post.stats?.diggCount || 0,
        views: post.playCount || post.videoMeta?.playCount || post.stats?.playCount || 0,
        text: (post.text || post.desc || '').slice(0, 100),
        raw: post
      }))

      debugLog.platforms.tiktok.top_performer = debugLog.platforms.tiktok.sorted_by_engagement[0]
    }

    // Process YouTube
    console.log('\n=== YOUTUBE RAW RESULTS ===')
    debugLog.platforms.youtube = {
      total_results: youtubeResults.length,
      raw_results: youtubeResults,
      engagement_fields_found: [],
      sorted_by_engagement: [],
      top_performer: null
    }

    if (youtubeResults.length > 0) {
      const engagementFields = [
        'viewCount', 'views', 'statistics.viewCount', 'numberOfViews'
      ]

      const found = engagementFields.filter(field => {
        const sample = youtubeResults[0]
        return sample && (
          sample[field] !== undefined ||
          (field.includes('.') && field.split('.').reduce((obj, key) => obj?.[key], sample) !== undefined)
        )
      })

      debugLog.platforms.youtube.engagement_fields_found = found

      const sorted = [...youtubeResults].sort((a, b) => {
        const viewsA = a.viewCount || a.views || a.statistics?.viewCount || a.numberOfViews || 0
        const viewsB = b.viewCount || b.views || b.statistics?.viewCount || b.numberOfViews || 0
        return viewsB - viewsA
      })

      debugLog.platforms.youtube.sorted_by_engagement = sorted.map((post, idx) => ({
        rank: idx + 1,
        views: post.viewCount || post.views || post.statistics?.viewCount || post.numberOfViews || 0,
        title: post.title || '',
        raw: post
      }))

      debugLog.platforms.youtube.top_performer = debugLog.platforms.youtube.sorted_by_engagement[0]
    }

    // Process LinkedIn
    console.log('\n=== LINKEDIN RAW RESULTS ===')
    debugLog.platforms.linkedin = {
      total_results: linkedinResults.length,
      raw_results: linkedinResults,
      engagement_fields_found: [],
      sorted_by_engagement: [],
      top_performer: null
    }

    if (linkedinResults.length > 0) {
      const engagementFields = [
        'likesCount', 'likes', 'likeCount', 'socialCounts.numLikes',
        'reactionCount', 'totalReactionCount', 'commentsCount'
      ]

      const found = engagementFields.filter(field => {
        const sample = linkedinResults[0]
        return sample && (
          sample[field] !== undefined ||
          (field.includes('.') && field.split('.').reduce((obj, key) => obj?.[key], sample) !== undefined)
        )
      })

      debugLog.platforms.linkedin.engagement_fields_found = found

      const sorted = [...linkedinResults].sort((a, b) => {
        const likesA = a.likesCount || a.likes || a.likeCount || a.totalReactionCount || a.reactionCount || 0
        const likesB = b.likesCount || b.likes || b.likeCount || b.totalReactionCount || b.reactionCount || 0
        return likesB - likesA
      })

      debugLog.platforms.linkedin.sorted_by_engagement = sorted.map((post, idx) => ({
        rank: idx + 1,
        likes: post.likesCount || post.likes || post.likeCount || post.totalReactionCount || post.reactionCount || 0,
        comments: post.commentsCount || post.comments || post.numComments || 0,
        text: (post.text || post.content || '').slice(0, 100),
        raw: post
      }))

      debugLog.platforms.linkedin.top_performer = debugLog.platforms.linkedin.sorted_by_engagement[0]
    }

    // Save to file
    const outputPath = path.join('C:', 'Users', 'mjohn', 'Documents', 'LaunchBox.Media', 'runmypc', 'tmp', 'scraper-debug.json')

    // Ensure tmp directory exists
    const tmpDir = path.dirname(outputPath)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    fs.writeFileSync(outputPath, JSON.stringify(debugLog, null, 2))

    console.log('\n✅ Debug data written to:', outputPath)
    console.log('\n=== SUMMARY ===')
    console.log('Instagram:', debugLog.platforms.instagram.total_results, 'results')
    console.log('TikTok:', debugLog.platforms.tiktok.total_results, 'results')
    console.log('YouTube:', debugLog.platforms.youtube.total_results, 'results')
    console.log('LinkedIn:', debugLog.platforms.linkedin.total_results, 'results')

    return debugLog

  } catch (error) {
    console.error('Debug scraper failed:', error)
    throw error
  }
}
