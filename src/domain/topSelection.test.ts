import { describe, expect, it } from 'vitest'
import { selectTop } from './topSelection'

const ascending = (left: number, right: number): number => left - right

describe('selectTop', () => {
  it('matches a full sort truncated to the limit', () => {
    const items = [8, 3, 9, 1, 7, 2, 6, 5, 4]

    expect(selectTop(items, 4, ascending)).toEqual(
      [...items].sort(ascending).slice(0, 4),
    )
  })

  it('returns everything when the collection is smaller than the limit', () => {
    expect(selectTop([2, 1], 10, ascending)).toEqual([1, 2])
  })

  it('applies the filter before selecting', () => {
    const items = [8, 3, 9, 1, 7, 2]

    expect(
      selectTop(items, 3, ascending, (value) => value % 2 === 1),
    ).toEqual([1, 3, 7])
  })

  it('preserves input order between items that compare equal', () => {
    const items = [
      { id: 'first', rank: 1 },
      { id: 'second', rank: 1 },
      { id: 'third', rank: 1 },
    ]

    expect(
      selectTop(items, 2, (left, right) => left.rank - right.rank)
        .map((item) => item.id),
    ).toEqual(['first', 'second'])
  })

  it('returns an empty list for a non-positive limit', () => {
    expect(selectTop([1, 2, 3], 0, ascending)).toEqual([])
  })

  it('does not mutate the source collection', () => {
    const items = [3, 1, 2]
    selectTop(items, 2, ascending)

    expect(items).toEqual([3, 1, 2])
  })
})
