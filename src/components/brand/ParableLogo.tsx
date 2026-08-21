export default function ParableLogo({ height = 32 }: { height?: number }) {
  return (
    <div
      className="inline-flex items-center"
      style={{ gap: height * 0.14 }}
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
        style={{ fontSize: height * 0.58 }}
      >
        Parable
      </span>
    </div>
  )
}
