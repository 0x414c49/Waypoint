import type { ReactNode, SVGProps } from "react";

type IconName = "add" | "draft" | "review" | "accepted" | "history" | "open" | "today" | "quarter" | "journey" | "decisions" | "search" | "thought" | "sun" | "moon" | "back" | "clock" | "calendar" | "bold" | "italic" | "underline" | "highlight" | "heading" | "bulletList" | "orderedList" | "table" | "image" | "rowAdd" | "rowRemove" | "columnAdd" | "columnRemove" | "tableRemove" | "remove";

const paths: Record<IconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  draft: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  review: <><path d="M20 7v5h-5" /><path d="M20 12a8 8 0 1 1-2.34-5.66L20 9" /></>,
  accepted: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  open: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  today: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3v3H8z" /></>,
  quarter: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 10v10M7 7h.01M13 14h4M13 17h4" /></>,
  journey: <><path d="M4 19c4-1 3-7 7-7s3 6 9 0" /><circle cx="4" cy="19" r="1.5" /><circle cx="20" cy="12" r="1.5" /><path d="M11 12c0-3 1-6 5-8" /></>,
  decisions: <><path d="M12 3 20 7v10l-8 4-8-4V7z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  thought: <><path d="M9 18h6M10 21h4M8.5 14.5a6 6 0 1 1 7 0c-.8.6-1.2 1.2-1.4 2h-4.2c-.2-.8-.6-1.4-1.4-2Z" /><path d="M12 6v2M8.4 9.1l1.4 1M15.6 9.1l-1.4 1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path d="M20.8 14.2A8.5 8.5 0 0 1 9.8 3.2 8.5 8.5 0 1 0 20.8 14.2Z" />,
  back: <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" /></>,
  bold: <><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" /><path d="M7 5v14" /></>,
  italic: <><path d="M14 5h6M4 19h6M14 5 10 19" /></>,
  underline: <><path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14" /></>,
  highlight: <><path d="m5 15 8-8 5 5-8 8H5zM13 7l2-2 5 5-2 2M4 21h16" /></>,
  heading: <><path d="M5 5v14M19 5v14M5 12h14" /></>,
  bulletList: <><circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" /><path d="M10 6h9M10 12h9M10 18h9" /></>,
  orderedList: <><path d="M10 6h9M10 12h9M10 18h9M4 5h1v3M4 11h2l-2 2h2M4 17h2l-2 2h2" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M9 4v16M15 4v16" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 3-4 5 6" /></>,
  rowAdd: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M3 10h18M9 4v12M15 4v12M12 19v4M10 21h4" /></>,
  rowRemove: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M3 10h18M9 4v12M15 4v12M10 21h4" /></>,
  columnAdd: <><rect x="3" y="4" width="12" height="16" rx="1" /><path d="M9 4v16M3 10h12M19 8v8M15 12h8" /></>,
  columnRemove: <><rect x="3" y="4" width="12" height="16" rx="1" /><path d="M9 4v16M3 10h12M17 12h6" /></>,
  tableRemove: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M9 4v16M15 4v16M17 13l4 4m0-4-4 4" /></>,
  remove: <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function WaypointMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M5 25.5h7.2c2.5 0 3.5-1.2 3.5-3.6v-3.8c0-2.3 1.1-3.5 3.5-3.5H27" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.4 8.8 27 14.6l-4.6 5.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="25.5" r="2.5" fill="currentColor" />
      <circle cx="16" cy="18.1" r="2.3" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
