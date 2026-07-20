import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const requiredCredentialNames = ['AI_MIND_QWEN_API_KEY', 'AI_MIND_DEEPSEEK_API_KEY']

export function validateExternalTestEnvironment(environment) {
    const resolvedEnvironment = environment ?? process.env

    if (resolvedEnvironment.AI_MIND_RUN_EXTERNAL_TESTS !== '1') {
        return 'set AI_MIND_RUN_EXTERNAL_TESTS=1 before running external tests.'
    }

    const missingCredentialNames = requiredCredentialNames.filter(credentialName => !resolvedEnvironment[credentialName]?.trim())

    if (missingCredentialNames.length > 0) {
        return `set ${missingCredentialNames.join(', ')} before running external tests.`
    }

    return null
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const validationError = validateExternalTestEnvironment(process.env)

    if (validationError) {
        console.error(`[external-validation] configuration failed: ${validationError}`)
        process.exitCode = 1
    }
}
