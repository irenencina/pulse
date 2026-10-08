import { describe, expect, it } from 'vitest'
import { movePlugin, orderedPlugins } from './types'

describe('plug-in order', () => {
  it('lists every plug-in once, adding new ones at the end', () => {
    expect(orderedPlugins(['pluginPlayground', 'pluginPlayground', 'nope'])).toEqual(['pluginPlayground', 'pluginWishlist', 'pluginGifts'])
    expect(orderedPlugins(undefined)).toEqual(['pluginWishlist', 'pluginGifts', 'pluginPlayground'])
  })

  it('moves one up or down, and stops at the ends', () => {
    expect(movePlugin(undefined, 'pluginPlayground', -1)).toEqual(['pluginWishlist', 'pluginPlayground', 'pluginGifts'])
    expect(movePlugin(undefined, 'pluginWishlist', -1)).toEqual(['pluginWishlist', 'pluginGifts', 'pluginPlayground'])
  })
})
