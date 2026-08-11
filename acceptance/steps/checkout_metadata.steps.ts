import assert from 'node:assert/strict'
import { Given, When, Then, setDefaultTimeout } from '@cucumber/cucumber'
import {
  encodeItems,
  decodeItems,
  STRIPE_METADATA_VALUE_LIMIT,
  type CartItem,
} from '../../packages/shared/checkout-metadata/src/checkout-metadata.ts'

setDefaultTimeout(30_000)

/**
 * Realistically shaped product ids. Short ids fit fourteen items into a single metadata
 * value and would hide the chunking entirely, which is how the limit reached production
 * unnoticed in the first place.
 */
const FULL_MENU: CartItem[] = Array.from({ length: 14 }, (_, index) => ({
  productId: `prod_1f8418a9-527f-4856-b231-e523f64680${String(index).padStart(2, '0')}`,
  quantity: (index % 3) + 1,
  price: 850 + index * 25,
}))

interface CheckoutWorld {
  cart: CartItem[]
  metadata: Record<string, string>
  recovered: CartItem[]
  readError: Error | null
}

function world(context: unknown): CheckoutWorld {
  const scenario = context as Partial<CheckoutWorld>
  scenario.cart ??= []
  scenario.metadata ??= {}
  scenario.recovered ??= []
  scenario.readError ??= null
  return scenario as CheckoutWorld
}

Given('a cart containing {int} of {string} at {int}', function (quantity: number, productId: string, price: number) {
  world(this).cart.push({ productId, quantity, price })
})

Given("a cart of the vendor's full {int} item menu", function (count: number) {
  assert.equal(count, FULL_MENU.length, `the fixture holds ${FULL_MENU.length} items, not ${count}`)
  world(this).cart = [...FULL_MENU]
})

Given('an empty cart', function () {
  world(this).cart = []
})

Given('metadata declaring {int} chunks but carrying only the first', function (chunks: number) {
  const scenario = world(this)
  scenario.metadata = {
    items_chunks: String(chunks),
    items_0: 'prod_sourdough:1:650',
  }
})

When('the cart is encoded for Stripe', function () {
  const scenario = world(this)
  scenario.metadata = encodeItems(scenario.cart)
})

When('the cart is encoded for Stripe and read back', function () {
  const scenario = world(this)
  scenario.metadata = encodeItems(scenario.cart)
  scenario.recovered = decodeItems(scenario.metadata)
})

When('the cart is read back', function () {
  const scenario = world(this)
  try {
    scenario.recovered = decodeItems(scenario.metadata)
  } catch (error) {
    scenario.readError = error as Error
  }
})

Then('the recovered cart matches the original', function () {
  const scenario = world(this)
  assert.deepEqual(scenario.recovered, scenario.cart)
})

Then('the recovered cart is empty', function () {
  assert.deepEqual(world(this).recovered, [])
})

Then('the encoding is spread across more than one metadata value', function () {
  const declared = Number(world(this).metadata.items_chunks)
  assert.ok(declared > 1, `expected more than one chunk, got ${declared}`)
})

Then('no metadata value exceeds {int} characters', function (limit: number) {
  assert.equal(limit, STRIPE_METADATA_VALUE_LIMIT, 'the scenario and the code disagree on Stripe’s limit')

  for (const [key, value] of Object.entries(world(this).metadata)) {
    assert.ok(value.length <= limit, `metadata value "${key}" is ${value.length} characters, above ${limit}`)
  }
})

Then('reading fails rather than returning a partial cart', function () {
  const scenario = world(this)
  assert.ok(scenario.readError !== null, 'reading was expected to fail and did not')
  assert.match(scenario.readError.message, /missing/)
  assert.deepEqual(scenario.recovered, [], 'a partial cart was returned alongside the failure')
})
