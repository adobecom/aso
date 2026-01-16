import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setupMockSchema, createBlockElement } from './test-helpers.js';

describe('aso-utils', () => {
  let fetchStub;
  let getValidations;

  before(async () => {
    fetchStub = await setupMockSchema();
    ({ getValidations } = await import('../../../blocks/aso-app/aso-utils.js'));
  });

  after(() => {
    if (fetchStub && fetchStub.restore) {
      fetchStub.restore();
    }
  });

  describe('getValidations', () => {
    it('returns validations for apple listing', async () => {
      const el = createBlockElement('aso-app apple listing');
      const { message, validations } = await getValidations(el);

      expect(message).to.equal('');
      expect(validations).to.exist;
      expect(validations.title).to.exist;
      expect(validations.title.length).to.equal(30);
      expect(validations.developer).to.exist;
      expect(validations.developer.length).to.equal(50);
      expect(validations.description).to.exist;
      expect(validations.description.length).to.equal(170);
    });

    it('returns validations for google promo', async () => {
      const el = createBlockElement('aso-app google promo');
      const { message, validations } = await getValidations(el);

      expect(message).to.equal('');
      expect(validations).to.exist;
      expect(validations.title).to.exist;
      expect(validations.title.length).to.equal(50);
      expect(validations.description).to.exist;
      expect(validations.description.length).to.equal(80);
    });

    it('normalizes class order', async () => {
      const el = createBlockElement('aso-app listing apple');
      const { message, validations } = await getValidations(el);

      expect(message).to.equal('');
      expect(validations).to.exist;
      expect(validations.title).to.exist;
    });

    it('returns message when no variant classes', async () => {
      const el = createBlockElement('aso-app');
      const { message, validations } = await getValidations(el);

      expect(message).to.include('No validation rules found');
      expect(Object.keys(validations).length).to.equal(0);
    });

    it('returns message when schema not found', async () => {
      const el = createBlockElement('aso-app unknown variant');
      const { message, validations } = await getValidations(el);

      expect(message).to.include('No validation rules found for');
      expect(message).to.include('aso-app (unknown, variant)');
      expect(Object.keys(validations).length).to.equal(0);
    });

    it('performs progressive matching', async () => {
      const el = createBlockElement('aso-app apple listing red');
      const { message, validations } = await getValidations(el);

      expect(message).to.equal('');
      expect(validations).to.exist;
      expect(validations.title).to.exist;
    });

    it('converts field names to lowercase', async () => {
      const el = createBlockElement('aso-app apple listing');
      const { validations } = await getValidations(el);

      expect(validations.title).to.exist;
      expect(validations.Title).to.not.exist;
      expect(validations.developer).to.exist;
      expect(validations.Developer).to.not.exist;
    });

    it('skips fields without character count', async () => {
      const el = createBlockElement('aso-app apple listing');
      const { validations } = await getValidations(el);

      expect(validations.title).to.exist;
      expect(validations.developer).to.exist;
      expect(validations.description).to.exist;
      expect(validations.subtitle).to.not.exist;
      expect(validations.icon).to.not.exist;
      expect(validations.screenshots).to.not.exist;
    });

    it('only includes fields with valid character counts', async () => {
      const el = createBlockElement('aso-app google promo');
      const { validations } = await getValidations(el);

      expect(Object.keys(validations).length).to.equal(2);
      expect(validations.title).to.exist;
      expect(validations.description).to.exist;
      expect(validations.image).to.not.exist;
    });
  });
});
