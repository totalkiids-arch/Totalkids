"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { site } from "@/shared/config/site";
import { Tito } from "@/shared/ui/brand/tito";
import { ArrowRightIcon, CloseIcon } from "@/shared/ui/icons";

import {
  answerTo,
  GREETING,
  QUICK_TOPICS,
  topicAnswer,
  type Answer,
  type AnswerLink,
} from "../domain/assistant";
import { definedOrNull, type ContactInfo } from "../domain/contact";

const CONTACT: ContactInfo = {
  phone: definedOrNull(site.phone),
  email: definedOrNull(site.email),
  address: definedOrNull(site.address),
  hours: definedOrNull(site.hours),
  whatsapp: definedOrNull(site.whatsapp),
};

/** Trucos de Tito al apretarlo; se alternan. */
const TRICKS: readonly Keyframe[][] = [
  // Voltereta con salto
  [
    { transform: "translateY(0) rotate(0) scale(1, 1)" },
    { transform: "translateY(4px) rotate(0) scale(1.12, 0.86)", offset: 0.15 },
    { transform: "translateY(-26px) rotate(200deg) scale(1, 1)", offset: 0.5 },
    { transform: "translateY(0) rotate(360deg) scale(1.1, 0.9)", offset: 0.85 },
    { transform: "translateY(0) rotate(360deg) scale(1, 1)" },
  ],
  // Giro sobre sí mismo
  [
    { transform: "perspective(400px) rotateY(0)" },
    { transform: "perspective(400px) rotateY(720deg)" },
  ],
  // Baile
  [0, -18, 16, -14, 12, 0].map((deg) => ({
    transform: `rotate(${deg}deg) translateY(${deg === 0 ? 0 : -6}px)`,
  })),
];

const HELLO_DELAY_MS = 4_000;
const HELLO_SEEN_KEY = "tk_tito_hola";
const QUESTION_MAX = 120;

interface Message {
  id: number;
  from: "tito" | "you";
  text: string;
  links: AnswerLink[];
}

const FIRST_MESSAGE: Message = { id: 0, from: "tito", text: GREETING, links: [] };

/** El saludo sale una vez por visita; sin almacenamiento, simplemente se repite. */
function helloSeen(): boolean {
  try {
    return sessionStorage.getItem(HELLO_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}
function markHelloSeen() {
  try {
    sessionStorage.setItem(HELLO_SEEN_KEY, "1");
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}

/** Tito, el ayudante flotante de la tienda (esquina inferior derecha). */
export function TitoAssistant() {
  const [open, setOpen] = useState(false);
  const [hello, setHello] = useState(false);
  const [messages, setMessages] = useState<Message[]>([FIRST_MESSAGE]);
  const [question, setQuestion] = useState("");
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const trick = useRef(0);

  useEffect(() => {
    if (helloSeen()) return;
    const timer = setTimeout(() => setHello(true), HELLO_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, open]);

  function doTrick() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frames = TRICKS[trick.current % TRICKS.length];
    trick.current += 1;
    bodyRef.current?.animate(frames ?? null, { duration: 800, easing: "ease-in-out" });
  }

  function dismissHello() {
    setHello(false);
    markHelloSeen();
  }

  function toggle() {
    doTrick();
    dismissHello();
    setOpen((value) => !value);
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function reply(asked: string, answer: Answer) {
    setMessages((list) => [
      ...list,
      { id: list.length, from: "you", text: asked, links: [] },
      { id: list.length + 1, from: "tito", ...answer },
    ]);
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    reply(text, answerTo(text, CONTACT));
    setQuestion("");
  }

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-40 flex flex-col items-end gap-2 sm:right-5 sm:bottom-5 print:hidden">
      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-label="Tito, ayudante de Total Kids"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="pointer-events-auto flex max-h-[min(520px,calc(100dvh-8.5rem))] w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border-2 border-brand-yellow bg-surface shadow-xl motion-safe:animate-pop-in"
        >
          <header className="flex items-center justify-between gap-2 bg-brand-yellow py-2 pr-2 pl-5">
            <h2 className="text-xl font-extrabold">Tito te ayuda</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar la ayuda de Tito"
              className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-soft-yellow"
            >
              <CloseIcon />
            </button>
          </header>

          <div
            ref={logRef}
            role="log"
            aria-label="Conversación con Tito"
            tabIndex={0}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
          >
            {messages.map((message) => (
              <Bubble key={message.id} message={message} onNavigate={() => setOpen(false)} />
            ))}
            <ul aria-label="Temas frecuentes" className="flex flex-wrap gap-2 pt-1">
              {QUICK_TOPICS.map((topic) => (
                <li key={topic.id}>
                  <button
                    type="button"
                    onClick={() => reply(topic.label, topicAnswer(topic.id, CONTACT))}
                    className="min-h-11 cursor-pointer rounded-full border-2 border-chip-border bg-surface px-3.5 text-sm font-bold hover:bg-cream"
                  >
                    {topic.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={ask} className="flex gap-2 border-t border-border p-3">
            <label htmlFor={`${panelId}-texto`} className="sr-only">
              Escríbele a Tito
            </label>
            <input
              ref={inputRef}
              id={`${panelId}-texto`}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={QUESTION_MAX}
              autoComplete="off"
              placeholder="¿Qué buscas?"
              className="min-h-11 min-w-0 flex-1 rounded-full border-2 border-input-border bg-input px-4"
            />
            <button
              type="submit"
              aria-label="Enviar a Tito"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-brand-blue text-white"
            >
              <ArrowRightIcon />
            </button>
          </form>
        </section>
      ) : null}

      <div className="flex items-end gap-2">
        {hello && !open ? (
          <p className="pointer-events-auto mb-6 flex items-center rounded-3xl rounded-br-md border-2 border-brand-yellow bg-surface pl-4 text-sm font-bold shadow-lg motion-safe:animate-pop-in">
            ¡Hola! ¿Te ayudo?
            <button
              type="button"
              onClick={dismissHello}
              aria-label="Ocultar el saludo de Tito"
              className="grid size-11 cursor-pointer place-items-center"
            >
              <CloseIcon size={14} />
            </button>
          </p>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={open ? "Cerrar la ayuda de Tito" : "Abrir la ayuda de Tito"}
          className="pointer-events-auto cursor-pointer rounded-3xl p-1 drop-shadow-lg transition-transform motion-safe:hover:scale-110 motion-safe:active:scale-95"
        >
          <span ref={bodyRef} className="block">
            <Tito className="w-14 sm:w-18" animated />
          </span>
        </button>
      </div>
    </div>
  );
}

const LINK =
  "inline-flex min-h-11 items-center rounded-full bg-brand-blue px-4 text-sm font-extrabold text-white";

function Bubble({ message, onNavigate }: { message: Message; onNavigate: () => void }) {
  const mine = message.from === "you";
  return (
    <div className={`flex flex-col gap-2 ${mine ? "items-end" : "items-start"}`}>
      <p
        className={`max-w-[90%] rounded-3xl px-4 py-2.5 wrap-break-word whitespace-pre-line ${
          mine ? "rounded-br-md bg-soft-blue" : "rounded-bl-md bg-cream"
        }`}
      >
        <span className="sr-only">{mine ? "Tú: " : "Tito: "}</span>
        {message.text}
      </p>
      {message.links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {message.links.map((link) =>
            link.href.startsWith("/") ? (
              <Link key={link.href} href={link.href as Route} onClick={onNavigate} className={LINK}>
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className={LINK}
                {...(link.href.startsWith("https:")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {link.label}
              </a>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
