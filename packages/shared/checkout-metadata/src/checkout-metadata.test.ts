import {
  encodeItems,
  decodeItems,
  assertWithinStripeLimits,
  CheckoutMetadataError,
  STRIPE_METADATA_VALUE_LIMIT,
  type CartItem,
} from './checkout-metadata'

/**
 * A fourteen item catalogue with realistically shaped product ids, which is the size of the
 * real vendor's menu. Both halves of that matter: the metadata limit bug reached production
 * because fixtures held one or two items, and it would still have been invisible with
 * fourteen short ids, because real ids are uuids and it is their length that pushes the
 * encoding past Stripe's limit at around nine items.
 */
const PRODUCTION_SCALE_CART: CartItem[] = Array.from({ length: 14 }, (_, index) => ({
  productId: `prod_1f8418a9-527f-4856-b231-e523f64680${String(index).padStart(2, '0')}`,
  quantity: (index % 3) + 1,
  price: 850 + index * 25,
}))

describe('checkout metadata round trip', () => {
  it('should return the same items that were encoded', () => {
    const items: CartItem[] = [
      { productId: 'prod_sourdough', quantity: 2, price: 650 },
      { productId: 'prod_brownie', quantity: 1, price: 400 },
    ]

    expect(decodeItems(encodeItems(items))).toEqual(items)
  })

  it('should survive a production scale cart that spans multiple chunks', () => {
    const metadata = encodeItems(PRODUCTION_SCALE_CART)

    expect(Number(metadata.items_chunks)).toBeGreaterThan(1)
    expect(decodeItems(metadata)).toEqual(PRODUCTION_SCALE_CART)
  })

  it('should keep every chunk within the limit Stripe enforces', () => {
    const metadata = encodeItems(PRODUCTION_SCALE_CART)

    for (const [key, value] of Object.entries(metadata)) {
      expect(value.length).toBeLessThanOrEqual(STRIPE_METADATA_VALUE_LIMIT)
      expect(key).toBeTruthy()
    }
  })

  it('should declare a chunk count matching the chunks actually written', () => {
    const metadata = encodeItems(PRODUCTION_SCALE_CART)
    const declared = Number(metadata.items_chunks)
    const written = Object.keys(metadata).filter((key) => key.startsWith('items_') && key !== 'items_chunks')

    expect(written).toHaveLength(declared)
  })

  it('should round trip an empty cart without inventing a chunk', () => {
    const metadata = encodeItems([])

    expect(metadata.items_chunks).toBe('0')
    expect(Object.keys(metadata)).toEqual(['items_chunks'])
    expect(decodeItems(metadata)).toEqual([])
  })

  it('should round trip a cart sitting exactly on a chunk boundary', () => {
    // Build entries that pack the first chunk to within a character of the limit, so the
    // boundary arithmetic is exercised rather than assumed.
    const entry = { productId: 'p'.repeat(40), quantity: 1, price: 100 }
    const perEntry = `${entry.productId}:1:100`.length + 1
    const countThatFills = Math.floor(STRIPE_METADATA_VALUE_LIMIT / perEntry)
    const items: CartItem[] = Array.from({ length: countThatFills + 1 }, (_, index) => ({
      productId: `${'p'.repeat(38)}${String(index).padStart(2, '0')}`,
      quantity: 1,
      price: 100,
    }))

    const metadata = encodeItems(items)

    for (const value of Object.values(metadata)) {
      expect(value.length).toBeLessThanOrEqual(STRIPE_METADATA_VALUE_LIMIT)
    }
    expect(decodeItems(metadata)).toEqual(items)
  })
})

describe('encoding rejects what cannot be represented', () => {
  it('should refuse a product id containing the entry separator', () => {
    expect(() => encodeItems([{ productId: 'prod|bad', quantity: 1, price: 100 }])).toThrow(
      CheckoutMetadataError,
    )
  })

  it('should refuse a product id containing the field separator', () => {
    expect(() => encodeItems([{ productId: 'prod:bad', quantity: 1, price: 100 }])).toThrow(
      CheckoutMetadataError,
    )
  })

  it('should refuse a quantity below one', () => {
    expect(() => encodeItems([{ productId: 'prod_a', quantity: 0, price: 100 }])).toThrow(
      /positive integer/,
    )
  })

  it('should refuse a negative price', () => {
    expect(() => encodeItems([{ productId: 'prod_a', quantity: 1, price: -1 }])).toThrow(
      /non negative integer/,
    )
  })

  it('should refuse a single item too large to send at all', () => {
    const oversized = { productId: 'p'.repeat(STRIPE_METADATA_VALUE_LIMIT + 10), quantity: 1, price: 100 }

    expect(() => encodeItems([oversized])).toThrow(/cannot be sent at all/)
  })
})

describe('decoding treats Stripe metadata as untrusted', () => {
  it('should refuse metadata with no chunk count', () => {
    expect(() => decodeItems({ items_0: 'prod_a:1:100' })).toThrow(/no items_chunks/)
  })

  it('should refuse a chunk count that is not a number', () => {
    expect(() => decodeItems({ items_chunks: 'lots' })).toThrow(/not a chunk count/)
  })

  it('should refuse metadata declaring more chunks than it carries', () => {
    expect(() => decodeItems({ items_chunks: '2', items_0: 'prod_a:1:100' })).toThrow(
      /items_1 is missing/,
    )
  })

  it('should refuse an entry with the wrong number of fields', () => {
    expect(() => decodeItems({ items_chunks: '1', items_0: 'prod_a:1' })).toThrow(
      /three fields/,
    )
  })

  it('should refuse an entry with an empty product id', () => {
    expect(() => decodeItems({ items_chunks: '1', items_0: ':1:100' })).toThrow(/empty product id/)
  })

  it('should refuse an entry with a zero quantity', () => {
    expect(() => decodeItems({ items_chunks: '1', items_0: 'prod_a:0:100' })).toThrow(
      /non positive quantity/,
    )
  })
})

describe('assertWithinStripeLimits', () => {
  it('should accept metadata that is within the limit', () => {
    expect(() => assertWithinStripeLimits({ vendorSlug: 'sweet-sin', ...encodeItems(PRODUCTION_SCALE_CART) })).not.toThrow()
  })

  it('should name the offending key when a value is too long', () => {
    expect(() => assertWithinStripeLimits({ deliveryNotes: 'x'.repeat(STRIPE_METADATA_VALUE_LIMIT + 1) })).toThrow(
      /deliveryNotes/,
    )
  })
})
