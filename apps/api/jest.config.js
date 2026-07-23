/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/openapi.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  // Nest DI đọc metadata do emitDecoratorMetadata sinh ra; thiếu import này thì
  // provider không resolve được và lỗi chỉ hiện lúc chạy test, rất khó đọc.
  setupFiles: ['reflect-metadata'],
};
