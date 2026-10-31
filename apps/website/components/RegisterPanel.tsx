"use client";

import Link from "next/link";
import { useState } from "react";

const doors = ["Google", "GitHub", "Microsoft", "Apple"] as const;

type Door = (typeof doors)[number] | "correo";

export function RegisterPanel() {
  const [step, setStep] = useState<"portal" | "correo" | "hecho">("portal");
  const [choice, setChoice] = useState<Door | null>(null);

  function finish(next: Door) {
    setChoice(next);
    setStep("hecho");
  }

  return (
    <div className="register-stage">
      <div className="register-card">
        <h1>Ninguna cuenta se abre desde aquí.</h1>
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
              finish("correo");
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
          </form>
        ) : null}
        {step === "hecho" ? (
          <div className="register-done">
            <p>
              Elegiste {choice === "correo" ? "el correo" : choice}. No se guardó el registro. No hay cuenta y no se
              llamó a ningún servicio.
            </p>
            <button className="register-option" type="button" onClick={() => setStep("portal")}>
              Volver a las opciones
            </button>
          </div>
        ) : null}
        <p className="register-note">
          Al continuar, aceptas los <Link href="/terminos">Términos del servicio</Link> y la <Link href="/privacy">Política de privacidad</Link>.
        </p>
      </div>
    </div>
  );
}
