import { Composition } from 'remotion'
import { SocialPost } from './compositions/SocialPost'
import { CarouselSlide } from './compositions/CarouselSlide'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SocialPost"
        component={SocialPost}
        durationInFrames={120}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          hook: 'Your hook here',
          body: 'Your body copy here',
          cta: 'Your CTA here',
          platform: 'instagram',
          brandColor: '#E8622A',
          businessName: 'RunMyPC',
          handle: '@runmypc'
        }}
      />
      <Composition
        id="CarouselSlide"
        component={CarouselSlide}
        durationInFrames={30}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          slideNumber: 1,
          totalSlides: 7,
          content: 'Hook text here',
          slideType: 'hook',
          brandColor: '#E8622A',
          businessName: 'RunMyPC',
          handle: '@runmypc'
        }}
      />
    </>
  )
}
