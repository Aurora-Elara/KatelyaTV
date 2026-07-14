import { getConfig } from '@/lib/config';

import { builtInBookSources, createBookAdapter } from './adapters';
import { BookSourceAdapter, BookSourceConfig } from './types';

export async function getBookSourceConfigs(): Promise<BookSourceConfig[]> {
  const config = await getConfig();
  const custom = config.BookSourceConfig || [];
  const builtIns = builtInBookSources();
  const customKeys = new Set(custom.map((source) => source.key));
  return [
    ...builtIns.filter((source) => !customKeys.has(source.key)),
    ...custom,
  ];
}

export async function getEnabledBookAdapters(): Promise<BookSourceAdapter[]> {
  const configs = await getBookSourceConfigs();
  return configs
    .filter((config) => config.status === 'enabled')
    .map((config) => createBookAdapter(config));
}

export async function getBookAdapter(key: string): Promise<BookSourceAdapter> {
  const source = (await getBookSourceConfigs()).find(
    (config) => config.key === key && config.status === 'enabled'
  );
  if (!source) throw new Error('Book source is unavailable');
  return createBookAdapter(source);
}
