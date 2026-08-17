import { SOURCE_TYPE_CATALOG } from './source-types.catalog';
import { matchSourceType } from './source-type-matcher';

describe('matchSourceType', () => {
  it('maps NWQL Tap water to TAP_WATER / POU_TAP', () => {
    const matched = matchSourceType('Tap water', SOURCE_TYPE_CATALOG);
    expect(matched.unmatched).toBe(false);
    expect(matched.sourceType?.code).toBe('TAP_WATER');
    expect(matched.sourceType?.category).toBe('POU_TAP');
  });

  it('maps Well water to SOURCE_WELL', () => {
    const matched = matchSourceType('Well water', SOURCE_TYPE_CATALOG);
    expect(matched.sourceType?.code).toBe('SOURCE_WELL');
    expect(matched.unmatched).toBe(false);
  });

  it('maps hand pump and tubewell aliases without a schema change', () => {
    expect(
      matchSourceType('Hand pump', SOURCE_TYPE_CATALOG).sourceType?.code,
    ).toBe('HAND_PUMP');
    expect(
      matchSourceType('Tube well', SOURCE_TYPE_CATALOG).sourceType?.code,
    ).toBe('TUBEWELL');
  });

  it('keeps unknown lab labels unmatched so they can be added later', () => {
    const matched = matchSourceType('Canal water', SOURCE_TYPE_CATALOG);
    expect(matched.unmatched).toBe(true);
    expect(matched.sourceType?.code).toBe('OTHER');
  });
});
