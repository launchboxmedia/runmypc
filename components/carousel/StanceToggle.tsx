'use client'

export type Stance = 'mimic' | 'destroy'

type Props = {
  value: Stance
  onChange: (v: Stance) => void
}

export function StanceToggle({ value, onChange }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-widest">
        Competitive Stance
      </label>
      <div className="flex border border-gray-700 overflow-hidden" style={{ borderRadius: 0 }}>
        {(['mimic', 'destroy'] as Stance[]).map((s) => {
          const active = value === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all ${
                active
                  ? s === 'destroy'
                    ? 'bg-[#E8622A] text-black'
                    : 'bg-white text-black'
                  : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {s === 'mimic' ? 'Mimic Competitors' : 'Destroy Competitors'}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-600 mt-2">
        {value === 'mimic'
          ? 'Mirror what performs well in your niche.'
          : 'Aggressive reframing — position competitors as the problem.'}
      </p>
    </div>
  )
}
