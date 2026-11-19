// Íconos de trazo de la maqueta (24×24). Decorativos: el texto accesible va en el control.
import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function make(paths: ReactNode, strokeWidth = 2) {
  function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {paths}
      </svg>
    );
  }
  return Icon;
}

export const TruckIcon = make(
  <>
    <path d="M3 6h11v10H3z" />
    <path d="M14 10h4l3 3v3h-7" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </>,
);
export const CardIcon = make(
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
  </>,
);
export const PhoneIcon = make(
  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
);
export const MailIcon = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </>,
);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </>,
  2.5,
);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </>,
);
export const BagIcon = make(
  <>
    <path d="M5 8h14l-1 13H6L5 8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </>,
);
export const BagPlusIcon = make(
  <>
    <path d="M5 8h14l-1 13H6L5 8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <path d="M12 12v5M9.5 14.5h5" />
  </>,
  2.2,
);
export const ArrowRightIcon = make(<path d="M5 12h14M13 6l6 6-6 6" />, 2.5);
export const StarIcon = make(
  <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  2.5,
);
export const LeafIcon = make(
  <>
    <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" />
    <path d="M5 19l7-7" />
  </>,
);
export const SchoolIcon = make(
  <>
    <path d="M4 20h16" />
    <path d="M6 20V9l6-5 6 5v11" />
    <path d="M10 20v-6h4v6" />
  </>,
);
export const HeartIcon = make(
  <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
);
export const ChildIcon = make(
  <>
    <circle cx="12" cy="5" r="2.5" />
    <path d="M12 8v7M8 11h8M9 21l3-6 3 6" />
  </>,
);
export const GridIcon = make(
  <>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </>,
);
export const PencilIcon = make(
  <>
    <path d="M4 20l4-1 11-11-3-3L5 16z" />
    <path d="M14 6l3 3" />
  </>,
);
export const BookIcon = make(
  <>
    <path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" />
  </>,
);
export const ChatIcon = make(<path d="M4 20l1.5-4A8 8 0 1 1 9 19.5z" />);
export const PinIcon = make(
  <>
    <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </>,
);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const ChevronLeftIcon = make(<path d="M15 5l-7 7 7 7" />, 2.5);
export const ChevronRightIcon = make(<path d="M9 5l7 7-7 7" />, 2.5);
export const PauseIcon = make(<path d="M9 5v14M15 5v14" />, 3);
export const PlayIcon = make(<path d="M7 5l12 7-12 7z" />, 2.5);
export const TrashIcon = make(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </>,
);
export const ArrowLeftIcon = make(<path d="M19 12H5M11 6l-6 6 6 6" />, 2.5);
export const ToolIcon = make(
  <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-.7-.7-2.8z" />,
);
