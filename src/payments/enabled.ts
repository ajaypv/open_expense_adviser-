// Payment pop-ups are switched off in this build. Reading another app's notifications needs the
// phone's Notification access, and Google Play Protect blocks installing an app that asks for it
// when it comes from outside the Play Store. To bring the feature back, set this to true and put the
// PaymentNotificationListener and PaymentActionReceiver entries back into AndroidManifest.xml.
export const PAYMENT_POPUPS_ENABLED = false
