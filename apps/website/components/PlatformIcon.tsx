import type { DownloadId } from "../lib/downloads";

const frame = { viewBox: "0 0 24 24", "aria-hidden": true as const };

export function PlatformIcon({ id }: { id: DownloadId }) {
  if (id === "windows") return <WindowsMark />;
  if (id === "android") return <AndroidMark />;
  if (id === "extension") return <ExtensionMark />;
  return <AppleMark />;
}

// Official Android robot geometry; follows theme color like the other marks.
function AndroidMark() {
  return (
    <svg {...frame} viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="m8.1 5.2-1-1.75a.28.28 0 0 1 .1-.38.28.28 0 0 1 .38.1l1.05 1.8a5.6 5.6 0 0 1 6.74 0l1.05-1.8a.28.28 0 0 1 .38-.1.28.28 0 0 1 .1.38l-1 1.75A5.25 5.25 0 0 1 17.2 9H6.8a5.25 5.25 0 0 1 1.3-3.8Zm1.6 1.9a.72.72 0 1 0 0-1.44.72.72 0 0 0 1.44Zm4.6 0a.72.72 0 1 0 0-1.44.72.72 0 0 0 0 1.44Z"
      />
      <path
        fill="currentColor"
        d="M3.6 10.1a.95.95 0 0 1 1.9 0v4.9a.95.95 0 0 1-1.9 0v-4.9Zm14.9 0a.95.95 0 0 1 1.9 0v4.9a.95.95 0 0 1-1.9 0v-4.9Z"
      />
      <path
        fill="currentColor"
        d="M6.4 10.1h11.2v6.2c0 .41-.34.75-.75.75h-1.1v2.5a.95.95 0 0 1-1.9 0v-2.5h-3.8v2.5a.95.95 0 0 1-1.9 0v-2.5h-1.1a.75.75 0 0 1-.75-.75v-6.2Z"
      />
    </svg>
  );
}

// Extension: single clean jigsaw piece — rounded tile, knob on top,
// socket on the right edge. Filled like the other platform marks.
function ExtensionMark() {
  return (
    <svg {...frame}>
      <path
        fill="currentColor"
        d="M7.5 7.5h2.25a2.25 2.25 0 0 0 4.5 0h2.25A1.5 1.5 0 0 1 18 9v2.25a2.25 2.25 0 0 0 0 4.5V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18V9a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg {...frame}>
      <path
        fill="currentColor"
        d="M16.7 12.6c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.9-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.7-.4 6.6 1.1 8.8.7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.2.8-1.2 1.1-2.3 1.2-2.4-.1 0-2.3-.9-2.5-3.6Z"
      />
      <path
        fill="currentColor"
        d="M14.8 6.4c.6-.8 1-1.8.9-2.8-1 .1-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.7 1.1.1 2.2-.5 2.9-1.3Z"
      />
    </svg>
  );
}

function WindowsMark() {
  return (
    <svg {...frame}>
      <path
        fill="currentColor"
        d="M3 5.1 10.3 4.1v7.2H3V5.1Zm8.3-1.1L21 2.6v8.7h-9.7V4Zm-8.3 8.7h7.3V20L3 18.9v-6.2Zm8.3 0H21v8.7l-9.7-1.4v-7.3Z"
      />
    </svg>
  );
}
