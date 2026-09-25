/**
 * Commands sent to the open map canvas from outside it (e.g. the command palette).
 * The canvas owns selection and placement, so it performs them itself.
 */
export type MapCommand =
  | { type: 'create-node'; templateId?: string }
  | { type: 'navigate-up' }
  /** Select a node of the open map and pan onto it. */
  | { type: 'focus-node'; nodeId: string }

const EVENT = 'nebuleuse:map-command'

export function sendMapCommand(command: MapCommand) {
  window.dispatchEvent(new CustomEvent<MapCommand>(EVENT, { detail: command }))
}

export function onMapCommand(handler: (command: MapCommand) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<MapCommand>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
