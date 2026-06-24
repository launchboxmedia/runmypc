// Skeleton card shown while compileCarousel executes.
// 4:5 ratio, pulse animation — matches slide canvas dimensions.
export function CarouselSkeletonCard({ index }: { index: number }) {
  return (
    <div className="shrink-0 w-24" style={{ animationDelay: `${index * 120}ms` }}>
      <div className="aspect-[4/5] bg-gray-900 border border-gray-800 animate-pulse relative overflow-hidden">
        {/* Shimmer sweep */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-800/40 to-transparent"
          style={{
            animation: `shimmer 1.8s infinite`,
            animationDelay: `${index * 120}ms`,
          }}
        />
        {/* Fake title bar */}
        <div className="absolute top-4 left-3 right-3 space-y-2">
          <div className="h-2 bg-gray-800 rounded-none" />
          <div className="h-2 bg-gray-800 rounded-none w-3/4" />
        </div>
        {/* Fake content lines */}
        <div className="absolute bottom-6 left-3 right-3 space-y-2">
          <div className="h-1.5 bg-gray-800 rounded-none" />
          <div className="h-1.5 bg-gray-800 rounded-none w-5/6" />
          <div className="h-1.5 bg-gray-800 rounded-none w-4/6" />
        </div>
      </div>
      <div className="h-1.5 bg-gray-800 animate-pulse mt-1 mx-4" />
    </div>
  )
}

// Inject shimmer keyframe globally (Next.js renders this once via <style>)
export function ShimmerStyle() {
  return (
    <style>{`
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `}</style>
  )
}
