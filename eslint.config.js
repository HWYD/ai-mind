const eslint = require('@eslint/js')
const globals = require('globals')
const reactHooks = require('eslint-plugin-react-hooks')
const reactRefresh = require('eslint-plugin-react-refresh')
const eslintPrettier = require('eslint-plugin-prettier')
const importSort = require('eslint-plugin-simple-import-sort')

const tseslint = require('typescript-eslint')

const ignores = [
    'node_modules',
    '**/node_modules/**',
    'dist',
    '**/dist/**',
    'build',
    '**/build/**',
    'coverage',
    '**/coverage/**',
    '**/.turbo/**',
    'private-folder/**',
    '**/*.js',
    '**/*.mjs',
    'eslint.config.js',
    'commitlint.config.js',
    '**/.next/**',
    '**/generated/prisma/**',
    '**/out/**',
    '**/next-env.d.ts',
    '**/*.min.js',
]

const webappConfig = {
    files: ['apps/webapp/**/*.{ts,tsx}'],
    languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
    },
    plugins: {
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
    },
    rules: {
        ...reactHooks.configs.recommended.rules,
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        'react-hooks/incompatible-library': ['warn', { libraryName: 'react' }],
        'react-hooks/static-components': ['warn', { libraryName: 'react' }],
        'no-console': 'error',
    },
}

module.exports = tseslint.config(
    {
        ignores,
    },
    {
        extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
        plugins: {
            prettier: eslintPrettier,
            'simple-import-sort': importSort,
        },
        rules: {
            'prettier/prettier': 'error',
            'simple-import-sort/imports': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    webappConfig
)
