export function assertOnline(operation: string): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(`Cannot ${operation} while offline. Check your connection and try again.`)
  }
}
