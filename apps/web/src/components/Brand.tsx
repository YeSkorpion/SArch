import { Link } from 'react-router'

export function Brand({ mark = false, to }: { mark?: boolean; to?: string }) {
  const label = to ? '' : 'SArch'
  const image = mark ? (
    <img src="/mark.png" alt={label} className="h-7 w-7 max-w-none shrink-0" />
  ) : (
    <span className="inline-flex shrink-0">
      <img src="/logo.png" alt={label} className="h-8 w-auto max-w-none dark:hidden" />
      <img src="/logo-dark.png" alt={label} className="hidden h-8 w-auto max-w-none dark:block" />
    </span>
  )
  if (!to) return image
  return (
    <Link to={to} aria-label="SArch" className="inline-flex shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {image}
    </Link>
  )
}
