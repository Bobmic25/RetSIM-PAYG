import { useEffect, useMemo, useState } from 'react';
import { Bot, MessageSquareText, RotateCcw, Send, Sparkles, User, X } from 'lucide-react';
import {
  AssistantContext,
  AssistantEntryPoint,
  AssistantMessage,
  clearAssistantHistory,
  createAssistantMessage,
  getAssistantResponse,
  loadAssistantHistory,
  saveAssistantHistory,
  getStarterPrompts,
} from '../lib/assistantService';

interface AssistantPanelProps {
  isOpen: boolean;
  entryPoint: AssistantEntryPoint;
  context: AssistantContext;
  onClose: () => void;
}

const ENTRY_TITLES: Record<AssistantEntryPoint, string> = {
  header: 'Planning Assistant',
  results: 'Results Assistant',
};

const ENTRY_SUBTITLES: Record<AssistantEntryPoint, string> = {
  header: 'Ask how to use the app or what each section does.',
  results: 'Ask what your current results mean and what the simulator is doing.',
};

export default function AssistantPanel({ isOpen, entryPoint, context, onClose }: AssistantPanelProps) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);

  const starterPrompts = useMemo(() => getStarterPrompts(entryPoint, context), [entryPoint, context]);
  const storageKey = useMemo(() => context.scenarioKey, [context.scenarioKey]);

  const createWelcomeMessage = () => createAssistantMessage(
    'assistant',
    entryPoint === 'results' && context.hasResults
      ? 'I can explain the current projection, funding status, tax view, withdrawal strategy, and how this simulation is behaving.'
      : 'I can help you use the planner, explain what each tab does, and answer app-specific questions about the retirement model.',
    ['Getting started']
  );

  useEffect(() => {
    if (!isOpen) return;

    setDraft('');
    const storedMessages = loadAssistantHistory(storageKey);
    setMessages(storedMessages.length > 0 ? storedMessages : [createWelcomeMessage()]);
  }, [context.hasResults, entryPoint, isOpen, storageKey]);

  useEffect(() => {
    if (!isOpen || messages.length === 0) return;
    saveAssistantHistory(storageKey, messages);
  }, [isOpen, messages, storageKey]);

  if (!isOpen) return null;

  const submitQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isResponding) return;

    const userMessage = createAssistantMessage('user', trimmed);
    const response = getAssistantResponse(trimmed, context);

    setIsResponding(true);
    setMessages(current => [...current, userMessage]);
    setDraft('');

    window.setTimeout(() => {
      setMessages(current => [...current, createAssistantMessage('assistant', response.text, response.topics)]);
      setIsResponding(false);
    }, 150);
  };

  const handleClearChat = () => {
    clearAssistantHistory(storageKey);
    setMessages([createWelcomeMessage()]);
    setDraft('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="flex h-[min(88vh,760px)] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <aside className="hidden w-72 flex-col border-r border-slate-200 bg-[radial-gradient(circle_at_top,_#ecfdf5,_#f8fafc_55%)] p-6 md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{ENTRY_TITLES[entryPoint]}</h2>
              <p className="text-xs text-slate-600">Deterministic app guide</p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-100 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Current context</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold text-slate-900">Section:</span> {context.currentStepLabel}</p>
              <p><span className="font-semibold text-slate-900">Scenario:</span> {context.scenarioName}</p>
              <p><span className="font-semibold text-slate-900">Return mode:</span> {context.returnType.replace(/_/g, ' ')}</p>
              <p><span className="font-semibold text-slate-900">Strategy:</span> {context.withdrawalStrategy.replace(/_/g, ' ')}</p>
              {context.hasResults && (
                <p><span className="font-semibold text-slate-900">Funding:</span> {typeof context.fundingPercent === 'number' ? `${context.fundingPercent}%` : 'n/a'}</p>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            This assistant is informational and app-focused. It explains the planner and your modeled output, but it is not a substitute for professional financial advice.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">{ENTRY_TITLES[entryPoint]}</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">{ENTRY_SUBTITLES[entryPoint]}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                title="Clear chat history for this scenario"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear Chat
              </button>
              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close assistant"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Starter prompts</p>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => submitQuestion(prompt)}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-5 py-5">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${message.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 border border-slate-200'}`}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
                    {message.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-emerald-600" />}
                    <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                  {message.topics && message.topics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.topics.map(topic => (
                        <span key={topic} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isResponding && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                  Thinking through the current app context...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-5 py-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitQuestion(draft);
              }}
              className="flex items-end gap-3"
            >
              <div className="flex-1">
                <label htmlFor="assistant-question" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Ask about the planner or your current results
                </label>
                <textarea
                  id="assistant-question"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="For example: Why does my plan run out early?"
                />
              </div>
              <button
                type="submit"
                disabled={!draft.trim() || isResponding}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}