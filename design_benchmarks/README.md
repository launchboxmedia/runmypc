# Design Benchmarks

Reference cover/body images used to evaluate and calibrate the carousel design engine (`lib/carousel/`, `lib/designSystem/`). These are the visual targets each style preset (`STYLE_LIBRARY` in `lib/designSystem/styleLibrary.ts`) is meant to approach — used when tuning typography, layout, and compositing decisions (see `docs/adr/ADR-0001-hero-archetype-v1.md` for an example of a decision validated against this set).

Versioned intentionally, not a scratch mood board — keep in sync with the style presets they correspond to.

## Structure

- `design_benchmarks_Cover/` — cover-slide references, one or more per style (`<style name>_cover_<n>.png`)
- `design_benchmarks_Body/` — body-slide references, one or more per style (`<style name>_body_<n>.png`)

Style names in filenames map to `STYLE_LIBRARY` keys in `lib/designSystem/styleLibrary.ts` (e.g. `bold & personal` → `bold_personal`).
