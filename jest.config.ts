import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/fixtures/dynamodb-mock.ts'],
  moduleNameMapper: {
    '^@dmercato/types$': '<rootDir>/packages/shared/types/src',
    '^@dmercato/db$': '<rootDir>/packages/shared/db/src',
    '^@dmercato/renderer$': '<rootDir>/packages/lambdas/renderer/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: {
        ignoreDiagnostics: [2339, 7016],
      },
    }],
  },
  collectCoverageFrom: [
    'packages/**/src/**/*.ts',
    '!packages/**/src/**/index.ts',
    '!packages/frontend/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
