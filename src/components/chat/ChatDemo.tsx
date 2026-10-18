"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChatLauncher } from "./ChatLauncher";
import { ChatPanel, type ChatMessage, type ContextChip } from "./ChatPanel";

// Chat shell: the launcher and panel share one open state.

export type ChatDemoProps = {
  /** Whether the panel starts open. When closed, only the launcher shows. */
  initialOpen?: boolean;
  messages: ChatMessage[];
  contextChips: ContextChip[];
  /** Shows the typing indicator at mount. */
  typing?: boolean;
};

// Client wrapper for the chat mock: holds open/closed, messages and chips locally.
export function ChatDemo({
  initialOpen = true,
  messages: initialMessages,
  contextChips: initialChips,
  typing = false,
}: ChatDemoProps) {
  const [open, setOpen] = useState(initialOpen);
  const [messages, setMessages] = useState(initialMessages);
  const [chips, setChips] = useState(initialChips);
  const [pending, setPending] = useState(typing);
  const replyTimer = useRef<number | undefined>(undefined);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const returnFocusOnClose = useRef(false);

  useEffect(() => () => window.clearTimeout(replyTimer.current), []);

  // After the user closes the panel, put focus back on the launcher.
  useEffect(() => {
    if (!open && returnFocusOnClose.current) {
      returnFocusOnClose.current = false;
      launcherRef.current?.focus();
    }
  }, [open]);

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: `${role}-${Date.now()}`, role, text }]);
  }

  // Mock only: no model call. Shows the typing state, then a placeholder reply.
  function send(text: string) {
    addMessage("user", text);
    setPending(true);
    window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(() => {
      addMessage("assistant", "Noted. Live answers arrive once Gemini is wired up.");
      setPending(false);
    }, 1200);
  }

  // initial={false}: the launcher or panel present at mount does not animate.
  // Later swaps animate: the panel exits while the launcher enters.
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <ChatPanel
          key="chat-panel"
          messages={messages}
          contextChips={chips}
          onSend={send}
          onClose={() => {
            returnFocusOnClose.current = true;
            setOpen(false);
          }}
          onRemoveChip={(id) => setChips((prev) => prev.filter((chip) => chip.id !== id))}
          onUndo={() => addMessage("assistant", "Undone. The recipe is back to the original.")}
          onSearch={(query) => addMessage("assistant", `Searching for “${query}”.`)}
          typing={pending}
        />
      ) : (
        <ChatLauncher
          key="chat-launcher"
          buttonRef={launcherRef}
          onClick={() => setOpen(true)}
        />
      )}
    </AnimatePresence>
  );
}
