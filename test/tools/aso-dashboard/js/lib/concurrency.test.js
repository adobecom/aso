import { expect } from '@esm-bundle/chai';
import { runWithConcurrency } from '../../../../../tools/aso-dashboard/js/lib/concurrency.js';

describe('runWithConcurrency', () => {
  it('never runs more than `limit` workers at once', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;

    await runWithConcurrency(items, 5, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      active -= 1;
      return item * 2;
    });

    expect(maxActive).to.be.at.most(5);
  });

  it('preserves result order regardless of completion order', async () => {
    const items = [30, 10, 20, 5];

    const results = await runWithConcurrency(items, 5, async (item) => {
      await new Promise((resolve) => { setTimeout(resolve, item); });
      return item;
    });

    // Item 30 takes longest but must still land at index 0, matching input order.
    expect(results).to.deep.equal([30, 10, 20, 5]);
  });

  it('handles fewer items than the limit', async () => {
    const results = await runWithConcurrency([1, 2], 5, async (item) => item * 10);
    expect(results).to.deep.equal([10, 20]);
  });
});
