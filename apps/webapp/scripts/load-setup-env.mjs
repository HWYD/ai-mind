import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'

const DEFAULT_PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function loadSetupDatabaseUrlFromEnvFiles(projectRoot = DEFAULT_PROJECT_ROOT) {
    if (process.env.DATABASE_URL?.trim()) {
        return
    }

    for (const fileName of ['.env.local', '.env']) {
        const envPath = resolve(projectRoot, fileName)

        if (!existsSync(envPath)) {
            continue
        }

        loadEnv({
            override: false,
            path: envPath,
            quiet: true,
        })

        if (process.env.DATABASE_URL?.trim()) {
            return
        }
    }
}
