"use client";

import { useState } from "react";

const doors = ["Google", "GitHub", "Microsoft", "Apple"] as const;

export function ConsoleAccess({ mode }: { mode: "entrar" | "registro" }) {
  const [step, setStep] = useState<"portal" | "correo">("portal");
  const title = mode === "entrar" ? "Entrar" : "Registro";
  const other = mode === "entrar" ? { href: "/registro", label: "Crear un acceso" } : { href: "/sign-in", label: "Ya quiero entrar" };

  return (
    <div className="register-card">
      <p className="brand-lockup">
        <span className="mark" aria-hidden="true" />
        <span className="brand-name">SOVIR</span>
      </p>
      <h1>{title}</h1>
      {step === "portal" ? (
        <>
          <div className="register-options">
            {doors.map((door) => (
              <button key={door} className="register-option" type="button" onClick={() => setStep("correo")}>
                Continuar con {door}
              </button>
            ))}
          </div>
          <button className="register-mail" type="button" onClick={() => setStep("correo")}>
            Continuar con el correo
          </button>
        </>
      ) : (
        <form
          className="register-email"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label>
            Correo
            <input name="correo" type="email" autoComplete="off" placeholder="nombre@correo.com" required />
          </label>
          <button className="button" type="submit">
            Continuar con el correo
          </button>
          <button className="register-mail" type="button" onClick={() => setStep("portal")}>
            Otras opciones
          </button>
          {mode === "entrar" ? (
            <p className="register-note">El correo todavía no abre una sesión. El perfil de desarrollador está debajo.</p>
          ) : null}
        </form>
      )}
      <p className="register-note">
        <a href={other.href}>{other.label}</a>
      </p>
    </div>
  );
}
