# SOVIR — Final pitch video (English, 3:00)

Single competition video. Voice-over friendly: ~430 words at natural pace.
Every screen shown is the real app (console, extension, website recreation) or
synthetic fixtures — no real user data. Segment numbers match
`pitch/record.mjs` output clips and `pitch/vo/` audio files, so audio and
video can be swapped independently.

| # | Clip | VO file | Target |
|---|------|---------|--------|
| S1 | Title card → REAL pages: live search results + public phishing test | `vo_s1.mp3` | 0:00–0:18 |
| S2 | Console sign-in → panel | `vo_s2.mp3` | 0:18–0:38 |
| S3 | Incidents list | `vo_s3.mp3` | 0:38–0:52 |
| S4 | REAL pages with extension: github.com/login (benign) + live phishing test | `vo_s4.mp3` | 0:52–1:25 |
| S5 | Incident detail: votes + evidence | `vo_s5.mp3` | 1:25–1:45 |
| S6 | Permissions: grants, revoke, export, erasure | `vo_s6.mp3` | 1:45–2:12 |
| S7 | Extension popup + Android recreation | `vo_s7.mp3` | 2:12–2:32 |
| S8 | Honest status → tagline card | `vo_s8.mp3` | 2:32–3:00 |

**Regla del usuario:** nada de fixtures. Todo se valida sobre páginas web y
aplicaciones reales, en tiempo real — búsquedas vivas, feeds y páginas con
elementos de estafa/suplantación/ingeniería social. Las páginas de phishing
mostradas son harnesses públicos de prueba (Google Safe Browsing test,
phishingquiz.withgoogle.com, vulnweb) — reales, activos y diseñados para
disparar detección sin exponer al equipo a dominios maliciosos.

## VO script

**S1 — Cold open** *(title card, then real search results → live phish test)*

> What you are about to see is real — live pages, a live pipeline, right
> now. Pages like this cost people more than ten billion dollars a year.
> Your antivirus doesn't see them. Your bank doesn't see them. Because it
> isn't a virus — it's a conversation.

**S2 — Getting started** *(console `/sign-in` → dev session → panel)*

> This is SOVIR — a digital-autonomy shield. Getting started takes a minute:
> you create your space, sign in, and your panel shows devices, incidents and
> permissions — everything bound to your account, and only yours.

**S3 — Incidents** *(console `/incidents` list)*

> Nothing here is a mystery. Every entry is a real event that crossed the
> privacy gate — with its verdict, its severity, and when it happened.

**S4 — The attack, live** *(github.com benign → REAL reported phish URL → event lands)*

> So let's attack it — for real. This is a real, reported phishing page —
> live on the internet right now, impersonating a brand you know. The
> extension observes it — because I granted it — and emits typed signals.
> Not raw text, not screenshots: observable facts. And on a real login
> page, the same signal is a fact, not an accusation — the verdict stays
> calm. The event crosses the consent gate, the council votes, the policy
> decides.

**S5 — Evidence** *(incident detail: `votes[]`, provenance, uncertainty)*

> And here is the part nobody else shows you. The verdict carries its
> evidence — which voters fired, what they saw, where it came from, and how
> sure it is. Facts, hypotheses and decisions never get mixed. That's not a
> screenshot pasted into a chatbot.

**S6 — Consent and your data** *(permissions: grants list, revoke, export, erasure counters)*

> Consent is per source and per device — and it expires. Sites like banking
> and messaging are excluded by default. Revoke a grant, and collection and
> transmission stop: fail-closed, not fail-trust-us. And your data is yours:
> export it, or erase it, right here.

**S7 — Same contract, every surface** *(extension popup + Android recreation)*

> The browser extension and the Android app run the same contract — on
> Android, two gates, not one: the OS accessibility service, plus an
> expiring grant inside the app. Everything runs local-first: your text,
> your pixels, your data don't leave the device.

**S8 — Honest close** *(status card → tagline)*

> What's verified, we showed you. What's not ready, we say out loud: the
> visual model still needs work; iOS and desktop are on the roadmap. We
> don't sell promises — we show receipts. SOVIR. See the signals. Keep the
> choice.

## Claim check (all verified in README)

- FTC ~$10B/yr fraud losses — `[VERIFICAR]` exact figure before publishing.
- Consent gate, council `votes[]`, deterministic policy, verdict evidence — verified E2E.
- Sensitive sites excluded by default; revoke stops collection — verified.
- Export/erasure live in `/permissions` (`/bff/me/export`, deletion counters).
- Android: accessibility + expiring grant; verified E2E (recreation shown).
- Visual ONNX not ready; iOS/desktop `NOT_IMPLEMENTED` — stated as roadmap.
