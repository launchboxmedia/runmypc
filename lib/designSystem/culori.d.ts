declare module 'culori' {
  export interface Hsl {
    mode: 'hsl'
    h?: number
    s?: number
    l?: number
  }

  export interface RgbLike {
    [key: string]: any
  }

  export function parse(color: string): RgbLike | undefined
  export function formatHex(color: RgbLike | undefined): string | undefined
  export function converter(mode: string): (color: RgbLike | undefined) => any
  export function wcagContrast(a: string, b: string): number
}
