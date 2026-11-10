/** A source of payment notifications that can be turned on or off in Settings. */
export interface PaymentApp {
  id: string
  name: string
  /** The Android package names it can have (the messages app has a few, one per phone maker). */
  packages: string[]
  /** A messages app: only messages that read like a bank's (an account, a card, UPI) count, and nothing unread is kept from it. */
  sms?: boolean
  /** Whether it is on when notification access is first given. */
  defaultOn: boolean
  /** One line under its switch. */
  detail: string
}

/** The payment apps the phone's notifications are read from, once the person allows it. The package names are Android's own. */
export const PAYMENT_APPS: PaymentApp[] = [
  { id: 'phonepe', name: 'PhonePe', packages: ['com.phonepe.app'], defaultOn: true, detail: 'Offers to add what you pay or receive in PhonePe.' },
  { id: 'gpay', name: 'Google Pay', packages: ['com.google.android.apps.nbu.paisa.user'], defaultOn: true, detail: 'Offers to add what you pay or receive in Google Pay.' },
  { id: 'cred', name: 'CRED', packages: ['com.dreamplug.androidapp'], defaultOn: true, detail: 'Offers to add the bill payments you make in CRED.' },
  { id: 'paytm', name: 'Paytm', packages: ['net.one97.paytm'], defaultOn: true, detail: 'Offers to add what you pay or receive in Paytm.' },
  { id: 'bhim', name: 'BHIM', packages: ['in.org.npci.upiapp'], defaultOn: true, detail: 'Offers to add what you pay or receive in BHIM.' },
  {
    id: 'messages',
    name: 'Bank messages',
    packages: ['com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms'],
    sms: true,
    defaultOn: false,
    detail: 'Reads the bank’s debit and credit messages in your messages app. Other messages are ignored, and none is kept.',
  },
]

/** What the Android side keeps for each app to listen to. */
export interface NativeApp {
  package: string
  name: string
  sms: boolean
}

/** The list to hand the Android side for the apps that are switched on: one entry per package. */
export function toNativeApps(ids: string[]): NativeApp[] {
  return PAYMENT_APPS.filter((a) => ids.includes(a.id)).flatMap((a) => a.packages.map((p) => ({ package: p, name: a.name, sms: !!a.sms })))
}

/** Which apps are switched on, from the packages the Android side has. */
export function idsFromNative(apps: { package: string }[]): string[] {
  return PAYMENT_APPS.filter((a) => a.packages.some((p) => apps.some((x) => x.package === p))).map((a) => a.id)
}

/** The apps that are on until the person chooses. */
export const DEFAULT_APP_IDS = PAYMENT_APPS.filter((a) => a.defaultOn).map((a) => a.id)

/** What to call the app a notification came from. */
export function appName(packageName: string): string {
  return PAYMENT_APPS.find((a) => a.packages.includes(packageName))?.name ?? 'a payment app'
}
