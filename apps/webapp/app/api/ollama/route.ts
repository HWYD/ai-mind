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

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    
    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaResponse.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                try {
                  const data = JSON.parse(line)
                  console.log('data', data)
                  if (data.response) {
                    controller.enqueue(encoder.encode(data.response))
                  }
                  if (data.done) {
                    controller.close()
                    return
                  }
                } catch {
                  continue
                }
              }
            }
            controller.close()
          } catch (error) {
            controller.error(error)
          } finally {
            reader.releaseLock()
          }
        }

        processStream()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Ollama API error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
