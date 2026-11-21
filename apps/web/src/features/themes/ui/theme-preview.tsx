import type { CSSProperties } from "react";

import { campaignFor } from "../domain/campaigns";
import type { StoreThemeId } from "../domain/store-theme";
import { SeasonalHeroScene } from "./seasonal-decor";
import { SeasonalAnimal } from "./seasonal-ribbon";

const RAINBOW = [
  "bg-brand-red",
  "bg-logo-orange",
  "bg-brand-yellow",
  "bg-logo-green",
  "bg-logo-sky",
  "bg-brand-purple",
];

const PILLS = [
  "bg-brand-blue",
  "bg-brand-purple",
  "bg-brand-green",
  "bg-brand-yellow",
  "bg-brand-red",
];

/** Partículas quietas: en la miniatura solo insinúan la nieve, el confeti, etc. */
const STILL_PARTICLES = [
  [8, 30],
  [22, 62],
  [38, 18],
  [55, 70],
  [71, 34],
  [88, 58],
  [94, 22],
] as const;

/**
 * Miniatura de la tienda con la plantilla aplicada. Usa las mismas clases que
 * la tienda real (store-theme, franja, guirnalda, portada), así que lo que se
 * ve aquí es lo que verá el público. Decorativa: el nombre va en la tarjeta.
 */
export function ThemePreview({ theme }: { theme: StoreThemeId }) {
  const campaign = campaignFor(theme);

  return (
    <div
      aria-hidden
      className={`store-theme store-theme--${theme} theme-mini relative overflow-hidden rounded-lg border border-border bg-background pattern-dots text-text-primary shadow-sm`}
    >
      <div className="store-stripe flex h-1.5">
        {RAINBOW.map((color) => (
          <span key={color} className={`flex-1 ${color}`} />
        ))}
      </div>

      {campaign ? (
        <div className="seasonal-ribbon flex h-6 items-center gap-1 px-2">
          <svg viewBox="0 -14 128 102" className="h-5 w-7 shrink-0 overflow-visible">
            <SeasonalAnimal costume={campaign.id} />
          </svg>
          <span className="truncate font-heading text-[10px] font-extrabold">{campaign.title}</span>
        </div>
      ) : null}

      <div className="h-2 bg-brand-navy" />
      <div className="border-b border-border bg-surface px-2 pt-1.5 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="size-4 shrink-0 rounded-full bg-brand-yellow" />
          <span className="h-2.5 flex-1 rounded-full border border-input-border bg-input" />
          <span className="size-3 shrink-0 rounded-full bg-brand-blue" />
        </div>
        <div className="mt-1 flex gap-1">
          {PILLS.map((color) => (
            <span key={color} className={`h-1.5 w-6 rounded-full ${color}`} />
          ))}
        </div>
      </div>

      {campaign ? <div className="seasonal-garland" /> : null}

      <div
        className={`mx-2 mt-1.5 flex items-center gap-1 rounded-xl p-2 ${campaign ? "seasonal-hero" : "bg-soft-yellow"}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-heading text-[11px] leading-tight font-extrabold">
            {campaign ? campaign.heroTitle : "Muebles que invitan a"}{" "}
            <span className="rounded bg-surface px-0.5 text-brand-red">
              {campaign ? campaign.heroHighlight : "aprender jugando"}
            </span>
          </span>
          <span className="h-2.5 w-12 rounded-full bg-brand-blue" />
        </div>
        {campaign ? (
          <SeasonalHeroScene theme={campaign.id} label="" className="h-14 w-18 shrink-0" />
        ) : (
          <span className="size-12 shrink-0 rounded-full bg-surface/70" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-2">
        {["bg-soft-blue", "bg-soft-green", "bg-soft-red"].map((tone) => (
          <span key={tone} className="overflow-hidden rounded-md border border-border bg-surface">
            <span className={`block h-5 ${tone}`} />
            <span className="m-1 block h-1 w-3/4 rounded bg-brand-navy/60" />
          </span>
        ))}
      </div>

      {campaign
        ? STILL_PARTICLES.map(([x, y]) => (
            <span
              key={x}
              className="seasonal-particle"
              style={
                {
                  "--x": `${x}%`,
                  "--s": "6px",
                  top: `${y}%`,
                  animation: "none",
                } as CSSProperties
              }
            />
          ))
        : null}
    </div>
  );
}
