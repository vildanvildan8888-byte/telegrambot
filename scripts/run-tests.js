import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function testFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await testFiles(fullPath));
    else if (entry.name.endsWith('.test.js')) files.push(fullPath);
  }
  return files.sort();
}

for (const file of await testFiles(path.resolve('tests'))) {
  await import(pathToFileURL(file));
}
