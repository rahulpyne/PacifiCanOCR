import type { CSSProperties } from "react";

type P = { size?: number; color?: string; style?: CSSProperties; sw?: number };

const base = (size: number, color: string, sw: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: color,
  strokeWidth: sw,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const Home = ({ size = 16, color = "currentColor", sw = 1.7 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </svg>
);

export const FileIcon = ({ size = 16, color = "currentColor", sw = 1.7 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const Settings = ({ size = 16, color = "currentColor", sw = 1.7 }: P) => (
  <svg {...base(size, color, sw)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.7-1.3-1.9-3.3-2 .8a7.6 7.6 0 0 0-2.6-1.5l-.3-2.1H8.7l-.3 2.1a7.6 7.6 0 0 0-2.6 1.5l-2-.8L1.9 9.2 3.6 10.5a7.8 7.8 0 0 0 0 3L1.9 14.8l1.9 3.3 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2.1h3.6l.3-2.1a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.9-3.3z" />
  </svg>
);

export const Plus = ({ size = 14, color = "currentColor", sw = 2.2 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = ({ size = 14, color = "currentColor", sw = 2 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M5 12h14" />
  </svg>
);

export const Download = ({ size = 14, color = "currentColor", sw = 1.9 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M12 4v11" />
    <path d="m7 11 5 4 5-4" />
    <path d="M5 20h14" />
  </svg>
);

export const Refresh = ({ size = 13, color = "currentColor", sw = 2 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M21 12a9 9 0 1 1-9-9" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const History = ({ size = 13, color = "currentColor", sw = 1.7 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const Search = ({ size = 14, color = "var(--dim)", sw = 1.8, style }: P) => (
  <svg {...base(size, color, sw)} style={style}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

export const Check = ({ size = 14, color = "#fff", sw = 2.4 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const Trash = ({ size = 15, color = "currentColor", sw = 1.8 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);

export const ChevronLeft = ({ size = 14, color = "currentColor", sw = 2 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="m15 6-6 6 6 6" />
  </svg>
);

export const ChevronRight = ({ size = 14, color = "currentColor", sw = 2 }: P) => (
  <svg {...base(size, color, sw)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ChevronDown = ({ size = 13, color = "var(--mut)", sw = 2, style }: P) => (
  <svg {...base(size, color, sw)} style={style}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const Grid = ({ size = 26, color = "var(--teal)", sw = 1.5 }: P) => (
  <svg {...base(size, color, sw)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const Logo = ({ size = 25 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <g fill="#0e6b66">
      <path d="M50 50 C43.5 36.5 44.5 21 53 11 C57.5 23 57.5 37.5 50 50 Z" />
      <path
        d="M50 50 C43.5 36.5 44.5 21 53 11 C57.5 23 57.5 37.5 50 50 Z"
        transform="rotate(120 50 50)"
      />
      <path
        d="M50 50 C43.5 36.5 44.5 21 53 11 C57.5 23 57.5 37.5 50 50 Z"
        transform="rotate(240 50 50)"
      />
    </g>
    <circle cx="50" cy="50" r="4" fill="#0a4f4b" />
  </svg>
);
