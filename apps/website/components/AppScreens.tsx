// Recreated product surfaces for the landing — drawn with the same tokens
// as the real apps (dark ink bg, cream text, amber accents). These are
// illustrations of the UI, not screenshots; the story they tell matches
// the real flow: observe -> council -> warn -> explain.

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone-frame" aria-hidden="true">
      <div className="phone-notch" />
      <div className="phone-screen">{children}</div>
    </div>
  );
}

export function BrowserFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="browser-frame" aria-hidden="true">
      <div className="browser-bar">
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-url">{url}</span>
      </div>
      <div className="browser-view">{children}</div>
    </div>
  );
}

// --- Android app (Compose dark, faithful to the real warning detail) ---

export type SequenceStep = 0 | 1 | 2 | 3 | 4;

export function AndroidWarning({ step }: { step: SequenceStep }) {
  // 0 incoming chat, 1 observed (scan), 2 signals, 3 council votes, 4 warn toast
  return (
    <div className="app-screen">
      <div className="app-status">
        <span>21:42</span>
        <span className="app-status-ico">◆ ● ▲</span>
      </div>
      {step >= 4 && (
        <div className="alert-toast" role="presentation">
          <span className="warn-dot" />
          <div className="alert-toast-body">
            <strong>Actúa con cuidado</strong>
            <small>Posible falsa paquetería — toca para ver por qué</small>
          </div>
          <span className="alert-toast-chev">›</span>
        </div>
      )}
      <div className={`chat-stage ${step >= 1 ? "is-observed" : ""} ${step >= 4 ? "with-toast" : ""}`}>
        <div className="chat-head">
          <span className="chat-back">‹</span>
          <span className="chat-peer">+52 55 •• •• •• 84</span>
        </div>
        <div className={`bubble in ${step >= 1 ? "is-flagged" : ""}`}>
          Tu paquete fue retenido en aduana. Paga $49.90 en las próximas 2
          horas o lo devolvemos: paqueteria-express.mx/lp
        </div>
        <div className="bubble out ok">¿De dónde viene este link?</div>
      </div>
      {step >= 1 && (
        <div className="scan-line" role="presentation">
          <span />
        </div>
      )}
      {step >= 2 && (
        <div className="signal-chips">
          <span className="chip">urgencia</span>
          <span className="chip">pago</span>
          <span className="chip">enlace no verificado</span>
        </div>
      )}
      {step >= 3 && (
        <div className="council-row">
          <span className="vote yes">reglas ✓</span>
          <span className="vote yes">modelo local ✓</span>
          <span className="vote abstain">remoto — privado</span>
        </div>
      )}
      {step >= 4 && (
        <p className="warn-provenance toast-src">Explicado por Meta · consejo local</p>
      )}
    </div>
  );
}

export function AndroidMain() {
  return (
    <div className="app-screen">
      <div className="app-status">
        <span>9:15</span>
        <span className="app-status-ico">◆ ● ▲</span>
      </div>
      <div className="app-hero">
        <span className="shield-glyph" />
        <p className="app-hero-title">SOVIR está contigo</p>
        <p className="app-hero-sub">3 fuentes observando · todo en el teléfono</p>
      </div>
      <div className="app-row">
        <span className="app-row-ico" />
        <div>
          <strong>Avisos</strong>
          <small>1 sin leer — falsa paquetería, ayer</small>
        </div>
        <span className="app-badge">1</span>
      </div>
      <div className="app-row">
        <span className="app-row-ico" />
        <div>
          <strong>Apps permitidas</strong>
          <small>8 observadas · 42 descansan</small>
        </div>
      </div>
      <div className="app-row">
        <span className="app-row-ico" />
        <div>
          <strong>Tu privacidad</strong>
          <small>Sin texto en la nube · revocable</small>
        </div>
      </div>
      <div className="app-tabbar">
        <span className="on" />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

// --- Console (faithful recreation of the real incidents view) ---

export function ConsoleIncidents() {
  return (
    <div className="console-screen">
      <aside className="console-side">
        <div className="console-brand">
          <span className="console-mark"><span className="mark" aria-hidden="true" /></span>
          <div>
            <strong>SOVIR</strong>
            <small>Tu protección personal</small>
          </div>
          <span className="console-live" />
        </div>
        <div className="console-search">Buscar vista… <kbd>/</kbd></div>
        <p className="console-menu-kicker">Menú principal</p>
        <nav>
          <span>Resumen</span>
          <span className="on">
            Avisos de seguridad <i>2</i>
          </span>
          <span>Mis dispositivos</span>
          <span>Privacidad y permisos</span>
        </nav>
      </aside>
      <div className="console-main">
        <div className="console-topbar">
          <span className="console-crumb">SOVIR <em>/</em> Avisos de seguridad</span>
          <span className="console-toggle">Vista sencilla</span>
        </div>
        <p className="console-kicker">
          <span className="console-dot" /> 2 avisos registrados para cuidarte
        </p>
        <h4>Avisos de seguridad</h4>
        <div className="console-cards">
          <div className="console-card">
            <div className="console-card-top">
              <small>HACE 2 DÍAS</small>
              <span className="chip warn">nuevo aviso</span>
            </div>
            <strong>Alerta de protección</strong>
            <p>SOVIR detectó una señal de riesgo en tu actividad.</p>
            <div className="console-reco">
              <span>Recomendación</span>
              <em>Tómate un minuto antes de responder o entregar información personal.</em>
            </div>
            <span className="why-link">¿Por qué? — explicado por Meta</span>
          </div>
          <div className="console-card">
            <div className="console-card-top">
              <small>HACE 2 DÍAS</small>
              <span className="chip warn">nuevo aviso</span>
            </div>
            <strong>Revisión sugerida</strong>
            <p>Dominio imitando a tu banco en una página visitada.</p>
            <div className="console-reco">
              <span>Recomendación</span>
              <em>No introduzcas credenciales hasta verificar el dominio.</em>
            </div>
            <span className="why-link">¿Por qué? — reglas locales</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Extension popup (faithful to popup.html) ---

export function ExtensionPopup() {
  return (
    <div className="ext-screen">
      <div className="ext-head">
        <span className="console-mark"><span className="mark" aria-hidden="true" /></span>
        <strong>SOVIR</strong>
        <span className="ext-opts">Ajustes</span>
      </div>
      <p className="ext-title">Protección activa</p>
      <p className="ext-sub">Observando las páginas que visitas en busca de riesgos.</p>
      <div className="ext-stats">
        <span><b>80</b><small>páginas revisadas</small></span>
        <span><b>92</b><small>señales vistas</small></span>
        <span><b className="warn-n">7</b><small>avisos</small></span>
      </div>
      <div className="ext-page">
        <span className="ext-dot" />
        <p>Observando hell.taile32c7d.ts.net</p>
      </div>
      <div className="ext-actions">
        <span className="ext-btn ghost">No observar esta página</span>
        <span className="ext-btn ghost">Pausar protección</span>
      </div>
      <p className="ext-foot">
        SOVIR lee solo señales de riesgo — nunca guarda tu contenido,
        contraseñas ni capturas. Banca y redes sociales quedan fuera salvo
        que las actives en Ajustes.
      </p>
    </div>
  );
}
