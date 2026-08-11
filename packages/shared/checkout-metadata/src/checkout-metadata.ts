/**
 * The wire format for cart items carried through Stripe Checkout metadata.
 *
 * This exists because the encoder and the decoder used to live in separate Lambda packages,
 * private to each, so nothing could exercise them together. When the encoder changed to
 * chunked keys and the decoder was left reading the old single key, both sides passed their
 * own tests and every webhook delivery crashed in production. Both halves now live here and
 * are tested as a round trip.
 *
 * Stripe caps a metadata value at 500 characters, which is why items are chunked at all.
 */

/** Stripe rejects any single metadata value longer than this. */
export const STRIPE_METADATA_VALUE_LIMIT = 500

const ENTRY_SEPARATOR = '|'
const FIELD_SEPARATOR = ':'

export interface CartItem {
  productId: string
  quantity: number
  /** Minor units, matching Stripe. */
  price: number
}

/** The chunk keys only. Callers merge these into the wider metadata object. */
export type ItemsMetadata = Record<string, string>

export class CheckoutMetadataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutMetadataError'
  }
}

function encodeEntry(item: CartItem): string {
  const { productId, quantity, price } = item

  if (productId.includes(ENTRY_SEPARATOR) || productId.includes(FIELD_SEPARATOR)) {
    throw new CheckoutMetadataError(
      `product id "${productId}" contains a reserved character (${ENTRY_SEPARATOR} or ${FIELD_SEPARATOR}) and cannot be encoded`,
    )
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CheckoutMetadataError(`quantity for "${productId}" must be a positive integer, got ${quantity}`)
  }
  if (!Number.isInteger(price) || price < 0) {
    throw new CheckoutMetadataError(`price for "${productId}" must be a non negative integer, got ${price}`)
  }

  return `${productId}${FIELD_SEPARATOR}${quantity}${FIELD_SEPARATOR}${price}`
}

/**
 * Pack cart items into chunked metadata values, none exceeding Stripe's limit.
 *
 * An empty cart yields `items_chunks: '0'` and no chunk keys, so the decoder does not go
 * looking for a chunk that was never written.
 */
export function encodeItems(items: readonly CartItem[]): ItemsMetadata {
  const chunks: ItemsMetadata = {}

  if (items.length === 0) {
    chunks.items_chunks = '0'
    return chunks
  }

  let current = ''
  let chunkIndex = 0

  for (const item of items) {
    const entry = encodeEntry(item)

    if (entry.length > STRIPE_METADATA_VALUE_LIMIT) {
      throw new CheckoutMetadataError(
        `a single item encodes to ${entry.length} characters, above Stripe's ${STRIPE_METADATA_VALUE_LIMIT} limit, so it cannot be sent at all`,
      )
    }

    const separator = current.length > 0 ? ENTRY_SEPARATOR : ''
    if (current.length + separator.length + entry.length > STRIPE_METADATA_VALUE_LIMIT) {
      chunks[`items_${chunkIndex}`] = current
      chunkIndex += 1
      current = entry
    } else {
      current += separator + entry
    }
  }

  chunks[`items_${chunkIndex}`] = current
  chunks.items_chunks = String(chunkIndex + 1)

  return chunks
}

/**
 * Read cart items back out of metadata.
 *
 * Stripe returns metadata as loose strings, so everything here is treated as untrusted:
 * a malformed entry raises rather than yielding a silently wrong order.
 */
export function decodeItems(metadata: Readonly<Record<string, string | undefined>>): CartItem[] {
  const declared = metadata.items_chunks

  if (declared === undefined) {
    throw new CheckoutMetadataError('metadata has no items_chunks key, so item count is unknown')
  }

  const chunkCount = Number.parseInt(declared, 10)
  if (!Number.isInteger(chunkCount) || chunkCount < 0) {
    throw new CheckoutMetadataError(`items_chunks is "${declared}", which is not a chunk count`)
  }

  const items: CartItem[] = []

  for (let index = 0; index < chunkCount; index += 1) {
    const key = `items_${index}`
    const chunk = metadata[key]

    if (chunk === undefined) {
      throw new CheckoutMetadataError(
        `metadata declares ${chunkCount} chunks but ${key} is missing, so the cart is incomplete`,
      )
    }
    if (chunk === '') continue

    for (const entry of chunk.split(ENTRY_SEPARATOR)) {
      items.push(decodeEntry(entry))
    }
  }

  return items
}

function decodeEntry(entry: string): CartItem {
  const parts = entry.split(FIELD_SEPARATOR)
  if (parts.length !== 3) {
    throw new CheckoutMetadataError(`cart entry "${entry}" does not have the expected three fields`)
  }

  const [productId, rawQuantity, rawPrice] = parts as [string, string, string]
  const quantity = Number.parseInt(rawQuantity, 10)
  const price = Number.parseInt(rawPrice, 10)

  if (productId === '') {
    throw new CheckoutMetadataError(`cart entry "${entry}" has an empty product id`)
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CheckoutMetadataError(`cart entry "${entry}" has a non positive quantity`)
  }
  if (!Number.isInteger(price) || price < 0) {
    throw new CheckoutMetadataError(`cart entry "${entry}" has an invalid price`)
  }

  return { productId, quantity, price }
}

/**
 * Guard for the whole metadata object before it is handed to Stripe.
 *
 * Stripe enforces the per value limit itself and answers with a 500, which surfaces to the
 * customer as a checkout that simply does not work. Failing here instead means the fault is
 * legible in our own logs.
 */
export function assertWithinStripeLimits(metadata: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(metadata)) {
    if (value.length > STRIPE_METADATA_VALUE_LIMIT) {
      throw new CheckoutMetadataError(
        `metadata value "${key}" is ${value.length} characters, above Stripe's ${STRIPE_METADATA_VALUE_LIMIT} limit`,
      )
    }
  }
}
