import {
  siAirtel,
  siApple,
  siApplemusic,
  siAudible,
  siBigbasket,
  siBitwarden,
  siBookmyshow,
  siClaude,
  siCoursera,
  siCrunchyroll,
  siDeezer,
  siDropbox,
  siDuolingo,
  siEvernote,
  siExpressvpn,
  siGithub,
  siGoogle,
  siGoogledrive,
  siGooglepay,
  siGoogleplay,
  siGrammarly,
  siHbo,
  siHeadspace,
  siIcloud,
  siJio,
  siNetflix,
  siNordvpn,
  siNotion,
  siPaytm,
  siPeloton,
  siPerplexity,
  siPhonepe,
  siPlaystation,
  siProton,
  siSkillshare,
  siSoundcloud,
  siSpotify,
  siSteam,
  siStrava,
  siSwiggy,
  siTidal,
  siTodoist,
  siUber,
  siUdemy,
  siVodafone,
  siYoutube,
  siYoutubemusic,
  siZomato,
  siZoom,
  si1password,
  type SimpleIcon,
} from 'simple-icons'
import type { RecurringTag } from '../db/schema'
import { adobe, amazonPrime, googleOne, linkedin, microsoft, openai, type RawIcon } from './brandIcons'

/**
 * The well-known services a regular payment is often for (Netflix, Spotify, Jio, Airtel, YouTube and so on), each shown as its own logo so a
 * payment is known at a glance in a list or on the calendar. The logos are from the Simple Icons library (the brands' own marks, one colour each,
 * free to use), drawn in the brand's colour on a white tile. A payment is matched by what it is called; one that is not matched keeps the icon
 * for its kind. A few the library no longer has (Google One, Microsoft, Adobe, LinkedIn, OpenAI, Amazon Prime) come from the Iconify sets, copied
 * whole into brandIcons.ts; those in several colours keep them. Disney+ Hotstar is in neither, so it keeps the icon for its kind.
 */
export interface Brand {
  id: string
  title: string
  /** The tile the logo sits on: white, so every brand's colour reads the same way. */
  bg: string
  /** The brand's colour, for the logo. */
  colour: string
  /** The logo's outline, in a 24 by 24 box (for one drawn as a single path). */
  path?: string
  /** Or the logo as the inside of an SVG, with the size of its box, for one in several colours. */
  raw?: RawIcon
  /** The tile is light, so it gets a thin outline to stay visible on a light page. */
  light: true
}

const TILE = '#FFFFFF'

/** A logo's colour, or a dark ink when the brand's own is too pale to read on white. */
function colourOf(icon: SimpleIcon): string {
  const n = parseInt(icon.hex, 16)
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum > 0.85 ? '#111111' : `#${icon.hex}`
}

const brand = (icon: SimpleIcon, id = icon.slug): Brand => ({ id, title: icon.title, bg: TILE, colour: colourOf(icon), path: icon.path, light: true })
const copied = (id: string, title: string, raw: RawIcon, colour = '#111111'): Brand => ({ id, title, bg: TILE, colour, raw, light: true })

/** In the order they are tried, so the more particular name comes before the one it contains (YouTube Music before YouTube). */
const BRANDS: { test: RegExp; brand: Brand }[] = [
  { test: /netflix/, brand: brand(siNetflix) },
  { test: /spotify/, brand: brand(siSpotify) },
  { test: /youtube\s*music/, brand: brand(siYoutubemusic) },
  { test: /youtube/, brand: brand(siYoutube) },
  { test: /apple\s*music/, brand: brand(siApplemusic) },
  { test: /icloud/, brand: brand(siIcloud) },
  { test: /\bapple\b/, brand: brand(siApple) },
  { test: /google\s*one/, brand: copied('googleone', 'Google One', googleOne) },
  { test: /google\s*play/, brand: brand(siGoogleplay) },
  { test: /google\s*drive/, brand: brand(siGoogledrive) },
  { test: /google\s*pay|\bgpay\b/, brand: brand(siGooglepay) },
  { test: /\bgoogle\b/, brand: brand(siGoogle) },
  { test: /prime\s*video|amazon\s*prime|\bprime\b/, brand: copied('amazonprime', 'Amazon Prime', amazonPrime, '#00A8E1') },
  { test: /microsoft|office\s*365|\bm365\b/, brand: copied('microsoft', 'Microsoft', microsoft) },
  { test: /adobe/, brand: copied('adobe', 'Adobe', adobe) },
  { test: /linkedin/, brand: copied('linkedin', 'LinkedIn', linkedin) },
  { test: /chatgpt|openai/, brand: copied('openai', 'OpenAI', openai) },
  { test: /airtel/, brand: brand(siAirtel) },
  { test: /\bjio/, brand: brand(siJio) },
  { test: /vodafone/, brand: brand(siVodafone) },
  { test: /swiggy/, brand: brand(siSwiggy) },
  { test: /zomato/, brand: brand(siZomato) },
  { test: /\buber\b/, brand: brand(siUber) },
  { test: /paytm/, brand: brand(siPaytm) },
  { test: /phonepe/, brand: brand(siPhonepe) },
  { test: /bookmyshow/, brand: brand(siBookmyshow) },
  { test: /bigbasket/, brand: brand(siBigbasket) },
  { test: /dropbox/, brand: brand(siDropbox) },
  { test: /notion/, brand: brand(siNotion) },
  { test: /github/, brand: brand(siGithub) },
  { test: /claude|anthropic/, brand: brand(siClaude) },
  { test: /perplexity/, brand: brand(siPerplexity) },
  { test: /duolingo/, brand: brand(siDuolingo) },
  { test: /crunchyroll/, brand: brand(siCrunchyroll) },
  { test: /\bhbo\b/, brand: brand(siHbo) },
  { test: /\bsteam\b/, brand: brand(siSteam) },
  { test: /playstation|\bpsn\b/, brand: brand(siPlaystation) },
  { test: /\bzoom\b/, brand: brand(siZoom) },
  { test: /audible/, brand: brand(siAudible) },
  { test: /tidal/, brand: brand(siTidal) },
  { test: /deezer/, brand: brand(siDeezer) },
  { test: /soundcloud/, brand: brand(siSoundcloud) },
  { test: /1password/, brand: brand(si1password) },
  { test: /nordvpn/, brand: brand(siNordvpn) },
  { test: /expressvpn/, brand: brand(siExpressvpn) },
  { test: /proton/, brand: brand(siProton) },
  { test: /bitwarden/, brand: brand(siBitwarden) },
  { test: /evernote/, brand: brand(siEvernote) },
  { test: /todoist/, brand: brand(siTodoist) },
  { test: /grammarly/, brand: brand(siGrammarly) },
  { test: /coursera/, brand: brand(siCoursera) },
  { test: /udemy/, brand: brand(siUdemy) },
  { test: /skillshare/, brand: brand(siSkillshare) },
  { test: /headspace/, brand: brand(siHeadspace) },
  { test: /strava/, brand: brand(siStrava) },
  { test: /peloton/, brand: brand(siPeloton) },
]

/** The brand a payment is for, from what it is called, or null. A loan or money coming in is never one. */
export function brandOf(name: string | undefined, tag?: RecurringTag): Brand | null {
  if (!name || tag === 'loan' || tag === 'income') return null
  const lower = name.toLowerCase()
  return BRANDS.find((b) => b.test.test(lower))?.brand ?? null
}

/** The logo of a brand, drawn to `size`. Decoration: the name is always written beside it. */
export function BrandMark({ brand: b, size }: { brand: Brand; size: number }) {
  if (b.raw) {
    // A copied logo is the inside of an SVG from the library, drawn as it is, in its own colours.
    return <svg aria-hidden="true" viewBox={`0 0 ${b.raw.width} ${b.raw.height}`} width={size} height={size} className="block" fill={b.colour} dangerouslySetInnerHTML={{ __html: b.raw.body }} />
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className="block" fill={b.colour}>
      <path d={b.path} />
    </svg>
  )
}
