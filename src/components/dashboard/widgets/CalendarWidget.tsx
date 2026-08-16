'use client'

import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import 'react-day-picker/style.css'

export default function CalendarWidget() {
  return (
    // container-type: inline-size turns cqw below into "% of this div's own
    // width" rather than the viewport's — needed since the widget's actual
    // width varies with the dashboard's grid column width, not the window.
    <div
      className="text-foreground text-sm flex justify-center"
      style={{ containerType: 'inline-size' }}
    >
      <div
        style={
          {
            '--rdp-accent-color': 'var(--accent)',
            '--rdp-accent-background-color':
              'color-mix(in srgb, var(--accent) 15%, transparent)',
            '--rdp-today-color': 'var(--accent)',
            // Fixed rem sizing left the calendar's rendered width constant
            // regardless of the widget's actual box, so a wide card (wide
            // viewport) showed mostly blank space beside it. Scaling with
            // cqw keeps day cells proportional to the widget itself,
            // clamped so they never get illegibly small or absurdly large.
            // Floor raised to 2.25rem (not smaller): below that the month
            // caption ("August 2026") collides with the prev/next chevron
            // buttons, since the calendar's total width tracks 7x this value.
            '--rdp-day-height': 'clamp(2.25rem, 11cqw, 2.75rem)',
            '--rdp-day-width': 'clamp(2.25rem, 11cqw, 2.75rem)',
          } as React.CSSProperties
        }
      >
        <DayPicker
          showOutsideDays
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
