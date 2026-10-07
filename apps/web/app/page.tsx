"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

type Source = {
  source: string;
  chunk: number;
  similarity: number;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  sources?: Source[];
};

type DocumentResult = {
  document: {
    source: string;
    status: "indexed" | "unchanged";
    chunks: number;
  };
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

function isSource(value: unknown): value is Source {
  return (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "string" &&
    "chunk" in value &&
    typeof value.chunk === "number" &&
    "similarity" in value &&
    typeof value.similarity === "number"
  );
}

function isAnswerPayload(
  value: unknown,
): value is { answer: string; sources: Source[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "answer" in value &&
    typeof value.answer === "string" &&
    "sources" in value &&
    Array.isArray(value.sources) &&
    value.sources.every(isSource)
  );
}

const SUGGESTIONS = [
  "Summarize the key points",
  "What should I know first?",
  "Find the most important details",
];

function Icon({
  name,
  size = 20,
}: {
  name: "spark" | "plus" | "arrow" | "paperclip" | "book" | "panel" | "check";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "spark":
      return (
        <svg {...common}>
          <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
          <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M12 19V5m-7 7 7-7 7 7" />
        </svg>
      );
    case "paperclip":
      return (
        <svg {...common}>
          <path d="m8 12.5 6.7-6.7a3.2 3.2 0 0 1 4.5 4.5l-8.5 8.5a5 5 0 0 1-7-7l8.3-8.3" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
          <path d="M4 17a2 2 0 0 1 2-2h14M8 7h8m-8 4h7" />
        </svg>
      );
    case "panel":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(5);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [uploadNotice, setUploadNotice] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;

    async function checkApi() {
      try {
        const response = await fetch(`${API_URL}/health`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("API is unavailable");
        if (active) setApiOnline(true);
      } catch {
        if (active) setApiOnline(false);
      }
    }

    void checkApi();
    const interval = window.setInterval(checkApi, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || isSending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setError("");
    setUploadNotice("");
    setIsSending(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, topK }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "The assistant could not answer right now.";
        throw new Error(message);
      }
      if (!isAnswerPayload(payload)) {
        throw new Error("The API returned an unexpected answer.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.answer,
          sources: payload.sources,
        },
      ]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setUploadNotice("");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/documents`, {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "The document could not be indexed.";
        throw new Error(message);
      }
      const result = payload as DocumentResult;
      const status =
        result.document.status === "indexed"
          ? `Added ${file.name} · ${result.document.chunks} chunks indexed`
          : `${file.name} is already indexed`;
      setUploadNotice(status);
      setApiOnline(true);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setIsUploading(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setError("");
    setUploadNotice("");
    setQuestion("");
    textareaRef.current?.focus();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div className="sidebar-top">
          <Link className="brand" href="/" aria-label="Knowly home">
            <span className="brand-mark">
              <Icon name="spark" size={19} />
            </span>
            {sidebarOpen && <span className="brand-name">knowly</span>}
          </Link>
          <button
            className="icon-button sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Icon name="panel" size={18} />
          </button>
        </div>

        {sidebarOpen && (
          <>
            <button className="new-chat-button" type="button" onClick={startNewChat}>
              <Icon name="plus" size={18} />
              <span>New chat</span>
              <kbd>⌘ K</kbd>
            </button>

            <div className="sidebar-section">
              <p className="section-label">YOUR WORKSPACE</p>
              <div className="workspace-card">
                <span className="workspace-icon">
                  <Icon name="book" size={17} />
                </span>
                <span className="workspace-copy">
                  <strong>My knowledge</strong>
                  <small>Ask across your documents</small>
                </span>
                <span
                  className={`status-dot ${apiOnline ? "online" : apiOnline === false ? "offline" : ""}`}
                />
              </div>
            </div>

            <div className="sidebar-tip">
              <span className="tip-icon">
                <Icon name="spark" size={16} />
              </span>
              <p>
                <strong>Your docs, connected.</strong>
                Upload a file and ask questions. Answers are grounded in your
                sources.
              </p>
            </div>
          </>
        )}

        <div className="sidebar-footer">
          <span className="avatar">P</span>
          {sidebarOpen && (
            <div className="profile-copy">
              <strong>Personal workspace</strong>
              <small>Local & private</small>
            </div>
          )}
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            {!sidebarOpen && (
              <button
                className="icon-button expand-button"
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Icon name="panel" size={18} />
              </button>
            )}
            <span>My knowledge</span>
            <span className="breadcrumb-divider">/</span>
            <strong>New conversation</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-label ${apiOnline === false ? "connection-offline" : ""}`}
              role="status"
            >
              <i />
              {apiOnline === null
                ? "Connecting"
                : apiOnline
                  ? "Local AI ready"
                  : "API offline"}
            </span>
            <button
              className="topbar-upload"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Icon name="plus" size={16} />
              <span>{isUploading ? "Adding…" : "Add documents"}</span>
            </button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".pdf,.docx,.pptx,.xlsx,.html,.md,.txt"
          onChange={uploadDocument}
        />

        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-badge">
                <Icon name="spark" size={20} />
                <span>Your private knowledge assistant</span>
              </div>
              <h1>
                Good ideas start
                <br />
                with <span>good questions.</span>
              </h1>
              <p className="welcome-description">
                Ask anything about your documents. I’ll find the relevant
                details and show you where they came from.
              </p>

              <div className="suggestions">
                {SUGGESTIONS.map((suggestion, index) => (
                  <button
                    className="suggestion-card"
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setQuestion(suggestion);
                      textareaRef.current?.focus();
                    }}
                  >
                    <span className={`suggestion-icon suggestion-icon-${index + 1}`}>
                      <Icon name={index === 1 ? "book" : "spark"} size={17} />
                    </span>
                    <span>{suggestion}</span>
                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>

              <button
                className="upload-prompt"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <span className="upload-prompt-icon">
                  <Icon name={isUploading ? "check" : "paperclip"} size={18} />
                </span>
                <span>
                  <strong>
                    {isUploading
                      ? "Indexing your document…"
                      : "Start by adding a document"}
                  </strong>
                  <small>PDF, Word, PowerPoint, Excel, Markdown & more</small>
                </span>
                <span className="upload-prompt-action">
                  {isUploading ? "Working" : "Browse files"}
                </span>
              </button>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article
                  className={`message message-${message.role}`}
                  key={message.id}
                >
                  {message.role === "assistant" ? (
                    <span className="message-avatar">
                      <Icon name="spark" size={17} />
                    </span>
                  ) : (
                    <span className="user-avatar">P</span>
                  )}
                  <div className="message-body">
                    <p className="message-author">
                      {message.role === "assistant" ? "Knowly" : "You"}
                    </p>
                    <p className="message-content">{message.content}</p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="sources">
                        <p className="sources-heading">
                          <Icon name="book" size={14} />
                          Sources
                        </p>
                        <div className="source-list">
                          {message.sources.map((source, index) => (
                            <div
                              className="source-card"
                              key={`${source.source}-${source.chunk}-${index}`}
                            >
                              <span className="source-number">{index + 1}</span>
                              <span className="source-name">
                                {source.source.split(/[\\/]/).pop()}
                                <small>
                                  Chunk {source.chunk + 1}
                                  {Number.isFinite(source.similarity)
                                    ? ` · ${Math.round(source.similarity * 100)}% match`
                                    : ""}
                                </small>
                              </span>
                              <Icon name="book" size={15} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {isSending && (
                <article className="message message-assistant">
                  <span className="message-avatar">
                    <Icon name="spark" size={17} />
                  </span>
                  <div className="message-body">
                    <p className="message-author">Knowly</p>
                    <div className="typing-indicator" aria-label="Thinking">
                      <i />
                      <i />
                      <i />
                      <span>Searching your knowledge</span>
                    </div>
                  </div>
                </article>
              )}
              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        {(error || uploadNotice) && (
          <div
            className={`notice ${error ? "notice-error" : "notice-success"}`}
            role={error ? "alert" : "status"}
          >
            {error || uploadNotice}
            <button
              type="button"
              onClick={() => {
                setError("");
                setUploadNotice("");
              }}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}

        <div className="composer-wrap">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask a question about your documents..."
              rows={1}
              maxLength={4000}
              aria-label="Ask a question about your documents"
            />
            <div className="composer-tools">
              <div className="composer-left">
                <button
                  className="composer-tool"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Add a document"
                >
                  <Icon name="paperclip" size={17} />
                  <span>{isUploading ? "Indexing…" : "Add context"}</span>
                </button>
                <span className="tool-divider" />
                <label className="topk-control">
                  <span>Sources</span>
                  <select
                    value={topK}
                    onChange={(event) => setTopK(Number(event.target.value))}
                    aria-label="Number of sources to retrieve"
                  >
                    {[3, 5, 8, 10].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="composer-right">
                <span className="keyboard-hint">
                  <kbd>↵</kbd> to send
                </span>
                <button
                  className="send-button"
                  type="submit"
                  disabled={!question.trim() || isSending}
                  aria-label="Send message"
                >
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </div>
          </form>
          <p className="privacy-note">
            <span className="privacy-dot" />
            Your documents stay on your machine. Answers can make mistakes —
            check the sources.
          </p>
        </div>
      </section>
    </main>
  );
}
