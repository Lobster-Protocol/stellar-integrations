import { useId, useState } from 'react'

// wraps a label and shows a one-line plain-language note on hover or focus, so
// the dashboard reads without a finance glossary open in another tab. no portal
// and no dep - the bubble is just absolutely positioned above the label.
// align 'center' keeps it from running off the right edge inside the metric
// grids; 'start' opens rightward where the row has room.
export default function Hint({
  label,
  text,
  align = 'start',
}: {
  label: string
  text: string
  align?: 'start' | 'center'
}) {
  const [show, setShow] = useState(false)
  const id = useId()
  const pos =
    align === 'center'
      ? 'left-1/2 -translate-x-1/2 max-w-[min(14rem,calc(100vw-1.5rem))]'
      : 'left-0'
  return (
    <span
      className="relative inline-flex items-center gap-1 cursor-help"
      tabIndex={0}
      aria-describedby={show ? id : undefined}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {label}
      <span aria-hidden className="text-text-muted/70 text-[10px] leading-none">&#9432;</span>
      {show && (
        <span
          id={id}
          role="tooltip"
          className={`absolute bottom-full ${pos} mb-1.5 z-30 w-56 rounded-lg bg-text px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal leading-snug text-white shadow-lg`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
