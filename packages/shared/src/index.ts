export const PROJECT_NAME = 'VSIX Scout';
export const CLI_NAME = 'vsix-scout';
export const JSON_SCHEMA_VERSION = 1 as const;

export const REQUESTED_TARGET_PLATFORMS = [
  'win32-x64',
  'win32-arm64',
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'universal',
] as const;

export type RequestedTargetPlatform =
  (typeof REQUESTED_TARGET_PLATFORMS)[number];

export interface ExtensionReference {
  readonly id: string;
  readonly publisher: string;
  readonly name: string;
}
