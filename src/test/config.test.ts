import { afterEach, describe, expect, it } from 'vitest'

import { getTelluxAssetUrl, telluxConfig } from '../config'
import { telluxAssetUrls } from '../assets'

describe('getTelluxAssetUrl', () => {
  afterEach(() => {
    telluxConfig.baseUrl = ''
  })

  it('returns the packaged asset url when baseUrl is empty', () => {
    telluxConfig.baseUrl = '   '

    expect(getTelluxAssetUrl('stars')).toBe(telluxAssetUrls.stars)
  })

  it('resolves the asset filename under the configured baseUrl', () => {
    telluxConfig.baseUrl = '/tellux-assets'

    expect(getTelluxAssetUrl('stbn')).toBe('/tellux-assets/stbn.bin')
  })

  it('keeps a single slash between baseUrl and asset filename', () => {
    telluxConfig.baseUrl = '/tellux-assets/'

    expect(getTelluxAssetUrl('shapeDetail')).toBe('/tellux-assets/shape_detail.bin')
  })
})
