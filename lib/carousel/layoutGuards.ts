// Pre-render structural checks on generated beats. Cheap, deterministic, no I/O.
import type { CarouselBeat } from './types'

// Above this, a headline risks overflowing the 936px-wide safe-zone cell.
export const HOOK_MAX_CHARS = 90

export type OverflowWarning = { index: number; beat: string; chars: number; title: string }

// Returns one warning per beat whose title (hook_text) exceeds the cap.
export function checkHookOverflow(beats: CarouselBeat[]): OverflowWarning[] {
  return beats
    .filter(b => (b.title?.length ?? 0) > HOOK_MAX_CHARS)
    .map(b => ({ index: b.index, beat: b.beat, chars: b.title.length, title: b.title }))
}
