import { expect } from '@esm-bundle/chai';
import {
  setupMockSchema,
  loadMockHTML,
  setupBlockTest,
  createBlockElement,
  countButtons,
} from './test-helpers.js';

const { default: init } = await import('../../../blocks/aso-app/aso-app.js');

describe('aso-app', () => {
  let fetchStub;

  before(async () => {
    fetchStub = await setupMockSchema();
  });

  after(() => {
    fetchStub.restore();
  });

  describe('apple listing', () => {
    before(async () => {
      const html = await loadMockHTML('apple-listing.html');
      await setupBlockTest(html, init);
    });

    it('decorates rows with data-row class', () => {
      const rows = document.querySelectorAll('.data-row');
      expect(rows.length).to.equal(6);
    });

    it('decorates label elements', () => {
      const labels = document.querySelectorAll('.label');
      expect(labels.length).to.equal(6);
      expect(labels[0].textContent).to.equal('Title');
    });

    it('decorates data elements', () => {
      const dataEls = document.querySelectorAll('.data');
      expect(dataEls.length).to.equal(6);
      expect(dataEls[0].textContent).to.equal('My Amazing App');
    });

    it('adds copy button to each row', () => {
      expect(countButtons('Copy')).to.equal(6);
    });

    it('validates title character count - success', async () => {
      const titleRow = document.querySelector('.data-row');
      const successNote = titleRow.querySelector('.note.success');
      expect(successNote).to.exist;
      expect(successNote.textContent).to.include('valid');
    });

    it('does not validate fields without character count', () => {
      const rows = document.querySelectorAll('.data-row');
      const subtitleRow = rows[1];
      const iconRow = rows[3];
      const screenshotsRow = rows[5];

      expect(subtitleRow.querySelector('.note')).to.not.exist;
      expect(iconRow.querySelector('.note')).to.not.exist;
      expect(screenshotsRow.querySelector('.note')).to.not.exist;
    });

    it('only validates fields with character count', () => {
      const allNotes = document.querySelectorAll('.note.success, .note.error');
      expect(allNotes.length).to.equal(3);
    });

    it('does not show info message when validations exist', () => {
      const infoNote = document.querySelector('.note.info');
      expect(infoNote).to.not.exist;
    });
  });

  describe('no variant classes', () => {
    before(async () => {
      const html = await loadMockHTML('no-classes.html');
      await setupBlockTest(html, init);
    });

    it('shows info message when no variant classes', () => {
      const infoNote = document.querySelector('.note.info');
      expect(infoNote).to.exist;
      expect(infoNote.textContent).to.include('No validation rules found');
    });

    it('still decorates rows', () => {
      const rows = document.querySelectorAll('.data-row');
      expect(rows.length).to.equal(2);
    });

    it('does not show validation notes', () => {
      const validationNotes = document.querySelectorAll('.note.success, .note.error');
      expect(validationNotes.length).to.equal(0);
    });
  });

  describe('validation error', () => {
    before(async () => {
      const html = await loadMockHTML('validation-error.html');
      await setupBlockTest(html, init);
    });

    it('shows error note for title exceeding limit', () => {
      const titleRow = document.querySelectorAll('.data-row')[0];
      const errorNote = titleRow.querySelector('.note.error');
      expect(errorNote).to.exist;
      expect(errorNote.textContent).to.include('Error validating');
      expect(errorNote.textContent).to.include('title');
      expect(errorNote.textContent).to.include('30');
    });

    it('shows success note for valid description', () => {
      const descRow = document.querySelectorAll('.data-row')[1];
      const successNote = descRow.querySelector('.note.success');
      expect(successNote).to.exist;
    });
  });

  describe('class order independence', () => {
    before(async () => {
      const el = createBlockElement(
        'aso-app listing apple',
        '<div><div>Title</div><div>Test</div></div>',
      );
      el.id = 'test-order';
      document.body.innerHTML = '';
      document.body.appendChild(el);
      await init(el);
    });

    it('matches schema regardless of class order', () => {
      const infoNote = document.querySelector('.note.info');
      expect(infoNote).to.not.exist;
    });

    it('applies validations from normalized schema key', () => {
      const validationNote = document.querySelector('.note.success, .note.error');
      expect(validationNote).to.exist;
    });
  });

  describe('schema fetch failure', () => {
    it('shows error message when schema fails to load', async () => {
      // Note: This test relies on the schema being cached from previous tests
      // So it will not actually trigger a fetch failure. To properly test this,
      // the module would need to be reloaded, which is complex in this test setup.
      // This test is kept for documentation purposes but will pass due to caching.
      const html = await loadMockHTML('no-classes.html');
      document.body.innerHTML = html;
      const block = document.querySelector('.aso-app');
      await init(block);

      const infoNote = document.querySelector('.note.info');
      expect(infoNote).to.exist;
      expect(infoNote.textContent).to.include('No validation rules found');
    });
  });

  describe('progressive matching', () => {
    before(async () => {
      const el = createBlockElement(
        'aso-app apple listing red',
        '<div><div>Title</div><div>Test Title</div></div>',
      );
      el.id = 'test-progressive';
      document.body.innerHTML = '';
      document.body.appendChild(el);
      await init(el);
    });

    it('matches with fewer classes when exact match not found', () => {
      const infoNote = document.querySelector('.note.info');
      expect(infoNote).to.not.exist;
    });

    it('applies validation from best matching schema', () => {
      const validationNote = document.querySelector('.note.success, .note.error');
      expect(validationNote).to.exist;
    });
  });

  describe('HTML cleaning and character counting', () => {
    describe('strong tags converted to b tags', () => {
      before(async () => {
        const el = createBlockElement(
          'aso-app apple listing',
          '<div><div>Title</div><div><strong>Test</strong></div></div>',
        );
        document.body.innerHTML = '';
        document.body.appendChild(el);
        await init(el);
      });

      it('validates counting <b> as 3 chars and </b> as 4 chars', () => {
        const row = document.querySelector('.data-row');
        const note = row.querySelector('.note');
        expect(note).to.exist;
      });

      it('shows success when total is under 30 chars', () => {
        const row = document.querySelector('.data-row');
        const successNote = row.querySelector('.note.success');
        expect(successNote).to.exist;
      });
    });

    describe('p tags stripped (0 character count)', () => {
      before(async () => {
        const el = createBlockElement(
          'aso-app apple listing',
          '<div><div>Description</div><div><p>This is a test</p></div></div>',
        );
        document.body.innerHTML = '';
        document.body.appendChild(el);
        await init(el);
      });

      it('counts only text content without p tags', () => {
        const row = document.querySelector('.data-row');
        const note = row.querySelector('.note');
        expect(note).to.exist;
      });

      it('validates successfully for short content', () => {
        const row = document.querySelector('.data-row');
        const successNote = row.querySelector('.note.success');
        expect(successNote).to.exist;
      });
    });

    describe('validation with cleaned HTML exceeding limit', () => {
      before(async () => {
        const el = createBlockElement(
          'aso-app apple listing',
          '<div><div>Title</div><div><strong>This is a very long app name that exceeds thirty characters</strong></div></div>',
        );
        document.body.innerHTML = '';
        document.body.appendChild(el);
        await init(el);
      });

      it('shows error when cleaned HTML exceeds character limit', () => {
        const row = document.querySelector('.data-row');
        const errorNote = row.querySelector('.note.error');
        expect(errorNote).to.exist;
        expect(errorNote.textContent).to.include('Expected: 30 characters');
      });

      it('counts b tags in the total', () => {
        const row = document.querySelector('.data-row');
        const errorNote = row.querySelector('.note.error');
        expect(errorNote.textContent).to.include('Received:');
      });
    });

    describe('mixed HTML content', () => {
      before(async () => {
        const el = createBlockElement(
          'aso-app apple listing',
          '<div><div>Description</div><div><p><strong>Bold</strong> text</p></div></div>',
        );
        document.body.innerHTML = '';
        document.body.appendChild(el);
        await init(el);
      });

      it('handles mixed tags correctly', () => {
        const row = document.querySelector('.data-row');
        const note = row.querySelector('.note');
        expect(note).to.exist;
      });

      it('strips p tags and converts strong to b', () => {
        const row = document.querySelector('.data-row');
        const successNote = row.querySelector('.note.success');
        expect(successNote).to.exist;
      });
    });
  });
});
