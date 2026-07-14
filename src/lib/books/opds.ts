/* eslint-disable @typescript-eslint/no-explicit-any */

import { XMLParser } from 'fast-xml-parser';

export interface OpdsEntry {
  id: string;
  title: string;
  authors: string[];
  language: string;
  description?: string;
  cover?: string;
  links: Array<{ href: string; type?: string; rel?: string; title?: string }>;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOpdsJson(data: any): OpdsEntry[] {
  return (data.publications || data.navigation || []).map((item: any) => ({
    id: String(item.metadata?.identifier || item.href || item.metadata?.title),
    title: item.metadata?.title || item.title || 'Untitled',
    authors: asArray(item.metadata?.author).map((author: any) =>
      typeof author === 'string' ? author : author.name
    ),
    language: asArray(item.metadata?.language)[0] || 'unknown',
    description: item.metadata?.description,
    cover: asArray(item.images)[0]?.href,
    links: asArray(item.links).map((link: any) => ({
      href: link.href,
      type: link.type,
      rel: asArray(link.rel).join(' '),
      title: link.title,
    })),
  }));
}

export function parseOpdsXml(xml: string): OpdsEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const data = parser.parse(xml) as any;
  return asArray(data.feed?.entry).map((entry: any) => {
    const links = asArray(entry.link).map((link: any) => ({
      href: link['@_href'],
      type: link['@_type'],
      rel: link['@_rel'],
      title: link['@_title'],
    }));
    const cover = links.find((link) => /image|thumbnail/.test(link.rel || ''));
    return {
      id: String(entry.id || entry.title),
      title:
        typeof entry.title === 'object' ? entry.title['#text'] : entry.title,
      authors: asArray(entry.author).map((author: any) =>
        typeof author?.name === 'object' ? author.name['#text'] : author?.name
      ),
      language: entry['dc:language'] || entry.language || 'unknown',
      description: stripMarkup(
        typeof entry.content === 'object'
          ? entry.content['#text'] || ''
          : entry.content || entry.summary || ''
      ),
      cover: cover?.href,
      links,
    };
  });
}
