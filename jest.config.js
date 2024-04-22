const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig.json')

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  // https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/
  roots: ['src'],
  modulePaths: [compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
  // Transform @dao-dao/* packages since they are not transpiled.
  transform: {
    'node_modules/@dao-dao/.+\\.tsx?': ['ts-jest'],
  },
  // node_modules is ignored by default, so override that behavior and allow
  // @dao-dao/* packages to be transformed by using a negative lookahead.
  transformIgnorePatterns: ['node_modules/(?!@dao-dao/.+\\.tsx?)'],
}
