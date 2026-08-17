import { matchLocationHierarchy } from './location-matcher';

const catalog = [
  {
    id: 'teh_isa',
    name: 'ISA KHEL',
    villages: [
      {
        id: 'vil_kach',
        name: 'KACH TUNDER KHEL',
        settlements: [{ id: 'set_kach', name: 'KACH TUNDER KHEL' }],
      },
      {
        id: 'vil_masti',
        name: 'MASTI KHEL',
        settlements: [{ id: 'set_masti', name: 'MASTI KHEL' }],
      },
    ],
  },
  {
    id: 'teh_piplan',
    name: 'PIPLAN',
    villages: [
      {
        id: 'vil_ganda',
        name: 'GANDA',
        settlements: [{ id: 'set_ganda', name: 'GANDA' }],
      },
    ],
  },
];

describe('matchLocationHierarchy', () => {
  it('links Isa Khel / Kach Tunder Khel / same-named settlement from NWQL fields', () => {
    const matched = matchLocationHierarchy(
      {
        tehsilName: 'Isa khel',
        villageName: 'Kuch tunder Khel',
        locationDetail: 'Chughlan pumping station, Kuch tunder Khel',
        settlementHint: 'Chughlan pumping station',
      },
      catalog,
    );

    expect(matched.tehsilId).toBe('teh_isa');
    expect(matched.villageId).toBe('vil_kach');
    expect(matched.settlementId).toBe('set_kach');
    expect(matched.siteName).toBe('Chughlan pumping station');
    expect(matched.linked).toBe(true);
    expect(matched.warnings).toEqual([]);
  });

  it('does not pick a village from a different tehsil', () => {
    const matched = matchLocationHierarchy(
      {
        tehsilName: 'Piplan',
        villageName: 'Kuch tunder Khel',
        locationDetail: 'Chughlan pumping station',
        settlementHint: null,
      },
      catalog,
    );

    expect(matched.tehsilId).toBe('teh_piplan');
    expect(matched.villageId).toBeNull();
    expect(matched.linked).toBe(false);
  });

  it('resolves Masti Khel aliases to Isa Khel', () => {
    const matched = matchLocationHierarchy(
      {
        tehsilName: 'Isa khel',
        villageName: 'Masti Khail',
        locationDetail: 'Masti Khail Mianwali',
        settlementHint: null,
      },
      catalog,
    );

    expect(matched.tehsilName).toBe('ISA KHEL');
    expect(matched.villageName).toBe('MASTI KHEL');
    expect(matched.settlementName).toBe('MASTI KHEL');
  });
});
