import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

type Props = {
  hook: string
  body: string
  cta: string
  platform: string
  brandColor: string
  businessName: string
  handle: string
}

export const SocialPost: React.FC<Props> = ({
  hook,
  body,
  cta,
  platform,
  brandColor,
  businessName,
  handle
}) => {
  const frame = useCurrentFrame()

  // Hook slams in at frame 0
  const hookOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })
  const hookY = interpolate(frame, [0, 10], [30, 0], { extrapolateRight: 'clamp' })

  // Body fades in at frame 30
  const bodyOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: 'clamp' })

  // CTA slides in at frame 60
  const ctaOpacity = interpolate(frame, [60, 75], [0, 1], { extrapolateRight: 'clamp' })
  const ctaY = interpolate(frame, [60, 75], [20, 0], { extrapolateRight: 'clamp' })

  // Handle appears last
  const handleOpacity = interpolate(frame, [80, 90], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', fontFamily: 'Arial Black, sans-serif' }}>

      {/* Top orange bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 8,
        backgroundColor: brandColor
      }} />

      {/* Content */}
      <div style={{
        position: 'absolute',
        top: 80,
        left: 60,
        right: 60,
        bottom: 160,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>

        {/* Hook */}
        <div style={{
          opacity: hookOpacity,
          transform: `translateY(${hookY}px)`,
          fontSize: 52,
          fontWeight: 900,
          color: '#FFFFFF',
          lineHeight: 1.1,
          marginBottom: 48,
          letterSpacing: '-1px'
        }}>
          {hook}
        </div>

        {/* Body */}
        <div style={{
          opacity: bodyOpacity,
          fontSize: 28,
          color: '#CCCCCC',
          lineHeight: 1.5,
          marginBottom: 48
        }}>
          {body.length > 200 ? body.slice(0, 200) + '...' : body}
        </div>

        {/* CTA */}
        <div style={{
          opacity: ctaOpacity,
          transform: `translateY(${ctaY}px)`,
          fontSize: 32,
          fontWeight: 900,
          color: brandColor,
          letterSpacing: '1px'
        }}>
          {cta}
        </div>

      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 120,
        backgroundColor: '#111111',
        borderTop: `4px solid ${brandColor}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 60,
        paddingRight: 60,
        justifyContent: 'space-between'
      }}>
        <div style={{
          opacity: handleOpacity,
          fontSize: 24,
          color: '#FFFFFF',
          fontWeight: 700
        }}>
          {handle}
        </div>
        <div style={{
          opacity: handleOpacity,
          fontSize: 20,
          color: '#666666',
          textTransform: 'uppercase',
          letterSpacing: '3px'
        }}>
          {platform}
        </div>
      </div>

      {/* Bottom orange bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: brandColor
      }} />

    </AbsoluteFill>
  )
}
