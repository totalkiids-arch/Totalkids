import { campaignFor, type CampaignThemeId } from "../domain/campaigns";
import type { StoreThemeId } from "../domain/store-theme";

/** Ambientación breve y decorativa que hace reconocible cada plantilla pública. */
export function SeasonalRibbon({ theme }: { theme: StoreThemeId }) {
  const campaign = campaignFor(theme);
  if (!campaign) return null;

  return (
    <aside
      className={`seasonal-ribbon seasonal-ribbon--${campaign.id}`}
      aria-label={campaign.title}
    >
      <div className="seasonal-ribbon__inner">
        <svg aria-hidden viewBox="0 -14 128 102" className="seasonal-ribbon__animal">
          <g
            className="motion-safe:animate-sway"
            style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
          >
            <SeasonalAnimal costume={campaign.id} />
          </g>
        </svg>
        <p>
          <strong>{campaign.title}</strong>
          <span>{campaign.detail}</span>
        </p>
        <SeasonalDetails costume={campaign.id} />
      </div>
    </aside>
  );
}

/** Animalito de la tienda (128 × 88) con el accesorio de la campaña. */
export function SeasonalAnimal({ costume }: { costume: CampaignThemeId }) {
  return (
    <g>
      <ellipse cx="68" cy="63" rx="35" ry="19" className="seasonal-animal__fur" />
      <circle cx="91" cy="41" r="22" className="seasonal-animal__fur" />
      <circle cx="80" cy="22" r="9" className="seasonal-animal__fur" />
      <circle cx="103" cy="21" r="9" className="seasonal-animal__fur" />
      <circle cx="85" cy="38" r="3" className="seasonal-animal__eye" />
      <circle cx="98" cy="38" r="3" className="seasonal-animal__eye" />
      <circle cx="80" cy="46" r="3.5" className="seasonal-animal__blush" />
      <circle cx="103" cy="46" r="3.5" className="seasonal-animal__blush" />
      <path d="M88 50q5 5 10 0" className="seasonal-animal__smile" />
      <rect x="43" y="69" width="9" height="15" rx="4" className="seasonal-animal__fur" />
      <rect x="75" y="69" width="9" height="15" rx="4" className="seasonal-animal__fur" />
      <Costume costume={costume} />
    </g>
  );
}

const SCARF = "M40 52q27-16 48 4l-9 21q-24-10-41-1z";

function Costume({ costume }: { costume: CampaignThemeId }) {
  switch (costume) {
    case "navidad":
      return (
        <g>
          <path className="seasonal-costume__manta" d="M72 58q19 8 38-2l2 7q-20 10-41 2z" />
          <path className="seasonal-costume__hat" d="M74 22q6-30 34-20q6 4 2 18z" />
          <rect className="seasonal-costume__trim" x="71" y="18" width="42" height="8" rx="4" />
          <circle className="seasonal-costume__trim" cx="111" cy="0" r="5" />
        </g>
      );
    case "pascua":
      return (
        <g>
          <path
            className="seasonal-costume__hat"
            d="M80 22q-12-26-1-31q11 4 7 29M98 22q12-26 1-31q-11 4-7 29"
          />
          <path
            className="seasonal-costume__trim"
            d="M82 18q-5-15 0-22q4 6 1 22M96 18q5-15 0-22q-4 6-1 22"
          />
          <path className="seasonal-costume__accent" d="M76 60l10-5v12zM110 60l-10-5v12z" />
          <circle className="seasonal-costume__manta" cx="93" cy="61" r="4" />
        </g>
      );
    case "ano-nuevo":
      return (
        <g>
          <path className="seasonal-costume__hat" d="m80 22 13-32 14 32z" />
          <path
            className="seasonal-costume__accent"
            d="m84 14 18-2M87 5l12-1"
            strokeWidth="3"
            stroke="currentColor"
          />
          <circle className="seasonal-costume__accent" cx="93" cy="-11" r="5" />
          <path className="seasonal-costume__manta" d="M74 60l18 3-18 3zM112 60l-18 3 18 3z" />
        </g>
      );
    case "invierno":
      return (
        <g>
          <path className="seasonal-costume__manta" d={SCARF} />
          <path className="seasonal-costume__manta" d="M58 60l-6 22 9 1 5-20z" />
          <path className="seasonal-costume__hat" d="M73 24q2-27 20-27t20 27z" />
          <rect className="seasonal-costume__trim" x="71" y="19" width="44" height="8" rx="4" />
          <circle className="seasonal-costume__accent" cx="93" cy="-6" r="7" />
        </g>
      );
    case "primavera":
      return (
        <g>
          <path d="M74 22q19-9 38 0" className="seasonal-costume__stem" />
          {[74, 86, 98, 110].map((x, i) => (
            <g key={x}>
              <circle
                className={i % 2 ? "seasonal-costume__accent" : "seasonal-costume__hat"}
                cx={x}
                cy={i === 1 || i === 2 ? 15 : 20}
                r="6"
              />
              <circle
                className="seasonal-costume__trim"
                cx={x}
                cy={i === 1 || i === 2 ? 15 : 20}
                r="2.2"
              />
            </g>
          ))}
        </g>
      );
    case "fiestas-patrias":
      return (
        <g>
          {/* Manta huasa con franjas y chupalla de ala ancha. */}
          <path className="seasonal-costume__manta" d={SCARF} />
          <path
            className="seasonal-costume__accent"
            d="M46 56q20-11 37 1l-2 5q-17-10-34-1zM42 66q20-8 39 2l-2 5q-19-8-36-2z"
          />
          <path className="seasonal-costume__trim" d="M44 61q20-10 38 1l-1 3q-18-9-36-1z" />
          <path className="seasonal-costume__hat" d="M66 22h50l-6 6H71z" />
          <path className="seasonal-costume__hat" d="M78 21q0-15 13-15t13 15z" />
          <rect className="seasonal-costume__accent" x="78" y="16" width="26" height="4" />
        </g>
      );
  }
}

function SeasonalDetails({ costume }: { costume: CampaignThemeId }) {
  if (costume === "fiestas-patrias") {
    return (
      <span aria-hidden className="seasonal-ribbon__flags">
        <ChileFlag />
        <ChileFlag />
      </span>
    );
  }
  return <span aria-hidden className="seasonal-ribbon__details" />;
}

export function ChileFlag({ className = "seasonal-ribbon__flag" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 32" className={className}>
      <rect width="48" height="32" rx="2" className="flag-white" />
      <path d="M0 16h48v16H0z" className="flag-red" />
      <path d="M0 0h16v16H0z" className="flag-blue" />
      <path
        d="m8 4 1.2 3.5H13l-3 2.2 1.2 3.5L8 11l-3.2 2.2L6 9.7 3 7.5h3.8z"
        className="flag-star"
      />
    </svg>
  );
}
