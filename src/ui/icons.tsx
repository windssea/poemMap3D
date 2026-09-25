const PATHS = {
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5.2 12.2L21 21',
  trail: 'M4 18c3-6 6 2 9-4s4-6 7-8M4 18h.01M20 6h.01',
  play: 'M8 5l11 7-11 7z',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  stop: 'M6 6h12v12H6z',
  close: 'M6 6l12 12M18 6L6 18',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L5 8.5 3 8l-1 3 2 1v2l-2 1 1 3 2-.5 1.5 1.5-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
  chevron: 'M6 15l6-6 6 6',
  bug: 'M9 7a3 3 0 0 1 6 0M6 11h12M6 15h12M8 7h8v10a4 4 0 0 1-8 0zM4 9l3 2M20 9l-3 2M4 19l3-2M20 19l-3-2',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}
