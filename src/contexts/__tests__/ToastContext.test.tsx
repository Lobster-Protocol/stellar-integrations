import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

import { ToastProvider, useToast } from '../ToastContext'

// a tiny consumer so we can raise toasts the way the app does, through the hook.
function Harness() {
  const t = useToast()
  return (
    <div>
      <button onClick={() => t.success('saved ok')}>ok</button>
      <button onClick={() => t.error('it failed')}>err</button>
    </div>
  )
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ToastProvider dwell (M6)', () => {
  it('dismisses a success toast at 4.5s', () => {
    renderHarness()
    act(() => fireEvent.click(screen.getByText('ok')))
    expect(screen.getByText('saved ok')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4500))
    expect(screen.queryByText('saved ok')).not.toBeInTheDocument()
  })

  it('keeps an error toast up longer - 9s, not 4.5s - so it can be read', () => {
    renderHarness()
    act(() => fireEvent.click(screen.getByText('err')))
    expect(screen.getByText('it failed')).toBeInTheDocument()
    // a success would already be gone here; an error must not be
    act(() => vi.advanceTimersByTime(4500))
    expect(screen.getByText('it failed')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4500))
    expect(screen.queryByText('it failed')).not.toBeInTheDocument()
  })
})

describe('ToastProvider hover-to-pause (M6)', () => {
  it('holds a toast while the pointer is over it, then re-arms on leave', () => {
    renderHarness()
    act(() => fireEvent.click(screen.getByText('ok')))
    const toast = screen.getByRole('status')

    // hovering clears the dismiss timer: it must survive well past its dwell
    act(() => fireEvent.mouseEnter(toast))
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByText('saved ok')).toBeInTheDocument()

    // leaving re-arms it, so it goes after the normal dwell
    act(() => fireEvent.mouseLeave(toast))
    act(() => vi.advanceTimersByTime(4500))
    expect(screen.queryByText('saved ok')).not.toBeInTheDocument()
  })
})
