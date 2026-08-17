import { createHash } from 'crypto';

export type SampleTypeCategory = 'SOURCE_WELL' | 'POU_TAP' | 'OHR';

export type SourceTypeDefinition = {
  id: string;
  code: string;
  name: string;
  category: SampleTypeCategory;
  aliases: string[];
  sortOrder: number;
};

function sourceTypeId(code: string): string {
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 24);
  return `src_${hash}`;
}

/**
 * Dynamic water-source catalog. Labs can introduce new labels; add a row
 * (seed or admin) rather than changing the SampleType enum.
 */
export const SOURCE_TYPE_CATALOG: SourceTypeDefinition[] = [
  {
    id: sourceTypeId('TAP_WATER'),
    code: 'TAP_WATER',
    name: 'Tap water',
    category: 'POU_TAP',
    aliases: [
      'tap',
      'tap water',
      'point of use',
      'pou',
      'pou tap',
      'public tap',
      'stand post',
      'standpost',
    ],
    sortOrder: 10,
  },
  {
    id: sourceTypeId('SOURCE_WELL'),
    code: 'SOURCE_WELL',
    name: 'Source well',
    category: 'SOURCE_WELL',
    aliases: ['well', 'well water', 'source well', 'open well', 'dug well'],
    sortOrder: 20,
  },
  {
    id: sourceTypeId('HAND_PUMP'),
    code: 'HAND_PUMP',
    name: 'Hand pump',
    category: 'SOURCE_WELL',
    aliases: ['hand pump', 'handpump', 'hp'],
    sortOrder: 30,
  },
  {
    id: sourceTypeId('TUBEWELL'),
    code: 'TUBEWELL',
    name: 'Tubewell',
    category: 'SOURCE_WELL',
    aliases: ['tubewell', 'tube well', 'bore', 'borehole', 'bore well'],
    sortOrder: 40,
  },
  {
    id: sourceTypeId('SPRING'),
    code: 'SPRING',
    name: 'Spring',
    category: 'SOURCE_WELL',
    aliases: ['spring', 'spring water'],
    sortOrder: 50,
  },
  {
    id: sourceTypeId('OHR'),
    code: 'OHR',
    name: 'Overhead reservoir',
    category: 'OHR',
    aliases: ['ohr', 'overhead', 'overhead reservoir', 'overhead tank', 'oht'],
    sortOrder: 60,
  },
  {
    id: sourceTypeId('FILTER_PLANT'),
    code: 'FILTER_PLANT',
    name: 'Filter plant',
    category: 'POU_TAP',
    aliases: ['filter plant', 'filtration plant', 'wtp', 'treatment plant'],
    sortOrder: 70,
  },
  {
    id: sourceTypeId('OTHER'),
    code: 'OTHER',
    name: 'Other / unspecified',
    category: 'SOURCE_WELL',
    aliases: ['other', 'unknown', 'unspecified'],
    sortOrder: 900,
  },
];

export const DEFAULT_SOURCE_TYPE_BY_CATEGORY: Record<
  SampleTypeCategory,
  string
> = {
  POU_TAP: 'TAP_WATER',
  SOURCE_WELL: 'SOURCE_WELL',
  OHR: 'OHR',
};
