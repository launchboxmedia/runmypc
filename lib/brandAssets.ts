// RunMyPC brand character assets
// Update these URLs when final Higgsfield assets are generated and hosted
export const BRAND_ASSETS = {
  // Orange outline characters on black background
  dj: process.env.NEXT_PUBLIC_ASSET_DJ_URL || '',
  bboy: process.env.NEXT_PUBLIC_ASSET_BBOY_URL || '',
  writer: process.env.NEXT_PUBLIC_ASSET_WRITER_URL || '',
  graffitiWall: process.env.NEXT_PUBLIC_ASSET_WALL_URL || '',
  logo: process.env.NEXT_PUBLIC_ASSET_LOGO_URL || ''
}

// Map phases to characters
export const PHASE_CHARACTER: Record<string, string> = {
  book_generation: BRAND_ASSETS.dj,
  content_generation: BRAND_ASSETS.bboy,
  ad_generation: BRAND_ASSETS.writer
}
