import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        exclude: ['tests/integration/**', 'tests/packaged/**'],
        globals: true,
        include: ['tests/unit/**/*.test.ts'],
        passWithNoTests: true,
        setupFiles: ['./vitest.setup.ts'],
    },
})
