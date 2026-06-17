import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

type Props = {
  slideNumber: number
  totalSlides: number
  content: string
  slideType: 'hook' | 'insight' | 'cta'
  brandColor: string
  businessName: string
  handle: string
}

export const CarouselSlide: React.FC<Props> = ({
  slideNumber,
  totalSlides,
  content,
  slideType,
  brandColor,
  businessName,
  handle
}) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })

  const bgColor = slideType === 'hook' ? brandColor :
                  slideType === 'cta' ? brandColor : '#111111'

  const textColor = slideType === 'hook' || slideType === 'cta' ? '#000000' : '#FFFFFF'

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, opacity }}>

      {/* Slide number indicator */}
      <div style={{
        position: 'absolute',
        top: 48,
        right: 48,
        fontSize: 24,
        color: slideType === 'hook' || slideType === 'cta' ? '#00000066' : '#FFFFFF44'
      }}>
        {slideNumber}/{totalSlides}
      </div>

      {/* Main content */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 60px'
      }}>
        <p style={{
          fontSize: slideType === 'hook' ? 64 : 48,
          fontWeight: 900,
          color: textColor,
          lineHeight: 1.2,
          textAlign: 'center',
          fontFamily: 'Arial Black, sans-serif'
        }}>
          {content}
        </p>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 100,
        backgroundColor: slideType === 'hook' || slideType === 'cta'
          ? '#00000022' : brandColor,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 60,
        paddingRight: 60,
        justifyContent: 'space-between'
      }}>
        <p style={{
          fontSize: 22,
          fontWeight: 700,
          color: slideType === 'hook' || slideType === 'cta' ? '#000000' : '#000000'
        }}>
          {handle}
        </p>
        <p style={{
          fontSize: 18,
          color: slideType === 'hook' || slideType === 'cta' ? '#00000088' : '#00000088',
          textTransform: 'uppercase',
          letterSpacing: '3px'
        }}>
          {businessName}
        </p>
      </div>

    </AbsoluteFill>
  )
}
