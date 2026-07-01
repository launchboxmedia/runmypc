# Carousel & Hyperframes Rendering Engine Rules

## The Golden Rule of Motion
This application uses Hyperframes to render MP4 videos frame-by-frame. Because of this, **native CSS animations, @keyframes, and CSS transitions are strictly forbidden.** They will freeze at frame 0 during the render.

## GSAP Timeline Contract
All motion must be orchestrated via a single, strictly controlled GSAP timeline.
1. **Target:** All animations must attach to the existing timeline registered at `window.__timelines["slide"]`.
2. **Properties:** Use only hardware-accelerated properties (`transform`, `opacity`, `scale`).
3. **Duration:** The total timeline duration must reach exactly `SLIDE_DURATION = 3` seconds.
4. **The Sentinel:** The timeline must always end with the trailing sentinel to guarantee a seekable endpoint: `tl.to("#slide", {opacity:1, duration:0.01}, 3)`

## Layout Constraints
- **Separation:** Maintain a strict architectural separation between Cover slides and Body slides to protect the core 3x3 CSS grid rails.
- **Cover Variations:** Logic for "Split Cover" vs "Full-Bleed Cover" should be managed as properties within the `styleLibrary.ts` presets, not hardcoded as structural branches in the core HTML renderer.
