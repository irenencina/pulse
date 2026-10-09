import { describe, expect, it } from 'vitest'
import { movePlugin, orderedPlugins } from './types'

describe('plug-in order', () => {
  it('lists every plug-in once, adding new ones at the end', () => {
    expect(orderedPlugins(['pluginPlayground', 'pluginPlayground', 'nope'])).toEqual(['pluginPlayground', 'pluginWorth', 'pluginWishlist', 'pluginGifts'])
    expect(orderedPlugins(undefined)).toEqual(['pluginWorth', 'pluginWishlist', 'pluginGifts', 'pluginPlayground'])
  })

  it('moves one up or down, and stops at the ends', () => {
    expect(movePlugin(undefined, 'pluginPlayground', -1)).toEqual(['pluginWorth', 'pluginWishlist', 'pluginPlayground', 'pluginGifts'])
    expect(movePlugin(undefined, 'pluginWorth', -1)).toEqual(['pluginWorth', 'pluginWishlist', 'pluginGifts', 'pluginPlayground'])
  })
})
