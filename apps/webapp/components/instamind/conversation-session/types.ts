export interface ConversationListItem {
    createdAt: string
    hasMessages: boolean
    id: string
    lastActiveAt: string
    selected: boolean
    title: string
}

export interface ConversationRegistryPayload {
    conversations: ConversationListItem[]
    limit: 10
    selectedConversationId: string | null
}
