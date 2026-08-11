import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The platform takes no commission. That is not a preference, it is the reason the only
 * paying vendor stays, and it is what separates this from the marketplaces a vendor would
 * otherwise sell through at 20 to 42 percent of a first order. See DEC-014.
 *
 * A fee could return through three separate doors: the code default, the Terraform variable
 * feeding the environment, or an operator setting the variable by hand. The first two are
 * held here. The third is deliberate and visible.
 */

const REPO_ROOT = join(__dirname, '..', '..');

describe('the platform takes no commission', () => {
  const originalFeePercent = process.env.PLATFORM_FEE_PERCENT;

  afterEach(() => {
    if (originalFeePercent === undefined) {
      delete process.env.PLATFORM_FEE_PERCENT;
    } else {
      process.env.PLATFORM_FEE_PERCENT = originalFeePercent;
    }
    jest.resetModules();
  });

  async function feeFor(total: number, configured?: string): Promise<number> {
    if (configured === undefined) {
      delete process.env.PLATFORM_FEE_PERCENT;
    } else {
      process.env.PLATFORM_FEE_PERCENT = configured;
    }
    jest.resetModules();

    // Imported fresh so the handler reads the environment as configured for this case.
    const { calculatePlatformFee } = await import(
      '../../packages/lambdas/api/src/handlers/create-checkout-session'
    );
    return calculatePlatformFee(total);
  }

  it('should charge nothing when nothing is configured', async () => {
    await expect(feeFor(10_000)).resolves.toBe(0);
  });

  it('should charge nothing when the percentage is explicitly zero', async () => {
    await expect(feeFor(10_000, '0')).resolves.toBe(0);
  });

  it('should charge nothing when the percentage is unparseable rather than guessing', async () => {
    await expect(feeFor(10_000, 'five')).resolves.toBe(0);
  });

  it('should still honour a deliberate percentage, so the decision stays reversible without code', async () => {
    await expect(feeFor(10_000, '5')).resolves.toBe(500);
  });
});

describe('the infrastructure defaults carry no fee either', () => {
  it.each(['prod', 'staging'])(
    'should default platform_fee_percent to zero in %s',
    (environment) => {
      const variables = readFileSync(
        join(REPO_ROOT, 'infra', 'environments', environment, 'variables.tf'),
        'utf8',
      );

      const block = /variable "platform_fee_percent"\s*\{[^}]*\}/.exec(variables);
      expect(block).not.toBeNull();
      expect(block?.[0]).toMatch(/default\s*=\s*"0"/);
    },
  );
});
