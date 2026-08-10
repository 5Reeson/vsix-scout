import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const [{ filename }] = JSON.parse(await readFile('pack-result.json', 'utf8'));
const tarball = await readFile(filename);
const checksum = createHash('sha256').update(tarball).digest('hex');

await writeFile(`${filename}.sha256`, `${checksum}  ${filename}\n`, 'utf8');

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile === undefined) {
  throw new Error('GITHUB_OUTPUT is not available.');
}
await appendFile(outputFile, `tarball=${filename}\n`, 'utf8');

console.log(`Prepared ${filename} (${checksum}).`);
