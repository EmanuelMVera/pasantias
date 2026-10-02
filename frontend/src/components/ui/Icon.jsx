/**
 * Icon.jsx — set propio de íconos lineales (SVG inline, sin dependencias).
 *
 *   <Icon name="users" />            → 20px, hereda el color del texto
 *   <Icon name="bell" size={22} />
 *
 * Todos comparten la misma grilla (24×24), trazo 1.8 redondeado y
 * `currentColor`, así el sistema se ve consistente. Son decorativos
 * (`aria-hidden`): el nombre accesible lo pone el control que los contiene.
 */

const PATHS = {
  home: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.2 5.6A1.5 1.5 0 0 1 7.6 4.5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5" />
      <path d="M4 13.5v5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-5h-4.5l-1.5 2.5h-4L8.5 13.5H4Z" />
    </>
  ),
  building: (
    <>
      <path d="M4.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14.5 5v15.5" />
      <path d="M14.5 9.5H18a1.5 1.5 0 0 1 1.5 1.5v9.5" />
      <path d="M3 20.5h18" />
      <path d="M8 7.5h3M8 11h3M8 14.5h3M17 13.5v.01M17 16.5v.01" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3.5 12.5h17M11 12.5v1.5h2v-1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <path d="M15.5 5.2a3.3 3.3 0 0 1 0 6.6M17.5 14.8c1.9.6 3.1 2.2 3.5 4.7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c.8-3.7 3.7-5.8 7.5-5.8s6.7 2.1 7.5 5.8" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8" r="3.8" />
      <path d="M3.5 20c.7-3.5 3.3-5.5 6.5-5.5 1.4 0 2.7.4 3.8 1.1" />
      <path d="M18 14v6M15 17h6" />
    </>
  ),
  graduation: (
    <>
      <path d="M12 4.5 2.5 9 12 13.5 21.5 9 12 4.5Z" />
      <path d="M6.5 11v4.5c1.4 1.5 3.3 2.3 5.5 2.3s4.1-.8 5.5-2.3V11" />
      <path d="M21.5 9v5" />
    </>
  ),
  badge: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m9 9 2 2 4-4" />
      <path d="M8.5 13.5 7 20.5l5-2.5 5 2.5-1.5-7" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 14.5v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11.5M7.5 11 12 15.5l4.5-4.5" />
      <path d="M4.5 16v2.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  history: (
    <>
      <path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8L3.8 8.5" />
      <path d="M3.8 4v4.5h4.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5l1.5-2Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  arrowRight: <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  file: (
    <>
      <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
    </>
  ),
  fileSheet: (
    <>
      <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 11.5h7v6h-7zM8.5 14.5h7M12 11.5v6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.3 2.5 2.5 4.8-5" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1" />
      <path d="M17.5 3.5v3.5H14M6.5 20.5V17H10" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  send: (
    <>
      <path d="M20.5 3.5 10 14" />
      <path d="m20.5 3.5-6.5 17-4-6.5-6.5-4 17-6.5Z" />
    </>
  ),
  handshake: (
    <>
      <path d="m11 7.5-2-1.5a2 2 0 0 0-2.4 0L3 8.8v6.7l2 .5" />
      <path d="m13 7.5 2-1.5a2 2 0 0 1 2.4 0L21 8.8v6.7l-3.5 1" />
      <path d="M9.5 9.5 12 7.5l1 .8a2 2 0 0 1 .2 3l-.2.2M7.5 15.5l2.5 2.5a1.5 1.5 0 0 0 2.1 0l.4-.4M10 13.5l3 3a1.5 1.5 0 0 0 2.1 0l.4-.4a1.5 1.5 0 0 0 0-2.1L13 11.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  percent: (
    <>
      <path d="M18.5 5.5l-13 13" />
      <circle cx="7" cy="7" r="2.3" />
      <circle cx="17" cy="17" r="2.3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  funnel: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  pause: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9v6M14 9v6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />,
  mapPin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  message: <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H10l-4.5 3.5V17h-1a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" />
      <circle cx="12" cy="12" r="6.5" />
    </>
  ),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14 8 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5.5M14 11v5.5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  play: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10 8.5 5.5 3.5-5.5 3.5v-7Z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="3.8" />
      <path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M13.5 9.5 15.5 11.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5S9.4 5.9 12 3.5Z" />
    </>
  ),
  externalLink: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5 11 13" />
      <path d="M17.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4.5" />
    </>
  ),
  arrowLeft: <path d="M19.5 12h-15M10 6.5 4.5 12l5.5 5.5" />,
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.2 7.6A16.500 16.500 0 0 0 2.500 12S6 18.500 12 18.500c1.300 0 2.500-.3 3.600-.800" />
      <path d="M9.900 9.900a3 3 0 0 0 4.200 4.200" />
    </>
  ),
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, className = '', title }) {
  const contenido = PATHS[name];
  if (!contenido) return null;
  return (
    <svg
      className={className || undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {contenido}
    </svg>
  );
}
