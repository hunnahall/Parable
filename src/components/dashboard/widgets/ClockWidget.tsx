'use client'

import { useEffect, useState } from 'react'

const CENTER = 50
const RADIUS = 46

const TICKS = Array.from({ length: 60 }, (_, index) => ({
  angle: index * 6,
  major: index % 5 === 0,
  cardinal: index % 15 === 0,
}))

export default function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    // The first tick (and the resulting first real render) lands ~1s after
    // mount rather than synchronously — deliberately, so the state update
    // only ever happens inside this callback, never directly in the effect
    // body, which keeps a same server/client blank frame and avoids a
    // hydration mismatch on the hands' rotate angles.
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!now) return <div className="w-full h-full" />

  const seconds = now.getSeconds()
  const minutes = now.getMinutes()
  const hours = now.getHours() % 12

  const secondAngle = seconds * 6
  const minuteAngle = minutes * 6 + seconds * 0.1
  const hourAngle = hours * 30 + minutes * 0.5

  return (
    // No aspect-square here: the widget card's box isn't always square
    // (grid width scales with viewport, height is fixed by rowHeight * h),
    // so we fill it exactly and let the SVG's own viewBox + default
    // preserveAspectRatio letterbox the round face inside it — that fits
    // any box without clipping or stretching, unlike CSS aspect-ratio.
    <div className="w-full h-full text-foreground">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
        />
        {TICKS.map((tick) => (
          <line
            key={tick.angle}
            x1={CENTER}
            y1={tick.cardinal ? CENTER - RADIUS + 2 : tick.major ? CENTER - RADIUS + 4 : CENTER - RADIUS + 6}
            x2={CENTER}
            y2={CENTER - RADIUS + 10}
            stroke="currentColor"
            strokeOpacity={tick.major ? 0.7 : 0.35}
            strokeWidth={tick.cardinal ? 1.4 : tick.major ? 1 : 0.6}
            strokeLinecap="round"
            transform={`rotate(${tick.angle} ${CENTER} ${CENTER})`}
          />
        ))}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={CENTER}
          y2={CENTER - RADIUS * 0.5}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          transform={`rotate(${hourAngle} ${CENTER} ${CENTER})`}
        />
        <line
          x1={CENTER}
          y1={CENTER}
          x2={CENTER}
          y2={CENTER - RADIUS * 0.75}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          transform={`rotate(${minuteAngle} ${CENTER} ${CENTER})`}
        />
        <line
          x1={CENTER}
          y1={CENTER}
          x2={CENTER}
          y2={CENTER - RADIUS * 0.85}
          stroke="var(--accent)"
          strokeWidth={0.8}
          strokeLinecap="round"
          transform={`rotate(${secondAngle} ${CENTER} ${CENTER})`}
        />
        <circle cx={CENTER} cy={CENTER} r={1.8} fill="currentColor" />
      </svg>
    </div>
  )
}
