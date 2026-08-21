export default function ParableMark({ size = 24 }: { size?: number }) {
  // height-only (not width={size} height={size}): the bookmark mark's
  // spine-and-fold extends above the book outline, so its natural aspect
  // ratio is taller than it is wide — forcing a square box would squash it.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/parable-mark.svg"
      alt="Parable"
      height={size}
      style={{ height: size, width: 'auto' }}
    />
  )
}
