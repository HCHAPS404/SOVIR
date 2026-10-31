"use client";

import { useState } from "react";

const doors = ["Google", "GitHub", "Microsoft", "Apple"] as const;
type Door = (typeof doors)[number] | "correo";

export function ConsoleAccess({ mode }: { mode: "entrar" | "registro" }) {
  const [step, setStep] = useState<"portal" | "correo" | "hecho">("portal");
  const [choice, setChoice] = useState<Door | null>(null);
  const title = mode === "entrar" ? "Entrar" : "Registro";
  const other = mode === "entrar" ? { href: "/registro", label: "Crear un acceso" } : { href: "/sign-in", label: "Ya quiero entrar" };

  function finish(next: Door) {
    setChoice(next);
    setStep("hecho");
  }

  const done =
    mode === "entrar"
      ? `Elegiste ${choice === "correo" ? "el correo" : choice}. No se inició sesión. No se llamó a ningún servicio.`
      : `Elegiste ${choice === "correo" ? "el correo" : choice}. No se guardó el registro. No se llamó a ningún servicio.`;

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
              <button key={door} className="register-option" type="button" onClick={() => finish(door)}>
                Continuar con {door}
              </button>
            ))}
          </div>
          <button className="register-mail" type="button" onClick={() => setStep("correo")}>
            Continuar con el correo
          </button>
        </>
      ) : null}
      {step === "correo" ? (
        <form
          className="register-email"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const email = String(data.get("correo") ?? "");
            event.currentTarget.reset();
            if (!email.includes("@")) return;
            finish("correo");
          }}
        >
          <label>
            Correo
            <input name="correo" type="email" autoComplete="off" placeholder="nombre@correo.com" required />
          </label>
          <label>
            Clave
            <input name="clave" type="password" autoComplete="off" required />
          </label>
          <button className="button" type="submit">
            Continuar con el correo
          </button>
          <button className="register-mail" type="button" onClick={() => setStep("portal")}>
            Otras opciones
          </button>
        </form>
      ) : null}
      {step === "hecho" ? (
        <div className="register-done">
          <p>{done}</p>
          <button className="register-option" type="button" onClick={() => setStep("portal")}>
            Volver a las opciones
          </button>
        </div>
      ) : null}
      <p className="register-note">
        {mode === "entrar" ? "El perfil de desarrollador, debajo, entra sin cuenta. " : "Esta pantalla no envía el correo. "}
        <a href={other.href}>{other.label}</a>
      </p>
    </div>
  );
}
