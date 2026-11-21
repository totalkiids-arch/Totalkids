import type { CSSProperties } from "react";

import { campaignFor, type CampaignThemeId } from "../domain/campaigns";
import type { StoreThemeId } from "../domain/store-theme";
import { SeasonalAnimal } from "./seasonal-ribbon";

/**
 * Guirnalda decorativa de la campaña (banderines, luces, carámbanos o flores).
 * Se dibuja con CSS (globals.css → .seasonal-garland--<plantilla>).
 */
export function SeasonalGarland({
  theme,
  placement = "header",
}: {
  theme: StoreThemeId;
  placement?: "header" | "footer";
}) {
  if (!campaignFor(theme)) return null;
  return <div aria-hidden className={`seasonal-garland seasonal-garland--${placement}`} />;
}

/** Posiciones fijas (no aleatorias) para que servidor y cliente pinten lo mismo. */
const PARTICLES = [
  [4, 9, 0, 10],
  [12, 12, 3, 7],
  [19, 10, 6, 12],
  [27, 13, 1, 8],
  [35, 11, 8, 11],
  [43, 9, 4, 9],
  [51, 12, 2, 13],
  [58, 10, 7, 8],
  [66, 14, 5, 10],
  [74, 11, 0.5, 12],
  [81, 13, 9, 7],
  [88, 10, 3.5, 11],
  [95, 12, 6.5, 9],
  [8, 15, 11, 8],
  [47, 14, 12, 10],
  [70, 15, 10.5, 9],
] as const;

/**
 * Nieve, confeti, pétalos o huevitos cayendo sobre la primera pantalla.
 * Solo decorativo: sin interacción y oculto con prefers-reduced-motion.
 */
export function SeasonalParticles({ theme }: { theme: StoreThemeId }) {
  if (!campaignFor(theme)) return null;
  return (
    <div aria-hidden className="seasonal-particles">
      {PARTICLES.map(([x, duration, wait, size], i) => (
        <span
          key={i}
          className="seasonal-particle"
          style={
            {
              "--x": `${x}%`,
              "--d": `${duration}s`,
              "--w": `${wait}s`,
              "--s": `${size}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Ilustración de la diapositiva de campaña (viewBox 560 × 440). */
export function SeasonalHeroScene({
  theme,
  label,
  className,
}: {
  theme: CampaignThemeId;
  label: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 560 440" role="img" aria-label={label} className={className}>
      <circle cx="290" cy="215" r="195" className="seasonal-scene__halo" />
      <ellipse cx="280" cy="398" rx="250" ry="28" className="seasonal-scene__rug" />
      <SceneProps theme={theme} />
      <g transform="translate(70 150) scale(3)">
        <g
          className="motion-safe:animate-sway"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center bottom",
            animationDuration: "3s",
          }}
        >
          <SeasonalAnimal costume={theme} />
        </g>
      </g>
    </svg>
  );
}

const TWINKLE = "motion-safe:animate-twinkle";
const self: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

function SceneProps({ theme }: { theme: CampaignThemeId }) {
  switch (theme) {
    case "fiestas-patrias":
      return (
        <g>
          <path d="M60 70q220 70 440 0" className="seasonal-scene__line" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const x = 80 + i * 55;
            const y = 70 + Math.sin((i / 7) * Math.PI) * 33;
            const tone = ["flag-blue", "flag-white", "flag-red"][i % 3];
            return (
              <path
                key={i}
                d={`M${x - 16} ${y}h32l-16 30z`}
                className={`${tone} seasonal-scene__pennant`}
              />
            );
          })}
          <rect x="44" y="150" width="6" height="250" rx="3" className="seasonal-scene__pole" />
          <rect x="506" y="150" width="6" height="250" rx="3" className="seasonal-scene__pole" />
          <g
            className="motion-safe:animate-sway"
            style={{ transformBox: "fill-box", transformOrigin: "left center" }}
          >
            <svg x="50" y="152" width="96" height="64" viewBox="0 0 48 32">
              <ChileFlagShapes />
            </svg>
          </g>
          <g
            className="motion-safe:animate-sway"
            style={{
              transformBox: "fill-box",
              transformOrigin: "right center",
              animationDelay: "400ms",
            }}
          >
            <svg x="410" y="152" width="96" height="64" viewBox="0 0 48 32">
              <ChileFlagShapes />
            </svg>
          </g>
        </g>
      );
    case "navidad":
      return (
        <g>
          <path
            d="M455 110l-60 100h30l-50 80h35l-55 85h200l-55-85h35l-50-80h30z"
            className="seasonal-scene__tree"
          />
          <rect x="445" y="375" width="20" height="22" className="seasonal-scene__pole" />
          <path
            d="m455 88 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z"
            className={`seasonal-scene__gold ${TWINKLE}`}
            style={self}
          />
          {[
            [430, 230],
            [480, 290],
            [420, 330],
            [495, 345],
            [455, 180],
          ].map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="8"
              className={i % 2 ? "seasonal-scene__gold" : "seasonal-scene__accent"}
            />
          ))}
          <rect x="40" y="330" width="70" height="60" rx="6" className="seasonal-scene__accent" />
          <rect x="70" y="330" width="10" height="60" className="seasonal-scene__gold" />
          <rect x="115" y="350" width="50" height="40" rx="6" className="seasonal-scene__gift" />
          <rect x="136" y="350" width="8" height="40" className="seasonal-scene__trim" />
        </g>
      );
    case "pascua":
      return (
        <g>
          {[
            [70, 340, "seasonal-scene__accent"],
            [140, 360, "seasonal-scene__gold"],
            [470, 345, "seasonal-scene__gift"],
            [430, 375, "seasonal-scene__accent"],
          ].map(([x, y, tone], i) => (
            <g key={i} className={TWINKLE} style={{ ...self, animationDelay: `${i * 300}ms` }}>
              <ellipse cx={x} cy={y} rx="26" ry="34" className={String(tone)} />
              <path
                d={`M${Number(x) - 24} ${y}q12 -10 24 0t24 0`}
                className="seasonal-scene__stripe"
              />
            </g>
          ))}
          {[
            [90, 120],
            [480, 140],
            [430, 70],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="10" className="seasonal-scene__gold" />
          ))}
        </g>
      );
    case "ano-nuevo":
      return (
        <g>
          {[
            [110, 110, "seasonal-scene__gold"],
            [450, 90, "seasonal-scene__accent"],
            [470, 230, "seasonal-scene__gift"],
          ].map(([cx, cy, tone], i) => (
            <g key={i} className={TWINKLE} style={{ ...self, animationDelay: `${i * 500}ms` }}>
              {Array.from({ length: 12 }, (_, k) => {
                const a = (k / 12) * Math.PI * 2;
                const x = Number(cx);
                const y = Number(cy);
                return (
                  <path
                    key={k}
                    d={`M${x + Math.cos(a) * 14} ${y + Math.sin(a) * 14}L${x + Math.cos(a) * 46} ${y + Math.sin(a) * 46}`}
                    className={`seasonal-scene__ray ${String(tone)}-stroke`}
                  />
                );
              })}
            </g>
          ))}
        </g>
      );
    case "invierno":
      return (
        <g>
          {(
            [
              [90, 110, 26],
              [470, 90, 32],
              [440, 250, 20],
              [120, 250, 18],
              [300, 50, 16],
            ] as const
          ).map(([x, y, r], i) => (
            <g key={i} className={TWINKLE} style={{ ...self, animationDelay: `${i * 350}ms` }}>
              {[0, 60, 120].map((deg) => (
                <path
                  key={deg}
                  d={`M${x} ${y - r}V${y + r}`}
                  transform={`rotate(${deg} ${x} ${y})`}
                  className="seasonal-scene__flake"
                />
              ))}
            </g>
          ))}
          <ellipse cx="280" cy="392" rx="240" ry="22" className="seasonal-scene__snow" />
        </g>
      );
    case "primavera":
      return (
        <g>
          <circle
            cx="470"
            cy="95"
            r="38"
            className={`seasonal-scene__gold ${TWINKLE}`}
            style={self}
          />
          {[60, 120, 440, 500].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 395V${330 - (i % 2) * 30}`} className="seasonal-scene__stem" />
              {[0, 72, 144, 216, 288].map((deg) => (
                <circle
                  key={deg}
                  cx={x}
                  cy={318 - (i % 2) * 30}
                  r="11"
                  transform={`rotate(${deg} ${x} ${330 - (i % 2) * 30})`}
                  className={i % 2 ? "seasonal-scene__accent" : "seasonal-scene__gift"}
                />
              ))}
              <circle cx={x} cy={330 - (i % 2) * 30} r="7" className="seasonal-scene__gold" />
            </g>
          ))}
        </g>
      );
  }
}

function ChileFlagShapes() {
  return (
    <>
      <rect width="48" height="32" className="flag-white" />
      <path d="M0 16h48v16H0z" className="flag-red" />
      <path d="M0 0h16v16H0z" className="flag-blue" />
      <path
        d="m8 4 1.2 3.5H13l-3 2.2 1.2 3.5L8 11l-3.2 2.2L6 9.7 3 7.5h3.8z"
        className="flag-star"
      />
    </>
  );
}
