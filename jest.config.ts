import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@dmercato/types$': '<rootDir>/packages/shared/types/src',
    '^@dmercato/db$': '<rootDir>/packages/shared/db/src',
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
