"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { site } from "@/shared/config/site";
import { Tito } from "@/shared/ui/brand/tito";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/shared/ui/icons";

import {
  answerTo,
  GREETING,
  QUICK_TOPICS,
  topicAnswer,
  type Answer,
  typingDelay,
  type AnswerLink,
  type TopicId,
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
  const [typing, setTyping] = useState(false);
  /** Temas rápidos ya preguntados: no se vuelven a ofrecer. */
  const [askedTopics, setAskedTopics] = useState<readonly TopicId[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    [],
  );

  // Tu mensaje y los puntitos: al fondo. La respuesta de Tito: se muestra desde
  // su comienzo, para leerla de arriba abajo sin que el chat salte al final.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = log.lastElementChild;
    const fromTito = messages.at(-1)?.from === "tito" && !typing && messages.length > 1;
    const top =
      fromTito && last instanceof HTMLElement ? Math.max(0, last.offsetTop - 16) : log.scrollHeight;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    log.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, [messages, open, typing]);

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

  /** Tu mensaje sale al tiro; el de Tito, después de que "escribe" un rato. */
  function reply(asked: string, answer: Answer, topic?: TopicId) {
    if (typing) return;
    if (topic) setAskedTopics((list) => [...list, topic]);
    setMessages((list) => [...list, { id: list.length, from: "you", text: asked, links: [] }]);
    setTyping(true);
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      setTyping(false);
      setMessages((list) => [...list, { id: list.length, from: "tito", ...answer }]);
    }, typingDelay(answer.text));
  }

  const topics = QUICK_TOPICS.filter((topic) => !askedTopics.includes(topic.id));

  function ask(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || typing) return;
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
            className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
          >
            {messages.map((message) => (
              <Bubble key={message.id} message={message} onNavigate={() => setOpen(false)} />
            ))}
            {typing ? <TypingBubble /> : null}
          </div>

          {topics.length > 0 ? (
            <div className="border-t border-border pt-2">
              <p id={`${panelId}-temas`} className="px-4 text-xs font-bold text-text-secondary">
                {askedTopics.length === 0 ? "Temas frecuentes" : "¿Algo más?"}
              </p>
              <TopicBar labelledBy={`${panelId}-temas`}>
                {topics.map((topic) => (
                  <li key={topic.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => reply(topic.label, topicAnswer(topic.id, CONTACT), topic.id)}
                      disabled={typing}
                      className="min-h-10 cursor-pointer rounded-full border-2 border-chip-border bg-surface px-3.5 text-sm font-bold whitespace-nowrap hover:bg-cream disabled:cursor-wait disabled:opacity-60"
                    >
                      {topic.label}
                    </button>
                  </li>
                ))}
              </TopicBar>
            </div>
          ) : null}

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
              disabled={typing}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-brand-blue text-white disabled:cursor-wait disabled:opacity-60"
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

/**
 * Fila de temas que se desliza hacia el lado: con el dedo, con la rueda del
 * mouse o con las flechas, que aparecen solo si hay más temas hacia ese lado.
 */
function TopicBar({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () =>
      setEdges({
        left: list.scrollLeft > 4,
        right: list.scrollLeft + list.clientWidth < list.scrollWidth - 4,
      });
    // La rueda vertical también desliza la fila (en un mouse sin rueda lateral).
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (list.scrollWidth <= list.clientWidth) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY;
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    list.addEventListener("wheel", onWheel, { passive: false });
    const resize = new ResizeObserver(update);
    resize.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      list.removeEventListener("wheel", onWheel);
      resize.disconnect();
    };
  }, [children]);

  function slide(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({
      left: direction * list.clientWidth * 0.7,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  const arrow =
    "absolute top-1/2 z-10 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-2 border-chip-border bg-surface text-brand-navy shadow-md hover:bg-cream";
  return (
    <div className="relative">
      <ul
        ref={listRef}
        aria-labelledby={labelledBy}
        className="flex [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain px-4 py-2 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {edges.left ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-surface to-transparent"
          />
          <button
            type="button"
            onClick={() => slide(-1)}
            aria-label="Ver temas anteriores"
            className={`${arrow} left-1.5`}
          >
            <ChevronLeftIcon size={16} />
          </button>
        </>
      ) : null}
      {edges.right ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-surface to-transparent"
          />
          <button
            type="button"
            onClick={() => slide(1)}
            aria-label="Ver más temas"
            className={`${arrow} right-1.5`}
          >
            <ChevronRightIcon size={16} />
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Tres puntitos mientras Tito escribe. */
function TypingBubble() {
  return (
    <div className="flex items-start">
      <p className="flex items-center gap-1.5 rounded-3xl rounded-bl-md bg-cream px-4 py-3.5">
        <span className="sr-only">Tito está escribiendo…</span>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden="true"
            className="tito-typing-dot size-2 rounded-full bg-brand-navy/60"
            style={{ animationDelay: `${String(dot * 160)}ms` }}
          />
        ))}
      </p>
    </div>
  );
}

/** Enlaces de una respuesta: van pegados a la burbuja de Tito y no parecen opciones del chat. */
const LINK =
  "inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-brand-blue/30 bg-surface px-3 text-sm font-bold text-brand-blue hover:border-brand-blue hover:bg-soft-blue";

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
        <div className="flex max-w-[90%] flex-wrap gap-1.5 pl-2">
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
