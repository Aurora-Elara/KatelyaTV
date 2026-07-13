import { AdminConfig } from './admin.types';
import { mergeFileSources } from './source-config';
import fileConfig from '../../config.json';

type SourceConfig = AdminConfig['SourceConfig'];

describe('mergeFileSources', () => {
  it('loads the verified source order and HTTPS endpoints', () => {
    const entries = Object.entries(fileConfig.api_site);

    expect(entries.map(([key]) => key)).toEqual([
      'gszy',
      'modu',
      'sb',
      'hn',
      'maoyan',
      'mdzy',
      'zy360',
      'ruyi',
      'uk',
      'wujin',
      'zuid',
      'lzi',
      'jisu',
      'bfzy',
      'huyazy',
      'ikun',
      'apibdzy',
      'ffzy',
      'lovedan',
    ]);
    expect(fileConfig.api_site.gszy.api).toBe(
      'https://api.guangsuapi.com/api.php/provide/vod'
    );
    expect(fileConfig.api_site.ruyi.api).toBe(
      'https://cj.rycjapi.com/api.php/provide/vod'
    );
  });

  it('replaces stale file sources and preserves custom sources', () => {
    const current: SourceConfig = [
      {
        key: 'legacy',
        name: 'Legacy source',
        api: 'https://legacy.example/vod',
        from: 'config',
        disabled: false,
      },
      {
        key: 'custom',
        name: 'Custom source',
        api: 'https://custom.example/vod',
        from: 'custom',
        disabled: true,
      },
    ];

    const result = mergeFileSources(current, [
      [
        'new-source',
        {
          name: 'New source',
          api: 'https://new.example/vod',
          is_adult: false,
        },
      ],
    ]);

    expect(result.map((source) => source.key)).toEqual([
      'new-source',
      'custom',
    ]);
    expect(result[1]).toEqual({ ...current[1], tier: 'discovery' });
  });

  it('uses file values while preserving the disabled state', () => {
    const current: SourceConfig = [
      {
        key: 'source',
        name: 'Old name',
        api: 'https://old.example/vod',
        from: 'config',
        disabled: true,
        is_adult: true,
      },
    ];

    const result = mergeFileSources(current, [
      [
        'source',
        {
          name: 'Updated name',
          api: 'https://updated.example/vod',
          is_adult: false,
        },
      ],
    ]);

    expect(result).toEqual([
      {
        key: 'source',
        name: 'Updated name',
        api: 'https://updated.example/vod',
        detail: undefined,
        from: 'config',
        disabled: true,
        is_adult: false,
        tier: 'primary',
      },
    ]);
  });

  it('keeps file ordering and ignores colliding custom keys', () => {
    const current: SourceConfig = [
      {
        key: 'first',
        name: 'Custom collision',
        api: 'https://custom.example/vod',
        from: 'custom',
      },
    ];

    const result = mergeFileSources(current, [
      ['first', { name: 'First', api: 'https://first.example/vod' }],
      ['second', { name: 'Second', api: 'https://second.example/vod' }],
    ]);

    expect(result.map((source) => source.key)).toEqual(['first', 'second']);
    expect(result[0].api).toBe('https://first.example/vod');
  });
});
