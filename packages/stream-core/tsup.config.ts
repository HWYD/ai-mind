import { defineConfig } from 'tsup'

const entry = ['src/index.ts', 'src/protocol/index.ts', 'src/adapters/web/index.ts']

export default defineConfig(options => [
    {
        entry,
        format: ['esm'],
        outDir: 'build/esm',
        clean: !options.watch,
        dts: false,
        splitting: false,
        platform: 'node',
        target: 'esnext',
        outExtension() {
            return {
                js: '.mjs',
            }
        },
    },
    {
        entry,
        format: ['cjs'],
        outDir: 'build/cjs',
        clean: !options.watch,
        dts: false,
        splitting: false,
        platform: 'node',
        target: 'esnext',
        outExtension() {
            return {
                js: '.js',
            }
        },
    },
])
