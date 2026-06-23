import { afterEach, describe, expect, it } from 'vitest'

import { getTelluxAssetUrl, telluxConfig } from '../config'

describe('getTelluxAssetUrl', () => {
  afterEach(() => {
    telluxConfig.baseUrl = ''
  })

  it('returns the upstream asset url when baseUrl is empty', () => {
    const defaultUrl = 'https://example.com/assets/stars.bin'

    telluxConfig.baseUrl = '   '

    expect(getTelluxAssetUrl(defaultUrl)).toBe(defaultUrl)
  })

  it('resolves the asset filename under the configured baseUrl', () => {
    telluxConfig.baseUrl = '/tellux-assets'

    expect(getTelluxAssetUrl('https://example.com/assets/stbn.bin?version=1#hash')).toBe(
      '/tellux-assets/stbn.bin'
    )
  })

  it('keeps a single slash between baseUrl and asset filename', () => {
    telluxConfig.baseUrl = '/tellux-assets/'

    expect(getTelluxAssetUrl('shape_detail.bin')).toBe('/tellux-assets/shape_detail.bin')
  })
})
