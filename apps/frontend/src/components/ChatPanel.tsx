import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/stores';
import { renderMarkdown } from '@/utils/renderMarkdown';
import type { ChatMessage } from '@/types';
import './ChatPanel.css';

const API_BASE = '/api';

interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const { state, dispatch } = useWorkspace();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState('deepseek-v4-flash');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatMessages]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  // Send message (streaming via /chat/stream)
  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '36px';

    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_CHAT_MESSAGE', message: userMsg });

    let sid = sessionId;
    if (!sid) {
      try {
        const sessRes = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: text.slice(0, 60) }),
        });
        const sessData = await sessRes.json();
        sid = sessData.id;
        setSessionId(sid);
      } catch (e) {
        console.error('Failed to create session:', e);
      }
    }

    const workspaceRoot = state.root?.path || undefined;
    const abortController = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          message: text,
          model: model || undefined,
          workspaceRoot,
        }),
        signal: abortController.signal,
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let latestModel = model;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const payload = dataLine.slice('data: '.length);
          try {
            const ev = JSON.parse(payload);
            if (ev.type === 'token' && ev.content) {
              dispatch({ type: 'APPEND_TO_LAST_ASSISTANT', token: ev.content });
            } else if (ev.type === 'tool_call') {
              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                message: {
                  id: `tool-call-${Date.now()}`,
                  role: 'tool',
                  content: `\`\`\`\n${ev.name}\n\`\`\``,
                  timestamp: new Date().toISOString(),
                },
              });
            } else if (ev.type === 'tool_result') {
              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                message: {
                  id: `tool-result-${Date.now()}`,
                  role: 'tool',
                  content: `\`\`\`\n${ev.name}: ${ev.content}\n\`\`\``,
                  timestamp: new Date().toISOString(),
                },
              });
            } else if (ev.type === 'done') {
              if (ev.session?.messages) {
                const serverMessages: ChatMessage[] = ev.session.messages.map(
                  (m: any, i: number) => ({
                    id: `${m.role}-${m.timestamp || Date.now()}-${i}`,
                    role: m.role,
                    content: m.content || '',
                    timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
                    metadata: m.model ? { model: m.model, provider: ev.provider } : undefined,
                  }),
                );
                dispatch({ type: 'SET_CHAT_MESSAGES', messages: serverMessages });
              }
            } else if (ev.type === 'error') {
              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                message: {
                  id: `err-${Date.now()}`,
                  role: 'assistant',
                  content: `⚠ ${ev.message || 'Stream error'}`,
                  timestamp: new Date().toISOString(),
                },
              });
            }
            if (ev.model) latestModel = ev.model;
          } catch {
            // ignore malformed events
          }
        }
      }

      setModel(latestModel);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      const errMsg: ChatMessage = {
        id: `net-${Date.now()}`,
        role: 'assistant',
        content: `⚠ Network error: ${e.message}`,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: errMsg });
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, model, state.root, dispatch]);

  // Submit on Enter (without Shift)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    },
    [sendChat],
  );

  // Render individual message
  const renderMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.role === 'user') {
        return (
          <div key={msg.id} className="chat-msg chat-msg--user">
            <div className="chat-msg__bubble">{msg.content}</div>
            <div className="chat-msg__meta">you</div>
          </div>
        );
      }

      if (msg.role === 'assistant') {
        return (
          <div key={msg.id} className="chat-msg chat-msg--assistant">
            <div
              className="chat-msg__bubble"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
            {msg.metadata?.model && (
              <div className="chat-msg__meta">{msg.metadata.model}</div>
            )}
          </div>
        );
      }

      if (msg.role === 'tool') {
        return (
          <div key={msg.id} className="chat-msg chat-msg--assistant">
            <div className="chat-tool-result">
              <div className="chat-tool-result__header">tool result</div>
              <div className="chat-tool-result__content">{msg.content}</div>
            </div>
          </div>
        );
      }

      return null;
    },
    [],
  );

  return (
    <aside className="chat-panel">
      <div className="chat-panel__resize" />

      <div className="chat-header">
        <span className="chat-header__title">Chat</span>
        <span className="chat-header__model">{model}</span>
        <button className="chat-header__close" onClick={onClose} title="Close chat">
          ✕
        </button>
      </div>

      <div className="chat-messages">
        {state.chatMessages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome__title">What are you working on?</div>
            <div>I can help you navigate, edit, and understand your codebase.</div>
          </div>
        ) : (
          state.chatMessages.map(renderMessage)
        )}
        {loading && (
          <div className="chat-msg chat-msg--assistant chat-msg--loading">
            <div className="chat-msg__bubble">Thinking…</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-composer">
        <textarea
          ref={textareaRef}
          className="chat-composer__input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            state.root ? `Ask about ${state.root.name}…` : 'Ask anything…'
          }
          rows={1}
          disabled={loading}
        />
        <button
          className="chat-composer__send"
          onClick={sendChat}
          disabled={!input.trim() || loading}
          title="Send"
        >
          ↑
        </button>
      </div>
    </aside>
  );
}