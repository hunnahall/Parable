import ParableMark from './ParableMark'

// Mark plus the name set in the display face beside it (the spec keeps
// letters out of the symbol itself).
export default function ParableLogo({
  height = 24,
  tone = 'ink',
  drawIn = false,
}: {
  height?: number
  tone?: 'ink' | 'accent'
  drawIn?: boolean
}) {
  const fontSize = Math.round(height * 0.62)
  return (
    <span className="inline-flex items-center" style={{ gap: Math.round(height * 0.33) }}>
      <ParableMark size={height} tone={tone} drawIn={drawIn} />
      <span
        className="font-sans font-semibold text-foreground leading-none"
        style={{ fontSize, letterSpacing: fontSize >= 20 ? '-0.015em' : 0 }}
      >
        Parable
      </span>
    </span>
  )
}
