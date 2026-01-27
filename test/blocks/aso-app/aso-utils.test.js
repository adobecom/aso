import { expect } from '@esm-bundle/chai';
import { setupMockSchema, createBlockElement } from './test-helpers.js';

describe('aso-utils', () => {
  let fetchStub;
  let getValidations;
  let convertTags;

  before(async () => {
    fetchStub = await setupMockSchema();
    ({ getValidations, convertTags } = await import('../../../blocks/aso-app/aso-utils.js'));
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

  describe('convertTags', () => {
    it('normalizes whitespace from HTML source indentation', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <p>Testing what happens when there are actual paragraphs</p>
        <p>What happens now?<br>Will the p tag be there??</p>
      `;
      const result = convertTags(div);
      expect(result).to.equal('Testing what happens when there are actual paragraphs\nWhat happens now?\nWill the p tag be there??');
    });

    it('removes extra whitespace between paragraphs', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>First paragraph</p>    <p>Second paragraph</p>';
      const result = convertTags(div);
      expect(result).to.equal('First paragraph Second paragraph');
    });

    it('adds paragraph breaks when option is enabled', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>First</p><p>Second</p><p>Third</p>';
      const result = convertTags(div, { addParagraphBreaks: true });
      expect(result).to.equal('First\nSecond\nThird');
    });

    it('converts br tags to newlines', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Line one<br>Line two<br>Line three</p>';
      const result = convertTags(div);
      expect(result).to.equal('Line one\nLine two\nLine three');
    });

    it('preserves allowed HTML tags', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>This is <b>bold</b> and <i>italic</i> text</p>';
      const result = convertTags(div);
      expect(result).to.equal('This is <b>bold</b> and <i>italic</i> text');
    });

    it('converts strong to b and em to i', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>This is <strong>bold</strong> and <em>italic</em> text</p>';
      const result = convertTags(div);
      expect(result).to.equal('This is <b>bold</b> and <i>italic</i> text');
    });

    it('removes span and div tags', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p><span>Some </span><span>nested </span>content</p>';
      const result = convertTags(div);
      expect(result).to.equal('Some nested content');
    });

    it('collapses multiple spaces to one', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Multiple    spaces    here</p>';
      const result = convertTags(div);
      expect(result).to.equal('Multiple spaces here');
    });

    it('preserves allowed HTML tags and removes paragraph breaks', () => {
      const div = document.createElement('div');
      div.innerHTML = '<h3>Title</h3><p>Content</p>';
      const result = convertTags(div);
      expect(result).to.equal('<h3>Title</h3>Content');
    });
  });
});
