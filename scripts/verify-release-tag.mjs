import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const tag = process.env.RELEASE_TAG;
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

if (tag !== `v${packageJson.version}`) {
  throw new Error(
    `Release tag ${JSON.stringify(tag)} does not match package version v${packageJson.version}.`,
  );
}

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

const tagType = git(['cat-file', '-t', tag]);
if (tagType.status !== 0 || tagType.stdout.trim() !== 'tag') {
  throw new Error(`Release tag ${tag} must be an annotated tag.`);
}

const onMain = git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
if (onMain.status !== 0) {
  throw new Error(`Release tag ${tag} does not point to a commit on main.`);
}

console.log(
  `Release tag ${tag} matches package version ${packageJson.version}.`,
);
