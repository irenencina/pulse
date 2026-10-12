import { describe, expect, it } from 'vitest'
import { movePlugin, orderedPlugins } from './types'

describe('plug-in order', () => {
  it('lists every plug-in once, adding new ones at the end', () => {
    expect(orderedPlugins(['pluginPlayground', 'pluginPlayground', 'pluginGifts', 'nope'])).toEqual(['pluginPlayground', 'pluginWishlist'])
    expect(orderedPlugins(undefined)).toEqual(['pluginWishlist', 'pluginPlayground'])
  })

  it('moves one up or down, and stops at the ends', () => {
    expect(movePlugin(undefined, 'pluginPlayground', -1)).toEqual(['pluginPlayground', 'pluginWishlist'])
    expect(movePlugin(undefined, 'pluginWishlist', -1)).toEqual(['pluginWishlist', 'pluginPlayground'])
  })
})
