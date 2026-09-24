const body =
  'M6120 8034c-901-85-1007-107-1237-266-67-47-203-178-203-196 0-5 46-17 103-26 395-70 783-216 925-351 216-204 215-493-3-913-250-480-1184-1596-2674-3197-319-343-1215-1279-1350-1410-28-27-51-55-51-62 0-11 153-13 841-11l842 3 94 100c897 948 1802 2056 2298 2812 103 157 107 161 150 141 40-18 33-38-98-288-323-616-996-1636-1654-2508-101-133-181-247-178-252 10-16 1577-13 1597 3 9 6 37 71 61 142 176 514 410 1022 569 1237 252 340 521 278 623-144 47-193 58-575 21-695-55-176-164-239-461-268-182-18-192-20-199-43-25-81-56-219-52-229 5-12 2161-19 2208-7 14 4 12 19-23 122-21 64-45 122-52 129-8 8-90 18-237 28-387 27-525 50-632 107-213 113-256 310-213 958 38 563 107 1083 236 1777l22 122 111 3 111 3 3 695c4 989-15 1193-149 1548-232 617-769 990-1349 936zm220-226c70-32 119-74 161-140l33-50-24-44c-30-58-98-120-168-152-83-39-231-39-314 0-98 46-188 155-174 211 8 32 95 129 142 158 92 57 243 64 344 17z'
const pupil = 'M6123 7741c-54-25-88-86-80-144 24-176 287-162 287 15 0 110-106 176-207 129z'

export function RavenMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 667 644" fill="currentColor" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g transform="translate(-163 803.889) scale(0.1 -0.1)">
        <path d={body} />
        <path d={pupil} />
      </g>
    </svg>
  )
}

export function RavenBadge({ className = 'h-8 w-8', glyph = 'h-[62%] w-[62%]' }: { className?: string; glyph?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-[28%] bg-[#dae1fc] text-[#0b0b0e] ${className}`} aria-hidden>
      <RavenMark className={`${glyph} translate-x-[4%] translate-y-[3%]`} />
    </span>
  )
}
