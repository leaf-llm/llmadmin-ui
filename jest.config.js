/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },
  testTimeout: 30000,
  testPathIgnorePatterns: ['/node_modules/', 'tests/integration/', 'src/tests/'],
};
