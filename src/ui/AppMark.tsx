export function AppMark({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      data-mark
      aria-hidden="true"
      className={`app-mark ${className}`}
      style={{ width: size, height: size, maskImage: `url("${import.meta.env.BASE_URL}brand-mark.svg")` }}
    />
  )
}
