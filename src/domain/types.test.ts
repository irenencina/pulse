import { describe, expect, it } from 'vitest'
import { movePlugin, orderedPlugins } from './types'

describe('plug-in order', () => {
  it('lists every plug-in once, adding new ones at the end', () => {
    expect(orderedPlugins(['pluginPlayground', 'pluginPlayground', 'pluginGifts', 'nope'])).toEqual(['pluginPlayground', 'pluginWishlist', 'pluginResale'])
    expect(orderedPlugins(undefined)).toEqual(['pluginWishlist', 'pluginResale', 'pluginPlayground'])
    // A saved order from before Resale: it joins at the end.
    expect(orderedPlugins(['pluginWishlist', 'pluginPlayground'])).toEqual(['pluginWishlist', 'pluginPlayground', 'pluginResale'])
  })

  it('moves one up or down, and stops at the ends', () => {
    expect(movePlugin(undefined, 'pluginPlayground', -1)).toEqual(['pluginWishlist', 'pluginPlayground', 'pluginResale'])
    expect(movePlugin(undefined, 'pluginWishlist', -1)).toEqual(['pluginWishlist', 'pluginResale', 'pluginPlayground'])
  })
})
