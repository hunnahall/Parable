// The mark's own SVG (public/brand/parable-mark.svg) is a bookmark: a
// book-outline "box" (viewBox y 30-130) with a ribbon spine-and-fold
// extending above it (y 0-30, viewBox height 136 total). The box's own
// vertical center (y=80) sits below the full mark's bounding-box center
// (y=68) — the ribbon above pulls the full-height center upward. Centering
// "Parable" against the whole mark (its default flex cross-axis center)
// therefore reads as sitting too high relative to the box; nudging it down
// by this fraction of the rendered height centers it on the box instead.
const BOX_CENTER_OFFSET_FRACTION = 12 / 136

export default function ParableLogo({ height = 32 }: { height?: number }) {
  const fontSize = height * 0.58
  // Tracking tightens as size increases per the design system's type
  // scale — thresholds bridge the gaps between its documented buckets.
  const tracking =
    fontSize >= 56 ? -0.028 : fontSize >= 32 ? -0.02 : fontSize >= 20 ? -0.015 : -0.01

  return (
    <div
      className="inline-flex items-center"
      style={{ gap: height * 0.24 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/parable-mark.svg"
        alt=""
        height={height}
        style={{ height, width: 'auto' }}
      />
      <span
        className="font-heading font-bold text-foreground leading-none"
        style={{
          fontSize,
          letterSpacing: `${tracking}em`,
          transform: `translateY(${height * BOX_CENTER_OFFSET_FRACTION}px)`,
        }}
      >
        Parable
      </span>
    </div>
  )
}
