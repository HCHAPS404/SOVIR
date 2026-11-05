"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "../lib/locales";

const KEY = "sovir_avatar";

// Profile settings: photo (browser-local), display name, language, sign out.
// Photo is resized to 128px and kept in localStorage — it never leaves the
// browser; there is no avatar storage server-side by design.
export function ProfilePanel({
  name,
  lang,
  labels,
}: {
  name: string;
  lang: Locale;
  labels: {
    photo: string;
    photoHint: string;
    removePhoto: string;
    name: string;
    save: string;
    language: string;
    signOut: string;
  };
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhoto(localStorage.getItem(KEY));
  }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 128;
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      const url = canvas.toDataURL("image/jpeg", 0.82);
      localStorage.setItem(KEY, url);
      setPhoto(url);
      window.dispatchEvent(new Event("sovir-avatar"));
    };
    img.src = URL.createObjectURL(file);
  }

  function removePhoto() {
    localStorage.removeItem(KEY);
    setPhoto(null);
    window.dispatchEvent(new Event("sovir-avatar"));
  }

  async function pickLang(next: Locale) {
    if (next === lang || busy) return;
    setBusy(true);
    try {
      await fetch("/bff/lang", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-panel">
      <section className="profile-block" aria-label={labels.photo}>
        <div className="profile-photo">
          {photo ? (
            <img className="avatar-badge is-big" src={photo} alt="" />
          ) : (
            <span className="avatar-badge avatar-initials is-big" aria-hidden="true">
              {name.trim().slice(0, 1).toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div className="profile-photo-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFile}
          />
          <button className="btn-op" type="button" onClick={() => fileRef.current?.click()}>
            {labels.photo}
          </button>
          {photo ? (
            <button className="btn-op" type="button" onClick={removePhoto}>
              {labels.removePhoto}
            </button>
          ) : null}
          <p className="profile-hint">{labels.photoHint}</p>
        </div>
      </section>

      <form className="profile-block" action="/bff/profile" method="post">
        <label className="profile-field">
          <span>{labels.name}</span>
          <input name="display_name" type="text" defaultValue={name} maxLength={40} />
        </label>
        <button className="btn-op btn-op--primary" type="submit">
          {labels.save}
        </button>
      </form>

      <section className="profile-block" aria-label={labels.language}>
        <span className="profile-field-label">{labels.language}</span>
        <div className="lang-grid">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              className={`lang-opt${l === lang ? " is-on" : ""}`}
              disabled={busy}
              onClick={() => pickLang(l)}
            >
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      </section>

      <form className="profile-block" action="/bff/session" method="post">
        <input type="hidden" name="intent" value="sign-out" />
        <button className="btn-op" type="submit">
          {labels.signOut}
        </button>
      </form>
    </div>
  );
}
