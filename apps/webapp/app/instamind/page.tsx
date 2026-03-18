'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useOllamaStream } from './useOllamaStream'

const ResponseDisplay = React.memo(({ response, thinking, isLoading }: { response: string; thinking: string; isLoading: boolean }) => {
  const responseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response, thinking])

  if (!response && !thinking && !isLoading) return null

  return (
    <div style={{ 
      border: '1px solid #ccc', 
      padding: '15px', 
      borderRadius: '5px',
      maxHeight: '400px',
      overflowY: 'auto',
    }} ref={responseRef}>
      <h3 style={{ marginTop: 0 }}>Response:</h3>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {response}
        {!response && isLoading && (
          <span style={{ opacity: 0.5 }}>Thinking: {thinking}</span>
        )}
        {isLoading && <span style={{ opacity: 0.5 }}>▋</span>}
      </div>
    </div>
  )
})

ResponseDisplay.displayName = 'ResponseDisplay'

export default function Page() {
  const [prompt, setPrompt] = useState('')
  const responseContainerRef = useRef<HTMLDivElement>(null)

  const { response, thinking, isLoading, error, sendMessage, cancel } = useOllamaStream()

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) {
      cancel()
    } else {
      sendMessage(prompt)
    }
  }, [prompt, isLoading, sendMessage, cancel])

  const containerStyle = useMemo(() => ({
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
  }), [])

  const textareaStyle = useMemo(() => ({
    width: '100%',
    minHeight: '100px',
    padding: '10px',
    marginBottom: '10px',
    fontSize: '16px',
    resize: 'vertical' as const,
  }), [])

  const buttonStyle = useMemo(() => ({
    padding: '10px 20px',
    fontSize: '16px',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    backgroundColor: isLoading ? '#ff4444' : '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    marginRight: '10px',
  }), [isLoading])

  return (
    <div style={containerStyle}>
      <h1>Hello InstantMind</h1>
      
      {error && (
        <div style={{ 
          backgroundColor: '#ffebee', 
          color: '#c62828', 
          padding: '10px', 
          borderRadius: '5px', 
          marginBottom: '15px' 
        }}>
          Error: {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt here..."
          style={textareaStyle}
          disabled={isLoading}
        />
        <div>
          <button
            type="submit"
            style={buttonStyle}
          >
            {isLoading ? 'Cancel' : 'Send'}
          </button>
        </div>
      </form>
      
      <ResponseDisplay response={response} thinking={thinking} isLoading={isLoading} />
    </div>
  )
}