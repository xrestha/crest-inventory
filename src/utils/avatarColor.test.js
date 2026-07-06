import { getInitials, avatarColorFor, contrastRatio, relativeLuminance } from './avatarColor'

describe('getInitials', () => {
  test('two-word name uses first letter of each word', () => {
    expect(getInitials('Ananda Shrestha')).toBe('AS')
  })

  test('three-word name uses first and last word only', () => {
    expect(getInitials('Ram Bahadur Thapa')).toBe('RT')
  })

  test('single-word name falls back to its first two characters', () => {
    expect(getInitials('Sarita')).toBe('SA')
  })

  test('empty/missing name returns a placeholder', () => {
    expect(getInitials('')).toBe('?')
    expect(getInitials(undefined)).toBe('?')
  })

  test('is case-insensitive on input, always uppercase output', () => {
    expect(getInitials('jeevan gurung')).toBe('JG')
  })
})

describe('avatarColorFor', () => {
  test('the same id always yields the same color', () => {
    const a = avatarColorFor('11111111-1111-1111-1111-111111111111', true)
    const b = avatarColorFor('11111111-1111-1111-1111-111111111111', true)
    expect(a).toEqual(b)
  })

  test('different ids can yield different colors (not everyone collapses to one slot)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const bgColors = new Set(ids.map(id => avatarColorFor(id, true).bg))
    expect(bgColors.size).toBeGreaterThan(1)
  })

  test('dark and light surfaces resolve to different hex values for the same id', () => {
    const dark = avatarColorFor('same-id', true)
    const light = avatarColorFor('same-id', false)
    expect(dark.bg).not.toBe(light.bg)
  })

  test('picked text color always has decent contrast against its own background', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    for (const isDark of [true, false]) {
      for (const id of ids) {
        const { bg, fg } = avatarColorFor(id, isDark)
        expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(contrastRatio(bg, fg === '#ffffff' ? '#0b0b0b' : '#ffffff'))
      }
    }
  })
})

describe('relativeLuminance / contrastRatio', () => {
  test('white has higher luminance than black', () => {
    expect(relativeLuminance('#ffffff')).toBeGreaterThan(relativeLuminance('#000000'))
  })

  test('black-on-white contrast ratio is the maximum, 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  test('a color against itself has a contrast ratio of 1', () => {
    expect(contrastRatio('#2a78d6', '#2a78d6')).toBeCloseTo(1, 5)
  })
})
