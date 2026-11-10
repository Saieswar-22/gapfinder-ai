'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: { document: string; page: number }[];
  isInsufficient?: boolean;
}

function cleanMathText(str: string): string {
  return str
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\;\s*\\;\s*\\Rightarrow\s*\\;\s*\\;/g, ' => ')
    .replace(/\\Rightarrow/g, ' => ')
    .replace(/\\rightarrow/g, ' -> ')
    .replace(/\\neq/g, ' ≠ ')
    .replace(/\\ge/g, ' ≥ ')
    .replace(/\\le/g, ' ≤ ')
    .replace(/<br\s*\/?>/gi, ' ');
}

function renderInlineText(text: string) {
  const cleaned = cleanMathText(text);
  const parts = cleaned.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderTable(block: string, key: number) {
  const rawLines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (rawLines.length === 0) return null;

  const rows = rawLines.map((line) =>
    line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
  );

  const headerRow = rows[0];
  const isSeparator = (r: string[]) => r.every((cell) => /^[-:\s]+$/.test(cell));
  const dataRows = rows.slice(1).filter((r) => !isSeparator(r));

  return (
    <div key={key} className="overflow-x-auto my-3 border border-gray-300 rounded shadow-sm">
      <table className="min-w-full text-xs text-left divide-y divide-gray-200">
        <thead className="bg-gray-100 font-semibold text-gray-800">
          <tr>
            {headerRow.map((h, i) => (
              <th key={i} className="px-3 py-2 border-r last:border-r-0 border-gray-200">
                {renderInlineText(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {dataRows.map((row, rIdx) => (
            <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-1.5 border-r last:border-r-0 border-gray-200 text-gray-800">
                  {renderInlineText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormattedContent({ content }: { content: string }) {
  if (!content) return null;
  const paragraphs = content.split(/\n\s*\n/);

  return (
    <div className="space-y-2.5">
      {paragraphs.map((p, i) => {
        const trimmed = p.trim();

        // Horizontal rule
        if (/^[-*_]{3,}$/.test(trimmed)) {
          return <hr key={i} className="my-3 border-gray-300" />;
        }

        // Table block
        if (
          trimmed.includes('|') &&
          trimmed.split('\n').some((l) => l.trim().startsWith('|') && l.trim().endsWith('|'))
        ) {
          return renderTable(trimmed, i);
        }

        // Headings
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          const heading = trimmed.replace(/^#+\s*/, '');
          return (
            <h4 key={i} className="font-bold text-xs text-gray-900 mt-3 mb-1 border-b border-gray-200 pb-1">
              {renderInlineText(heading)}
            </h4>
          );
        }

        // Lists
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
          const lines = trimmed.split('\n');
          return (
            <ul key={i} className="list-disc list-inside space-y-1 pl-1 text-xs">
              {lines.map((line, j) => {
                const cleaned = line.replace(/^(\*|-|\d+\.)\s*/, '');
                return <li key={j}>{renderInlineText(cleaned)}</li>;
              })}
            </ul>
          );
        }

        return (
          <p key={i} className="text-xs leading-relaxed">
            {renderInlineText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export default function AssistantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);
  const searchParams = useSearchParams();
  const initialTopic = searchParams.get('topic') || '';

  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState(initialTopic);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadTopics() {
      try {
        const res = await fetch(`/api/subjects/${subjectId}/topics`);
        if (res.ok) {
          const data = await res.json();
          const list: string[] = [];
          function collect(nodes: any[]) {
            for (const n of nodes) {
              list.push(n.name);
              if (n.children) collect(n.children);
            }
          }
          collect(data.topics || []);
          setAvailableTopics(list);
        }
      } catch {
        // silent
      }
    }
    loadTopics();
  }, [subjectId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(textToSend?: string) {
    const question = (textToSend || input).trim();
    if (!question || streaming) return;

    setError('');
    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      citations: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setStreaming(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`/api/subjects/${subjectId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          topicName: selectedTopic || undefined,
          history,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || 'Failed to get answer');
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        setStreaming(false);
        return;
      }

      // Read citations from header
      const citationsHeader = res.headers.get('X-Citations');
      let citations: { document: string; page: number }[] = [];
      if (citationsHeader) {
        try {
          citations = JSON.parse(decodeURIComponent(citationsHeader));
        } catch {
          // silent
        }
      }

      const isInsufficient = res.headers.get('X-Insufficient') === 'true';

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulated,
                  citations,
                  isInsufficient,
                }
              : m
          )
        );
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with assistant');
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold">Explain This Topic</h2>
        <p className="text-xs text-gray-500">
          Ask questions answered ONLY from your uploaded study materials with verbatim citations. No hallucinations or outside knowledge.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Topic selection & Quick Prompts */}
      <div className="border border-gray-200 rounded p-3 mb-4 bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs w-full sm:w-auto">
          <label className="text-gray-600 whitespace-nowrap">Focus Topic:</label>
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="border border-gray-300 rounded p-1.5 bg-white text-xs w-full sm:w-64"
          >
            <option value="">General (Search All Materials)</option>
            {availableTopics.map((t, idx) => (
              <option key={idx} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleSend(selectedTopic ? `Explain ${selectedTopic} simply and clearly.` : 'Explain the core concepts simply.')}
            disabled={streaming}
            className="text-[11px] bg-white border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-100 disabled:opacity-50"
          >
            Explain simply
          </button>
          <button
            type="button"
            onClick={() => handleSend(selectedTopic ? `Give a practical example or problem for ${selectedTopic} from the notes.` : 'Give an example from the uploaded material.')}
            disabled={streaming}
            className="text-[11px] bg-white border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-100 disabled:opacity-50"
          >
            Give an example
          </button>
          <button
            type="button"
            onClick={() => handleSend(selectedTopic ? `What are the key formulas, rules, or definitions for ${selectedTopic}?` : 'What are the main definitions and rules?')}
            disabled={streaming}
            className="text-[11px] bg-white border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-100 disabled:opacity-50"
          >
            Key definitions
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="border border-gray-200 rounded p-4 bg-white min-h-[350px] max-h-[550px] overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16 text-xs">
            <p className="font-semibold text-gray-600 mb-1">No conversation yet</p>
            <p>Select a topic above or ask any question about your uploaded documents.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded p-3 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-900 rounded-bl-none border border-gray-200'
                }`}
              >
                {m.role === 'assistant' ? (
                  m.content ? (
                    <FormattedContent content={m.content} />
                  ) : (
                    <p className="text-gray-500 italic">Thinking...</p>
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}

                {/* Grounded Citations List */}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-300/60 text-[10px] text-gray-600">
                    <span className="font-semibold block mb-0.5 text-gray-800">Sources:</span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {m.citations.map((c, idx) => (
                        <li key={idx}>
                          {c.document}, Page {c.page}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {m.isInsufficient && (
                  <p className="mt-2 text-[10px] text-amber-700 font-semibold bg-amber-50 p-1 rounded">
                    ⚠ Answer limited: topic is not fully detailed in current uploads.
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Chat Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex space-x-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            selectedTopic
              ? `Ask a question about ${selectedTopic}...`
              : 'Ask a question about your uploaded materials...'
          }
          disabled={streaming}
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="bg-blue-600 text-white text-xs px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {streaming ? 'Generating...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

