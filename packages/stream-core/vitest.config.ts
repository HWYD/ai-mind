export default {
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        passWithNoTests: true,
        globals: true,
    },
}
