export const chatModelOptions = ['qwen3:4b', 'qwen3:8b', 'qwen3:14b', 'qwen-vl:2b', 'mxbai-embed-large:latest'] as const

export type ChatModel = (typeof chatModelOptions)[number]

export const defaultChatModel: ChatModel = 'qwen3:8b'
