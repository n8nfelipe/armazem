"use client";

import { FormEvent, useRef, useState } from "react";
import { sendAgentMessage } from "@/lib/products";

type ChatMessage = { role: "agent" | "user"; text: string; restricted?: boolean };

const welcome: ChatMessage = {
  role: "agent",
  text: "Agente ativo. Posso ajudar com estoque, vendas, produtos, fornecedores, pedidos e reposição automática.",
};

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setDraft("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setSending(true);
    try {
      const reply = await sendAgentMessage(message);
      setMessages((current) => [
        ...current,
        { role: "agent", text: reply.message, restricted: reply.restricted },
      ]);
    } catch (reason) {
      setMessages((current) => [
        ...current,
        { role: "agent", text: reason instanceof Error ? reason.message : "Não foi possível consultar o agente." },
      ]);
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function useSuggestion(suggestion: string) {
    setDraft(suggestion);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <>
      <button
        className="live-indicator agent-trigger"
        type="button"
        role="status"
        aria-label="Agente ativo. Abrir conversa"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <i aria-hidden="true" /> AGENTE ATIVO
      </button>

      {open && (
        <section className="agent-chat" aria-label="Conversa com o agente" aria-live="polite">
          <header className="agent-chat-head">
            <div>
              <strong>Agente de estoque</strong>
              <span><i /> ativo · contexto operacional</span>
            </div>
            <button type="button" className="agent-chat-close" aria-label="Fechar conversa" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="agent-chat-body">
            {messages.map((message, index) => (
              <div className={`agent-chat-message ${message.role}${message.restricted ? " restricted" : ""}`} key={`${message.role}-${index}`}>
                {message.text}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="agent-suggestions">
                <span>EXPERIMENTE</span>
                <button type="button" onClick={() => useSuggestion("Quais produtos estão no limite?")}>Quais produtos estão no limite?</button>
                <button type="button" onClick={() => useSuggestion("Como melhorar a reposição automática?")}>Como melhorar a reposição?</button>
              </div>
            )}
            {sending && <div className="agent-chat-message agent typing">Consultando o estoque…</div>}
          </div>
          <form className="agent-chat-form" onSubmit={submit}>
            <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Pergunte sobre o estoque…" maxLength={1000} aria-label="Mensagem para o agente" />
            <button type="submit" aria-label="Enviar mensagem" disabled={sending || !draft.trim()}>Enviar</button>
          </form>
          <p className="agent-chat-note">O agente não fornece credenciais nem responde fora do sistema.</p>
        </section>
      )}
    </>
  );
}
