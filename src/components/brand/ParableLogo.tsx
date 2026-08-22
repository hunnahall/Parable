export default function ParableLogo({ height = 32 }: { height?: number }) {
  const fontSize = height * 0.58
  // Tracking tightens as size increases per the design system's type
  // scale — thresholds bridge the gaps between its documented buckets.
  const tracking =
    fontSize >= 56 ? -0.028 : fontSize >= 32 ? -0.02 : fontSize >= 20 ? -0.015 : -0.01

  return (
    <div
      className="inline-flex items-center"
      style={{ gap: height * 0.12 }}
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
        style={{ fontSize, letterSpacing: `${tracking}em` }}
      >
        Parable
      </span>
    </div>
  )
}
