import type { HomeView } from './HomePager'

/**
 * A line from the bottom bar to the Home pager, which sit far apart in the tree: swiping the bar asks Home to show its
 * Overview or its Timeline. The pager listens while it is on screen; when Home is not on screen the request waits a
 * moment for the pager that is about to be built.
 */
type Listener = (view: HomeView) => void

/** How long a waiting request stays good: long enough for the screen change (and its animation), not for a later visit. */
const WAIT_MS = 2000

const listeners = new Set<Listener>()
let waiting: { view: HomeView; at: number } | null = null

/** Moves the pager on screen to `view`. Does nothing when Home is not showing its pager; returns whether there was one to move. */
export function showHomeView(view: HomeView): boolean {
  listeners.forEach((listen) => listen(view))
  return listeners.size > 0
}

/** For when Home is about to open: the pager built next starts on `view` instead of the Overview. */
export function openHomeOn(view: HomeView): void {
  waiting = { view, at: Date.now() }
}

/** The page a waiting request asked for, if one is still fresh; asking clears it. */
export function takeWaitingHomeView(): HomeView | null {
  const request = waiting
  waiting = null
  return request && Date.now() - request.at < WAIT_MS ? request.view : null
}

/** Listens for requests to move the pager; returns how to stop. */
export function onHomeViewRequest(listen: Listener): () => void {
  listeners.add(listen)
  return () => void listeners.delete(listen)
}
