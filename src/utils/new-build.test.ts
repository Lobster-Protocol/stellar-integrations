import { describe, it, expect, vi, beforeEach } from 'vitest'
import { newBuildState, reloadForNewBuild } from './new-build'

describe('reloadForNewBuild', () => {
  beforeEach(() => sessionStorage.clear())

  it('loads the page again when a file of the old build is gone', () => {
    const reload = vi.fn()
    expect(reloadForNewBuild(reload, 1_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(newBuildState()).toBe('reloading')
  })

  it('does not reload twice within a minute', () => {
    const reload = vi.fn()
    reloadForNewBuild(reload, 1_000_000)
    expect(reloadForNewBuild(reload, 1_000_000 + 59_000)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
    expect(newBuildState()).toBe('stale')
  })

  it('reloads again for a later deploy', () => {
    const reload = vi.fn()
    reloadForNewBuild(reload, 1_000_000)
    expect(reloadForNewBuild(reload, 1_000_000 + 61_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload while offline', () => {
    const reload = vi.fn()
    const online = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false)
    expect(reloadForNewBuild(reload, 1_000_000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    online.mockRestore()
  })

  it('leaves the error on screen when session storage is blocked', () => {
    const reload = vi.fn()
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(reloadForNewBuild(reload, 1_000_000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(newBuildState()).toBe('stale')
    get.mockRestore()
  })
})
