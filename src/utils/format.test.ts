import { describe, expect, it } from 'vitest'
import { formatTokensCompact } from './format'

describe('formatTokensCompact', () => {
  it('小于 1K 的负数只显示一个负号', () => {
    expect(formatTokensCompact('-42')).toBe('-42')
  })
})
