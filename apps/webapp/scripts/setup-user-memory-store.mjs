import { runUserMemoryStoreSetup } from './setup-user-memory-store-lib.mjs'

try {
    await import('dotenv/config')
} catch {
    // Production runner images receive DATABASE_URL from Compose / server env,
    // so dotenv is optional for this one-shot setup script.
}

await runUserMemoryStoreSetup()
