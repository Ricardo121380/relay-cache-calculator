import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

beforeEach(cleanup)

function Fixture() {
  const [value, setValue] = useState('simple')
  return (
    <SegmentedControl
      id="mode-test"
      label="输入模式"
      value={value}
      onChange={setValue}
      options={[
        { value: 'novice', label: '小白模式' },
        { value: 'simple', label: '简易模式' },
        { value: 'advanced', label: '高级模式' },
      ]}
      material="heavy"
      size="compact"
    />
  )
}

describe('SegmentedControl', () => {
  it('保持 radiogroup/radio 语义并同步滑动指示器', async () => {
    const user = userEvent.setup()
    render(<Fixture />)

    const group = screen.getByRole('radiogroup', { name: '输入模式' })
    expect(screen.getByRole('radio', { name: '简易模式' })).toBeChecked()
    expect(group).toHaveStyle({ '--segment-index': '1' })

    await user.click(screen.getByRole('radio', { name: '高级模式' }))
    expect(screen.getByRole('radio', { name: '高级模式' })).toBeChecked()
    expect(group).toHaveStyle({ '--segment-index': '2' })
  })

  it('支持方向键循环定位', async () => {
    const user = userEvent.setup()
    render(<Fixture />)

    const current = screen.getByRole('radio', { name: '简易模式' })
    current.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '高级模式' })).toBeChecked()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '小白模式' })).toBeChecked()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: '高级模式' })).toBeChecked()
  })
})
