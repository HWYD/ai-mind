'use client'

import { useState, useCallback, useRef } from 'react'

interface UseOllamaStreamOptions {
  onChunk?: (chunk: string) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

export function useOllamaStream(options: UseOllamaStreamOptions = {}) {
  const [response, setResponse] = useState('')
  const [thinking, setThinking] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return

    setIsLoading(true)
    setResponse('')
    setThinking('')
    setError(null)
    
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/ollama', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const data = JSON.parse(line)
              if (data.response) {
                setResponse(prev => prev + data.response)
                options.onChunk?.(data.response)
              }
              // 显示思考过程
              if (data.thinking) {
                setThinking(prev => prev + data.thinking)
              }
              if (data.done) {
                break
              }
            } catch {
              continue
            }
          }
        }
      }
      
      options.onComplete?.()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request cancelled')
      } else {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred'
        setError(errorMessage)
        options.onError?.(err instanceof Error ? err : new Error(errorMessage))
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [options])

  return {
    response,
    thinking,
    isLoading,
    error,
    sendMessage,
    cancel,
  }
}