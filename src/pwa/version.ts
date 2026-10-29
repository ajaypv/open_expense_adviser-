/** Which version of the app is running. The fallbacks only apply where the build globals aren't defined. */
export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__
export const APP_BUILD = typeof __APP_BUILD__ === 'undefined' ? 'local' : __APP_BUILD__
export const APP_BUILD_DATE = typeof __APP_BUILD_DATE__ === 'undefined' ? '' : __APP_BUILD_DATE__
