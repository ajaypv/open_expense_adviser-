/** Injected at build time by vite.config.ts. */
declare const __APP_VERSION__: string
declare const __APP_BUILD__: string
declare const __APP_BUILD_DATE__: string

/** The Contact Picker API (Chrome on Android). The person chooses; the page only receives what they chose. */
interface ContactInfo {
  name?: string[]
  tel?: string[]
}
interface ContactsManager {
  select(properties: ('name' | 'tel')[], options?: { multiple?: boolean }): Promise<ContactInfo[]>
}
interface Navigator {
  contacts?: ContactsManager
}
