'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { portfolioStore } from '@/lib/portfolioStore'
import { notifyWatchlistChanged } from '@/lib/watchlistEvents'
import type { ChatResponse } from '@/lib/types'
import { Panel } from './Panel'

interface Message {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
  actions?: Pick<ChatResponse, 'trades' | 'watchlist_changes'>
}

export function describeActions(actions: Message['actions']): { ok: boolean; text: string }[] {
  const trades = (actions?.trades ?? []).map((t) =>
    t.error
      ? { ok: false, text: `Failed to ${t.side} ${t.quantity} ${t.ticker}: ${t.error}` }
      : {
          ok: true,
          text: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.quantity} ${t.ticker}${
            t.price != null ? ` @ $${t.price.toFixed(2)}` : ''
          }`,
        },
  )
  const changes = (actions?.watchlist_changes ?? []).map((c) =>
    c.error
      ? { ok: false, text: `Failed to ${c.action} ${c.ticker} on watchlist: ${c.error}` }
      : { ok: true, text: `${c.action === 'add' ? 'Added' : 'Removed'} ${c.ticker} ${c.action === 'add' ? 'to' : 'from'} watchlist` },
  )
  return [...trades, ...changes]
}

export function ChatPanel({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const nextId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, loading])

  const push = (m: Omit<Message, 'id'>) =>
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    push({ role: 'user', text })
    setLoading(true)
    try {
      const res = await api.chat(text)
      push({
        role: 'assistant',
        text: res.message,
        actions: { trades: res.trades, watchlist_changes: res.watchlist_changes },
      })
      if (res.trades?.some((t) => !t.error)) await portfolioStore.refresh({ afterTrade: true })
      if (res.watchlist_changes?.some((c) => !c.error)) notifyWatchlistChanged()
    } catch (err) {
      push({ role: 'error', text: err instanceof Error ? err.message : 'Chat request failed' })
    } finally {
      setLoading(false)
    }
  }

  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? 'Collapse chat' : 'Expand chat'}
      onClick={() => setOpen((o) => !o)}
      className="text-muted hover:text-fg"
    >
      {open ? '»' : '«'}
    </button>
  )

  if (!open) {
    return (
      <aside aria-label="AI Assistant" className={`flex flex-col items-center border border-border bg-surface px-1 py-1.5 ${className}`}>
        {toggle}
      </aside>
    )
  }

  return (
    <Panel title="AI Assistant" className={className} actions={toggle}>
      <div className="flex h-full flex-col">
        <div role="log" aria-label="Chat history" className="min-h-0 flex-1 space-y-2 overflow-auto">
          {messages.length === 0 && (
            <p className="text-muted/60">Ask about your portfolio, or tell me to trade.</p>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          {loading && (
            <p role="status" aria-label="Loading" className="animate-pulse text-muted">
              FinAlly is thinking…
            </p>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} aria-label="Chat" className="mt-2 flex gap-1">
          <input
            aria-label="Message"
            placeholder="Message FinAlly"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="min-w-0 flex-1 border border-border bg-bg px-2 py-1 text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-secondary px-3 py-1 font-semibold text-fg hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </Panel>
  )
}

function MessageView({ message }: { message: Message }) {
  const confirmations = describeActions(message.actions)
  const style =
    message.role === 'user'
      ? 'ml-6 bg-surface-2 text-fg'
      : message.role === 'error'
        ? 'mr-6 border border-down/50 text-down'
        : 'mr-6 border border-border text-fg'
  return (
    <div data-role={message.role} role={message.role === 'error' ? 'alert' : undefined} className={`whitespace-pre-wrap px-2 py-1.5 ${style}`}>
      {message.text}
      {confirmations.length > 0 && (
        <ul aria-label="Executed actions" className="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-xs">
          {confirmations.map((c, i) => (
            <li key={i} className={c.ok ? 'text-up' : 'text-down'}>
              {c.ok ? '✓' : '✗'} {c.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
