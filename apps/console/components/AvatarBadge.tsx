"use client";

import { useEffect, useState } from "react";

const KEY = "sovir_avatar";

// Profile bubble: uploaded photo (localStorage, browser-local) or initials.
export function AvatarBadge({ name, big = false }: { name: string; big?: boolean }) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setPhoto(localStorage.getItem(KEY));
    read();
    window.addEventListener("sovir-avatar", read);
    return () => window.removeEventListener("sovir-avatar", read);
  }, []);
  const initials = name.trim().slice(0, 1).toUpperCase() || "?";
  return photo ? (
    <img className={`avatar-badge${big ? " is-big" : ""}`} src={photo} alt="" />
  ) : (
    <span className={`avatar-badge avatar-initials${big ? " is-big" : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}
