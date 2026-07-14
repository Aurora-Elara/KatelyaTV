import { BookSourceConfig } from './types';

export function requireHtmlRights(
  config: BookSourceConfig,
  fullText = false
): void {
  if (config.status !== 'enabled') {
    throw new Error('Book source is not enabled');
  }
  if (
    !config.rightsBasis ||
    !config.licenseUrl ||
    !config.rightsHolder ||
    !config.reviewedAt
  ) {
    throw new Error('Book source rights review is incomplete');
  }
  if (!config.allowedUses?.indexMetadata) {
    throw new Error('Metadata indexing is not licensed');
  }
  if (fullText && !config.allowedUses.displayFullText) {
    throw new Error('Full-text display is not licensed for this source');
  }
}
