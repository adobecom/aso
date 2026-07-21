import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  getSelectedPromoContexts,
  initPromoScope,
  isPromoScopeComplete,
  refreshPromoNames,
} from '../../../../tools/aso-dashboard/js/promo-scope-settings.js';
import { clearListCache } from '../../../../tools/aso-dashboard/js/lib/utils.js';

describe('promo-scope-settings', () => {
  describe('getSelectedPromoContexts / isPromoScopeComplete', () => {
    function buildDom({ promosScopeChecked = true } = {}) {
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-promos" ${promosScopeChecked ? 'checked' : ''}>
        <div id="export-promo-groups">
          <div class="promo-device-box" data-device="apple">
            <div class="promo-group">
              <input type="checkbox" class="promo-name-checkbox" value="apple-promo" data-device="apple" checked>
              <div>
                <input type="checkbox" class="promo-variant-checkbox" data-promo="apple-promo" data-device="apple" value="default" checked>
                <input type="checkbox" class="promo-variant-checkbox" data-promo="apple-promo" data-device="apple" value="v2">
              </div>
            </div>
          </div>
          <div class="promo-device-box" data-device="google">
            <div class="promo-group">
              <input type="checkbox" class="promo-name-checkbox" value="shared-promo" data-device="google" checked>
              <div>
                <input type="checkbox" class="promo-variant-checkbox" data-promo="shared-promo" data-device="google" value="default" checked>
              </div>
            </div>
            <div class="promo-group">
              <input type="checkbox" class="promo-name-checkbox" value="unchecked-promo" data-device="google">
              <div>
                <input type="checkbox" class="promo-variant-checkbox" data-promo="unchecked-promo" data-device="google" value="default" checked>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('returns nothing when the Promos scope is unchecked', () => {
      buildDom({ promosScopeChecked: false });
      expect(getSelectedPromoContexts()).to.deep.equal([]);
      expect(isPromoScopeComplete()).to.be.true;
    });

    it('only includes checked variants under a checked promo, tagged with that box\'s device', () => {
      buildDom();
      expect(getSelectedPromoContexts()).to.deep.equal([
        { promoName: 'apple-promo', promoVariant: 'default', device: 'apple' },
        { promoName: 'shared-promo', promoVariant: 'default', device: 'google' },
      ]);
      expect(isPromoScopeComplete()).to.be.true;
    });

    it('ignores a checked variant when its parent promo is unchecked', () => {
      buildDom();
      const contexts = getSelectedPromoContexts();
      expect(contexts.some((ctx) => ctx.promoName === 'unchecked-promo')).to.be.false;
    });

    it('does not cross-match a variant with the same promo name under a different device', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-promos" checked>
        <div id="export-promo-groups">
          <div class="promo-device-box" data-device="apple">
            <input type="checkbox" class="promo-name-checkbox" value="same-name" data-device="apple" checked>
            <input type="checkbox" class="promo-variant-checkbox" data-promo="same-name" data-device="apple" value="default" checked>
          </div>
          <div class="promo-device-box" data-device="google">
            <input type="checkbox" class="promo-name-checkbox" value="same-name" data-device="google">
            <input type="checkbox" class="promo-variant-checkbox" data-promo="same-name" data-device="google" value="v2" checked>
          </div>
        </div>
      `;

      expect(getSelectedPromoContexts()).to.deep.equal([
        { promoName: 'same-name', promoVariant: 'default', device: 'apple' },
      ]);
    });

    it('is incomplete when the scope is checked but nothing is selected', () => {
      buildDom();
      document.querySelectorAll('.promo-name-checkbox, .promo-variant-checkbox')
        .forEach((checkbox) => { checkbox.checked = false; });
      expect(isPromoScopeComplete()).to.be.false;
    });
  });

  describe('initPromoScope master/variant checkbox interaction', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('re-checks all variants for a promo (scoped to its device) when the master checkbox is re-checked', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-promos" checked>
        <div id="export-promo-groups">
          <div class="promo-device-box" data-device="apple">
            <input type="checkbox" id="promo-a" class="promo-name-checkbox" value="promo-a" data-device="apple" checked>
            <div>
              <input type="checkbox" class="promo-variant-checkbox" data-promo="promo-a" data-device="apple" value="default" checked>
              <input type="checkbox" class="promo-variant-checkbox" data-promo="promo-a" data-device="apple" value="v2" checked>
            </div>
          </div>
          <div class="promo-device-box" data-device="google">
            <input type="checkbox" class="promo-name-checkbox" value="promo-a" data-device="google" checked>
            <input type="checkbox" class="promo-variant-checkbox" data-promo="promo-a" data-device="google" value="default" checked>
          </div>
        </div>
      `;

      initPromoScope({ context: {}, token: '', getListProbes: () => [], onScopeChange: () => {} });

      const master = document.getElementById('promo-a');
      const appleVariants = document.querySelectorAll('.promo-variant-checkbox[data-promo="promo-a"][data-device="apple"]');
      const googleVariant = document.querySelector('.promo-variant-checkbox[data-promo="promo-a"][data-device="google"]');
      appleVariants.forEach((checkbox) => { checkbox.checked = false; });
      googleVariant.checked = false;

      master.checked = false;
      master.dispatchEvent(new Event('change', { bubbles: true }));
      master.checked = true;
      master.dispatchEvent(new Event('change', { bubbles: true }));

      appleVariants.forEach((checkbox) => expect(checkbox.checked).to.be.true);
      // Re-checking Apple's master must not touch Google's identically-named promo's variants.
      expect(googleVariant.checked).to.be.false;
    });
  });

  describe('refreshPromoNames (integration)', () => {
    let fetchStub;

    beforeEach(() => {
      clearListCache();
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-promos" checked>
        <div id="export-promo-fields"><div id="export-promo-groups"></div></div>
      `;
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
      clearListCache();
      document.body.innerHTML = '';
    });

    it('renders one box per checked device, each with its own promos and file-based variants', async () => {
      fetchStub.callsFake(async (url) => {
        if (url.includes('/apple/') && url.endsWith('/promos')) {
          return {
            ok: true,
            json: async () => ([
              { name: 'apple-only', path: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/apple-only' },
              { name: 'shared-promo', path: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/shared-promo' },
            ]),
          };
        }
        if (url.includes('/google/') && url.endsWith('/promos')) {
          return {
            ok: true,
            json: async () => ([
              { name: 'shared-promo', path: '/products-redesign/adobe-express/google/2026/q1/may/store-updates/promos/shared-promo' },
            ]),
          };
        }
        if (url.includes('promos/apple-only')) {
          return { ok: true, json: async () => ([{ name: 'default', path: '.../apple-only/default.html', ext: 'html' }]) };
        }
        if (url.includes('promos/shared-promo')) {
          return { ok: true, json: async () => ([{ name: 'default', path: '.../shared-promo/default.html', ext: 'html' }]) };
        }
        return { ok: false };
      });

      const probes = [
        {
          language: '/', productsPath: 'products-redesign', product: 'adobe-express', device: 'apple', year: '2026', quarter: 'q1', month: 'may', storeType: 'store-updates',
        },
        {
          language: '/', productsPath: 'products-redesign', product: 'adobe-express', device: 'google', year: '2026', quarter: 'q1', month: 'may', storeType: 'store-updates',
        },
      ];

      await refreshPromoNames({ org: 'adobecom', repo: 'aso' }, 'token', () => probes);

      const boxes = document.querySelectorAll('.promo-device-box');
      expect(boxes).to.have.length(2);
      expect(document.querySelector('.promo-device-box[data-device="apple"] .promo-name-checkbox[value="apple-only"]')).to.exist;
      expect(document.querySelector('.promo-device-box[data-device="apple"] .promo-name-checkbox[value="shared-promo"]')).to.exist;
      expect(document.querySelector('.promo-device-box[data-device="google"] .promo-name-checkbox[value="shared-promo"]')).to.exist;
      expect(document.querySelector('.promo-device-box[data-device="google"] .promo-name-checkbox[value="apple-only"]')).to.not.exist;

      const appleOnlyVariant = document.querySelector('.promo-variant-checkbox[data-promo="apple-only"][data-device="apple"]');
      expect(appleOnlyVariant.value).to.equal('default');
      expect(appleOnlyVariant.checked).to.be.true;
    });

    it('shows a "no promos" message inside a device box that has none', async () => {
      fetchStub.callsFake(async (url) => {
        if (url.includes('/apple/') && url.endsWith('/promos')) {
          return { ok: true, json: async () => ([]) };
        }
        return { ok: false };
      });

      await refreshPromoNames(
        { org: 'adobecom', repo: 'aso' },
        'token',
        () => [{
          language: '/', productsPath: 'products-redesign', product: 'adobe-express', device: 'apple', year: '2026', quarter: 'q1', month: 'may', storeType: 'store-updates',
        }],
      );

      expect(document.getElementById('promo-groups-apple').textContent).to.include('No promos found');
    });

    it('shows a message and no boxes when no probes are available yet', async () => {
      await refreshPromoNames({ org: 'adobecom', repo: 'aso' }, 'token', () => []);
      expect(document.querySelectorAll('.promo-device-box')).to.have.length(0);
      expect(document.getElementById('export-promo-groups').textContent).to.include('Select product, device, and release period');
    });

    it('bounds concurrent variant fetches (does not fire them all at once)', async () => {
      const promoNames = Array.from({ length: 8 }, (_, i) => ({
        name: `promo-${i}`,
        path: `/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/promo-${i}`,
      }));
      let active = 0;
      let maxActive = 0;

      fetchStub.callsFake(async (url) => {
        if (url.endsWith('/promos')) {
          return { ok: true, json: async () => promoNames };
        }
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => { setTimeout(resolve, 5); });
        active -= 1;
        return { ok: true, json: async () => ([{ name: 'default', path: `${url}/default.html`, ext: 'html' }]) };
      });

      await refreshPromoNames(
        { org: 'adobecom', repo: 'aso' },
        'token',
        () => [{
          language: '/', productsPath: 'products-redesign', product: 'adobe-express', device: 'apple', year: '2026', quarter: 'q1', month: 'may', storeType: 'store-updates',
        }],
      );

      expect(maxActive).to.be.at.most(5);
    });
  });
});
