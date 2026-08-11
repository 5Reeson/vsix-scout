import { ScoutError } from '@vsix-scout/core';
import type { ExtensionReference } from '@vsix-scout/shared';

const EXTENSION_ID_PATTERN =
  /^(?<publisher>[a-z0-9][a-z0-9-]*)\.(?<name>[a-z0-9][a-z0-9-]*)$/i;
const MARKETPLACE_HOST = 'marketplace.visualstudio.com';

function parseExtensionId(value: string): ExtensionReference | undefined {
  const match = EXTENSION_ID_PATTERN.exec(value.trim());
  const publisher = match?.groups?.publisher?.toLowerCase();
  const name = match?.groups?.name?.toLowerCase();

  if (publisher === undefined || name === undefined) {
    return undefined;
  }

  return {
    id: `${publisher}.${name}`,
    publisher,
    name,
  };
}

function extensionIdFromMarketplaceUrl(value: string): string | undefined {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== MARKETPLACE_HOST ||
    (url.port !== '' && url.port !== '443') ||
    url.username !== '' ||
    url.password !== '' ||
    !/^\/items\/?$/.test(url.pathname)
  ) {
    return undefined;
  }

  return url.searchParams.get('itemName') ?? undefined;
}

export function parseMarketplaceExtensionReference(
  input: string,
): ExtensionReference {
  const value = input.trim();
  const extensionId = value.includes('://')
    ? extensionIdFromMarketplaceUrl(value)
    : value;
  const reference =
    extensionId === undefined ? undefined : parseExtensionId(extensionId);

  if (reference === undefined) {
    throw new ScoutError(
      'INVALID_INPUT',
      'Expected publisher.extension or an official Visual Studio Marketplace item URL.',
      { details: { input } },
    );
  }

  return reference;
}
