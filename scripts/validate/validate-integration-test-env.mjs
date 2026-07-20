import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function validateIntegrationTestEnvironment(environment) {
    const resolvedEnvironment = environment ?? process.env

    if (!resolvedEnvironment.DATABASE_URL?.trim()) {
        return 'set DATABASE_URL and complete the documented database setup before running integration tests.'
    }

    return null
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const validationError = validateIntegrationTestEnvironment(process.env)

    if (validationError) {
        console.error(`[integration-validation] configuration failed: ${validationError}`)
        process.exitCode = 1
    }
}
