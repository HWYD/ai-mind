import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'qwen3:4b' } = await request.json()

    if (!prompt) {
      return new Response('Prompt is required', { status: 400 })
    }

    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
      }),
    })

    if (!ollamaResponse.ok) {
      return new Response('Failed to connect to Ollama', { status: 500 })
    }

    // 直接转发原始流
    const stream = ollamaResponse.body

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Ollama API error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
