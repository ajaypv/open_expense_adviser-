/**
 * Stands in for a screen while its data is still arriving, so the page has its shape from the first frame
 * instead of a blank space, or a false "nothing here yet". Screen readers hear that it is loading and the
 * screen's name; the grey blocks are only for the eye, and stop pulsing when motion is reduced.
 */
export function ScreenSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="pb-6">
      <h1 className="sr-only">{label}</h1>
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="mt-5 animate-pulse space-y-3 motion-reduce:animate-none">
        <div className="h-8 w-44 rounded-xl bg-surface-2" />
        <div className="h-44 rounded-3xl bg-surface-2" />
        <div className="h-20 rounded-3xl bg-surface-2" />
        <div className="h-20 rounded-3xl bg-surface-2" />
      </div>
    </div>
  )
}
