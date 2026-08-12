/** Unit tests: colocated *.spec.ts next to source, no Docker/network required. */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Transpile-only (isolatedModules: true, set in tsconfig.json): type-
  // checking is already covered by `npm run build` and eslint's typed
  // linting — ts-jest doing it again per file too is the difference
  // between ~60s and ~2s for this suite.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
};
