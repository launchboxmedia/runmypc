'use client'

import { STYLE_LIST, type StyleId } from '@/lib/designSystem/styleLibrary'

// Visual single-select for the 5 carousel styles. NOT a text dropdown.
//
// No-orphan-card requirement: the grid must never leave a lonely final card
// (the auto-fit "lonely fifth" from the sign-off swatch page). Fixed responsive
// columns + a centered last row handle this: 1 col (mobile) -> 2 (sm) -> 3 (lg);
// `justify-center` centers any short final row so 5 items read as 3+2 centered,
// never 3+1+orphan.
export function StylePicker({
  value,
  onChange,
}: {
  value: StyleId | null
  onChange: (id: StyleId) => void
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {STYLE_LIST.map(style => {
        const selected = value === style.id
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange(style.id)}
            aria-pressed={selected}
            className={[
              'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]',
              'text-left rounded-xl border overflow-hidden transition',
              selected ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-200 hover:border-gray-300',
            ].join(' ')}
          >
            {/* Preview image; degrades gracefully to name + description if missing. */}
            <div className="aspect-[4/5] bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={style.preview_image_url}
                alt={style.display_name}
                className="h-full w-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm">{style.display_name}</div>
              <div className="text-xs text-gray-500 mt-1">{style.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
