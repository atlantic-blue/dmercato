import { buildItemsMetadataChunks } from '../../packages/lambdas/api/src/handlers/create-checkout-session';
import { reassembleItems } from '../../packages/lambdas/stripe-webhook/src/webhook-handler';
import type { Product } from '@dmercato/types';

/**
 * The producer and the consumer of Stripe checkout metadata live in different Lambda
 * packages and were only ever tested apart. That is how the format changed on one side,
 * stayed the same on the other, and crashed every webhook delivery while both suites
 * stayed green.
 *
 * These tests exist to fail if the two ever disagree again, so they deliberately call the
 * real functions from both handlers rather than the shared module they now share.
 */

function menuOf(count: number): Array<Product & { quantity: number }> {
  return Array.from({ length: count }, (_, index) => ({
    id: `prod_1f8418a9-527f-4856-b231-e523f64680${String(index).padStart(2, '0')}`,
    name: `Item ${index}`,
    description: '',
    price: 850 + index * 25,
    currency: 'aud',
    available: true,
    order: index,
    quantity: (index % 3) + 1,
  })) as Array<Product & { quantity: number }>;
}

describe('checkout metadata crosses the Lambda boundary intact', () => {
  it('should let the webhook read back exactly what checkout wrote, for a two item cart', () => {
    const cart = menuOf(2);

    const recovered = reassembleItems(buildItemsMetadataChunks(cart) as never);

    expect(recovered).toEqual(
      cart.map((p) => ({ productId: p.id, quantity: p.quantity, price: p.price })),
    );
  });

  it('should survive a full menu, which is the size that broke production', () => {
    const cart = menuOf(14);
    const metadata = buildItemsMetadataChunks(cart);

    expect(Number(metadata.items_chunks)).toBeGreaterThan(1);
    expect(reassembleItems(metadata as never)).toEqual(
      cart.map((p) => ({ productId: p.id, quantity: p.quantity, price: p.price })),
    );
  });

  it('should never hand Stripe a metadata value above the 500 character limit', () => {
    for (const value of Object.values(buildItemsMetadataChunks(menuOf(40)))) {
      expect(value.length).toBeLessThanOrEqual(500);
    }
  });

  it('should read an empty cart back as empty rather than inventing an item', () => {
    expect(reassembleItems(buildItemsMetadataChunks([]) as never)).toEqual([]);
  });

  it('should refuse metadata that lost a chunk in transit rather than returning half an order', () => {
    const metadata = buildItemsMetadataChunks(menuOf(14));
    const chunkCount = Number(metadata.items_chunks);
    delete metadata[`items_${chunkCount - 1}`];

    expect(() => reassembleItems(metadata as never)).toThrow();
  });
});
