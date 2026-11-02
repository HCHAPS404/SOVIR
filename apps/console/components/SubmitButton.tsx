"use client";

import { useFormStatus } from "react-dom";

// Submit button that reports pending state while its server action runs —
// remote inference takes several seconds, so silent clicks looked broken.
export function SubmitButton({
  label,
  pendingLabel,
  className = "button",
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
