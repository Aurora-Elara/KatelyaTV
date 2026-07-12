import { AdminConfig } from './admin.types';

type SourceConfig = AdminConfig['SourceConfig'];
type FileSource = {
  api: string;
  name: string;
  detail?: string;
  is_adult?: boolean;
};

export function mergeFileSources(
  currentSources: SourceConfig,
  fileSources: Array<[string, FileSource]>
): SourceConfig {
  const currentByKey = new Map(
    currentSources.map((source) => [source.key, source])
  );
  const fileKeys = new Set(fileSources.map(([key]) => key));

  const mergedFileSources: SourceConfig = fileSources.map(([key, source]) => {
    const current = currentByKey.get(key);

    return {
      key,
      name: source.name,
      api: source.api,
      detail: source.detail,
      from: 'config',
      disabled: current?.disabled ?? false,
      is_adult: source.is_adult === true,
    };
  });

  const customSources = currentSources.filter(
    (source) => source.from === 'custom' && !fileKeys.has(source.key)
  );

  return [...mergedFileSources, ...customSources];
}
