import type { BaseStore } from '@langchain/langgraph'

export interface FakeBaseStoreItem {
    key: string
    namespace: string[]
    score?: number
    value: unknown
}

export interface FakeBaseStoreSearchOptions {
    limit?: number
    mode?: 'vector'
    query?: string
}

interface FakeBaseStoreSearchInput {
    items: FakeBaseStoreItem[]
    namespace: string[]
    options: FakeBaseStoreSearchOptions
}

type FakeBaseStoreSearchHandler = (input: FakeBaseStoreSearchInput) => FakeBaseStoreItem[] | Promise<FakeBaseStoreItem[]>

export interface FakeBaseStoreController {
    store: BaseStore
    getItem(namespace: string[], key: string): FakeBaseStoreItem | undefined
    getItems(namespacePrefix?: string[]): FakeBaseStoreItem[]
    setSearchHandler(handler?: FakeBaseStoreSearchHandler): void
}

function cloneItem(item: FakeBaseStoreItem): FakeBaseStoreItem {
    return {
        ...item,
        namespace: [...item.namespace],
    }
}

function toMapKey(namespace: string[], key: string): string {
    return JSON.stringify([namespace, key])
}

function namespaceStartsWith(namespace: string[], prefix: string[]): boolean {
    return prefix.every((segment, index) => namespace[index] === segment)
}

export function createFakeBaseStore(initialItems: FakeBaseStoreItem[] = []): FakeBaseStoreController {
    const items = new Map<string, FakeBaseStoreItem>()
    let searchHandler: FakeBaseStoreSearchHandler | undefined

    for (const item of initialItems) {
        items.set(toMapKey(item.namespace, item.key), cloneItem(item))
    }

    const store = {
        async delete(namespace: string[], key: string) {
            items.delete(toMapKey(namespace, key))
        },

        async get(namespace: string[], key: string) {
            const item = items.get(toMapKey(namespace, key))

            return item ? { key: item.key, namespace: [...item.namespace], value: item.value } : null
        },

        async listNamespaces() {
            const namespaces = new Map<string, string[]>()

            for (const item of items.values()) {
                namespaces.set(JSON.stringify(item.namespace), [...item.namespace])
            }

            return [...namespaces.values()]
        },

        async put(namespace: string[], key: string, value: unknown) {
            items.set(toMapKey(namespace, key), {
                key,
                namespace: [...namespace],
                value,
            })
        },

        async search(namespace: string[], options: FakeBaseStoreSearchOptions = {}) {
            const matched = [...items.values()].filter(item => namespaceStartsWith(item.namespace, namespace)).map(cloneItem)
            const resolved = searchHandler
                ? await searchHandler({
                      items: matched,
                      namespace: [...namespace],
                      options,
                  })
                : matched
            const limit = options.limit ?? resolved.length

            return resolved.slice(0, limit).map(cloneItem)
        },
    } as unknown as BaseStore

    return {
        store,
        getItem(namespace, key) {
            const item = items.get(toMapKey(namespace, key))

            return item ? cloneItem(item) : undefined
        },
        getItems(namespacePrefix = []) {
            return [...items.values()].filter(item => namespaceStartsWith(item.namespace, namespacePrefix)).map(cloneItem)
        },
        setSearchHandler(handler) {
            searchHandler = handler
        },
    }
}
