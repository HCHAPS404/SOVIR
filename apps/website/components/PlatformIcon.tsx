import type { DownloadId } from "../lib/downloads";

const frame = { viewBox: "0 0 24 24", "aria-hidden": true as const };

export function PlatformIcon({ id }: { id: DownloadId }) {
  if (id === "windows") return <WindowsMark />;
  return <AppleMark />;
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
