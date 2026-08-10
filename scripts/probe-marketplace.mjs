const QUERY_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const HISTORY_QUERY_FLAGS = 147;
const ASSET_TYPES = [
  'Microsoft.VisualStudio.Code.Manifest',
  'Microsoft.VisualStudio.Services.VSIXPackage',
];
const ENGINE_PROPERTY = 'Microsoft.VisualStudio.Code.Engine';
const PRE_RELEASE_PROPERTY = 'Microsoft.VisualStudio.Code.PreRelease';
const DEFAULT_EXTENSIONS = ['esbenp.prettier-vscode', 'ms-python.python'];

function isProperty(version, key, expectedValue) {
  return (version.properties ?? []).some(
    (property) =>
      property.key === key &&
      (expectedValue === undefined || property.value === expectedValue),
  );
}

async function query(extensionId) {
  const response = await fetch(QUERY_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=3.0-preview.1',
      'Content-Type': 'application/json',
      'User-Agent': 'vsix-scout-phase-0-probe',
    },
    body: JSON.stringify({
      filters: [
        {
          criteria: [{ filterType: 7, value: extensionId }],
          pageNumber: 1,
          pageSize: 1,
        },
      ],
      assetTypes: ASSET_TYPES,
      flags: HISTORY_QUERY_FLAGS,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Marketplace returned HTTP ${response.status} for ${extensionId}`,
    );
  }

  const payload = await response.json();
  const extensions = payload?.results?.[0]?.extensions;
  const extension = Array.isArray(extensions)
    ? extensions.find(
        (candidate) =>
          `${candidate.publisher?.publisherName}.${candidate.extensionName}`.toLowerCase() ===
          extensionId.toLowerCase(),
      )
    : undefined;

  if (extension === undefined || !Array.isArray(extension.versions)) {
    throw new Error(`Extension ${extensionId} was not found in the response`);
  }

  const versions = extension.versions;
  return {
    extensionId,
    variantCount: versions.length,
    distinctVersionCount: new Set(versions.map((version) => version.version))
      .size,
    platforms: [
      ...new Set(
        versions.map((version) => version.targetPlatform ?? 'universal'),
      ),
    ].sort(),
    preReleaseVariantCount: versions.filter((version) =>
      isProperty(version, PRE_RELEASE_PROPERTY, 'true'),
    ).length,
    missingEngineVariantCount: versions.filter(
      (version) => !isProperty(version, ENGINE_PROPERTY),
    ).length,
    latestVariant: {
      version: versions[0]?.version,
      targetPlatform: versions[0]?.targetPlatform ?? 'universal',
      hasManifest: (versions[0]?.files ?? []).some(
        (file) => file.assetType === ASSET_TYPES[0],
      ),
      hasVsix: (versions[0]?.files ?? []).some(
        (file) => file.assetType === ASSET_TYPES[1],
      ),
    },
  };
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Usage: pnpm probe:marketplace [publisher.extension ...]\n' +
      'Queries public metadata only; it does not download or execute a VSIX.',
  );
  process.exit(0);
}

const extensionIds = args.length === 0 ? DEFAULT_EXTENSIONS : args;
const invalidId = extensionIds.find(
  (value) => !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(value),
);

if (invalidId !== undefined) {
  console.error(`Invalid extension ID: ${invalidId}`);
  process.exit(2);
}

try {
  const summaries = [];
  for (const extensionId of extensionIds) {
    summaries.push(await query(extensionId));
  }
  console.log(JSON.stringify(summaries, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
