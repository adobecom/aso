import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  fieldAcceptsKeywords,
  getFieldPageMapping,
  getFieldsForPageLeaf,
  listMediaAssetFields,
  listSchemaFields,
  SHEET_METADATA,
  SHEET_PROMOS,
} from '../../../../../tools/aso-dashboard/js/import-export/page-map.js';

describe('import-export-page-map', () => {
  let schema;
  let sheetMap;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../../mocks/sheet-to-block-map.json' }));
  });

  describe('getFieldPageMapping', () => {
    it('reads page leaf from block-schema and sheet from sheet-to-block-map', () => {
      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        schema,
        sheetMap,
      })).to.deep.equal({
        pageLeaf: 'metadata/app-name',
        sheet: SHEET_METADATA,
        blockKey: 'aso-app (apple, listing)',
      });
    });

    it('reflects block-schema page leaf changes without code updates', () => {
      const updatedSchema = JSON.parse(JSON.stringify(schema));
      updatedSchema['aso-app (google, listing)'].data = updatedSchema['aso-app (google, listing)'].data.map(
        (field) => (field['field key'] === 'releaseNotes'
          ? { ...field, 'page leaf': 'metadata/release-notes' }
          : field),
      );

      expect(getFieldPageMapping({
        device: 'google',
        blockType: 'listing',
        fieldKey: 'releaseNotes',
        schema: updatedSchema,
        sheetMap,
      }).pageLeaf).to.equal('metadata/release-notes');
    });

    it('maps promo fields to promos/{name}/{variant}', () => {
      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'promo',
        fieldKey: 'eventName',
        schema,
        sheetMap,
        promoName: 'comic-creator',
        promoVariant: 'default',
      })).to.deep.equal({
        pageLeaf: 'promos/comic-creator/default',
        sheet: SHEET_PROMOS,
        blockKey: 'aso-app (apple, promo)',
      });
    });

    it('reads images-videos page leaf from block-schema', () => {
      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy1',
        schema,
        sheetMap,
      }).pageLeaf).to.equal('images/copy');

      expect(getFieldPageMapping({
        device: 'google',
        blockType: 'images-videos',
        fieldKey: 'videoCopy1',
        schema,
        sheetMap,
      }).pageLeaf).to.equal('videos/copy');
    });

    it('uses media fallback when images-videos fields have no page leaf in schema', () => {
      const updatedSchema = JSON.parse(JSON.stringify(schema));
      updatedSchema['aso-app (apple, images-videos)'].data = updatedSchema['aso-app (apple, images-videos)'].data.map(
        (field) => ({ ...field, 'page leaf': '' }),
      );

      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy1',
        schema: updatedSchema,
        sheetMap,
      }).pageLeaf).to.equal('images/copy');

      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'videoCopy1',
        schema: updatedSchema,
        sheetMap,
      }).pageLeaf).to.equal('videos/copy');
    });

    it('returns null for listing fields without page leaf in schema', () => {
      const updatedSchema = JSON.parse(JSON.stringify(schema));
      updatedSchema['aso-app (apple, listing)'].data = updatedSchema['aso-app (apple, listing)'].data.map(
        (field) => (field['field key'] === 'name' ? { ...field, 'page leaf': '' } : field),
      );

      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        schema: updatedSchema,
        sheetMap,
      })).to.be.null;
    });

    it('returns null without schema or sheet map', () => {
      expect(getFieldPageMapping({
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        schema,
      })).to.be.null;
    });
  });

  describe('listSchemaFields', () => {
    it('returns listing fields with metadata from both configs', () => {
      const fields = listSchemaFields(schema, sheetMap, 'apple', 'listing');

      expect(fields.find((field) => field.fieldKey === 'name')).to.deep.include({
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        sheet: SHEET_METADATA,
      });
    });

    it('returns promo fields when promoName is provided', () => {
      const fields = listSchemaFields(schema, sheetMap, 'apple', 'promo', {
        promoName: 'comic-creator',
        promoVariant: 'default',
      });

      expect(fields.map((field) => field.fieldKey)).to.deep.equal([
        'eventName',
        'shortDescription',
        'longDescription',
      ]);
      expect(fields.every((field) => field.sheet === SHEET_PROMOS)).to.be.true;
    });
  });

  describe('getFieldsForPageLeaf', () => {
    it('returns fields sharing a page leaf', () => {
      const fields = getFieldsForPageLeaf({
        device: 'apple',
        blockType: 'images-videos',
        pageLeaf: 'images/copy',
        schema,
        sheetMap,
      });

      expect(fields.map((field) => field.fieldKey)).to.deep.equal(['screenshotsiPhoneCopy1']);
    });
  });

  describe('fieldAcceptsKeywords', () => {
    it('returns true when keywords injection is yes', () => {
      expect(fieldAcceptsKeywords({ 'keywords injection': 'Yes' })).to.be.true;
    });
  });

  describe('listMediaAssetFields', () => {
    it('lists media-assets fields with a resolved page leaf, no sheet required', () => {
      const fields = listMediaAssetFields(schema, 'apple');

      expect(fields).to.deep.equal([
        {
          fieldKey: 'screenshotsiPhone1',
          fieldName: 'Screenshot iPhone 1',
          pageLeaf: 'images/assets',
          blockKey: 'aso-app (apple, media-assets)',
        },
        {
          fieldKey: 'video1',
          fieldName: 'Video 1',
          pageLeaf: 'videos/assets',
          blockKey: 'aso-app (apple, media-assets)',
        },
      ]);
    });

    it('returns an empty array for a device with no media-assets schema', () => {
      expect(listMediaAssetFields(schema, 'windows')).to.deep.equal([]);
    });

    it('returns an empty array when schema is missing', () => {
      expect(listMediaAssetFields(null, 'apple')).to.deep.equal([]);
    });
  });
});
