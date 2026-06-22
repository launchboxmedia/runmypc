// Minimal ambient types for culori v4 (the package ships no types).
// Covers only the functions used in this module: parse, formatHex, converter,
// wcagContrast. ColorObject is a permissive-but-typed shape (channels are
// optional numbers) so derivation math stays type-safe without `any`.
declare module 'culori' {
  export interface ColorObject {
    mode: string
    h?: number
    s?: number
    l?: number
    r?: number
    g?: number
    b?: number
    alpha?: number
  }

  export function parse(color: string): ColorObject | undefined
  export function formatHex(color: ColorObject | undefined): string | undefined
  export function converter(mode: string): (color: ColorObject | undefined) => ColorObject | undefined
  export function wcagContrast(a: string, b: string): number
}
