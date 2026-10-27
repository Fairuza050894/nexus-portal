module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'node_modules/',
    'artifacts/',
    'ketentuan/',
    'fixtures/',
    'docs/',
    'coverage/',
    '*.cjs',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': 'warn',
  },
};
