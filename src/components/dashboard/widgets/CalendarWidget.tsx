'use client'

import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import 'react-day-picker/style.css'

export default function CalendarWidget() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  // null until the first measurement — used to keep the unscaled calendar
  // invisible for that one frame instead of flashing at full size.
  const [scale, setScale] = useState<number | null>(null)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    // Renders the calendar at a fixed, comfortable size and shrinks the
    // whole thing with a transform to fit whatever box the widget actually
    // has — the react-day-picker grid has no built-in "fit both dimensions"
    // mode, so this is the equivalent of object-fit: contain for it.
    const recompute = () => {
      const outerBox = outer.getBoundingClientRect()
      const naturalWidth = inner.scrollWidth
      const naturalHeight = inner.scrollHeight
      if (naturalWidth === 0 || naturalHeight === 0) return
      setScale(
        Math.min(outerBox.width / naturalWidth, outerBox.height / naturalHeight, 1)
      )
    }

    const observer = new ResizeObserver(recompute)
    observer.observe(outer)
    recompute()
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={outerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <div
        ref={innerRef}
        className="text-foreground text-sm"
        style={
          {
            visibility: scale === null ? 'hidden' : 'visible',
            transform: scale !== null ? `scale(${scale})` : undefined,
            '--rdp-accent-color': 'var(--accent)',
            '--rdp-accent-background-color':
              'color-mix(in srgb, var(--accent) 15%, transparent)',
            '--rdp-today-color': 'var(--accent)',
            '--rdp-day-height': '2.5rem',
            '--rdp-day-width': '2.5rem',
          } as React.CSSProperties
        }
      >
        <DayPicker
          showOutsideDays
          navLayout="around"
          modifiersClassNames={{ today: 'font-bold' }}
          components={{
            Chevron: ({ orientation, ...props }) =>
              orientation === 'left' ? (
                <ChevronLeft size={16} {...props} />
              ) : (
                <ChevronRight size={16} {...props} />
              ),
          }}
        />
      </div>
    </div>
  )
}
