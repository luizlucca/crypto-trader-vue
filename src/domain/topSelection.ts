/**
 * Picks the `limit` best items without sorting the whole collection.
 *
 * The market sidebar shows 14 rows out of a catalog that reaches a few
 * thousand pairs, and it re-evaluates on every keystroke — on the same thread
 * that paints the chart and commits the order book. Copying and sorting the
 * full array to throw away 99% of it is the kind of avoidable work that made
 * the renderer contend with itself.
 *
 * Cost is O(n) comparisons plus at most O(n · limit) shifts inside a buffer of
 * `limit` entries, and it allocates only that buffer. `compare` keeps the same
 * meaning as `Array.prototype.sort`: negative means "comes first".
 */
export function selectTop<T>(
  items: readonly T[],
  limit: number,
  compare: (left: T, right: T) => number,
  include?: (item: T) => boolean,
): T[] {
  if (limit < 1) {
    return []
  }

  const selected: T[] = []
  for (const item of items) {
    if (include && !include(item)) {
      continue
    }

    const isFull = selected.length >= limit
    if (isFull && compare(item, selected[selected.length - 1]) >= 0) {
      continue
    }

    let position = selected.length
    while (position > 0 && compare(item, selected[position - 1]) < 0) {
      position -= 1
    }
    selected.splice(position, 0, item)
    if (selected.length > limit) {
      selected.pop()
    }
  }
  return selected
}
