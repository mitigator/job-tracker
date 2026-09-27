import { avatarColour, initials } from '../utils'

interface CompanyAvatarProps {
  company: string | null
  size?: 'sm' | 'lg'
}

/** Coloured initials square; the colour is stable per company name. */
export function CompanyAvatar({ company, size = 'sm' }: CompanyAvatarProps) {
  const sizing = size === 'lg' ? 'h-12 w-12 rounded-xl text-base' : 'h-9 w-9 rounded-lg text-xs'
  return (
    <div
      className={`${sizing} ${avatarColour(company ?? '')} flex shrink-0 items-center justify-center font-display font-bold tracking-tight`}
      aria-hidden
    >
      {initials(company)}
    </div>
  )
}
