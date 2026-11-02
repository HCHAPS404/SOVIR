# ADR-0018: Susceptibility mirror — opt-in self-knowledge surface (proposal)

## Status


Accepted — maintainer signoff 2026-11-02.
This ADR proposes amending invariant 7; the amendment text in §Decision 2
takes effect only with explicit human approval.

## Context

The maintainer asked whether SOVIR may learn *which manipulation patterns a
specific user tends to respond to* — not to exploit them, but so the user can
see their own weak points and strengthen against them. Today invariant 7
reads:

> 7. No perfilar vulnerabilidades psicológicas de usuarios ni construir
>    herramientas de influencia coercitiva.

Its intent is sound: a covert profile of someone's psychological weak points
is the most dangerous artifact a protection product could produce — whoever
holds it owns the targeting manual against that person. The prohibition
exists to veto **covert profiling for influence**, not to veto consented
self-knowledge.

The maintainer's request describes a different thing: a *mirror* — the user
opts in, sees what the system believes about their susceptibility, corrects
it, and uses it to become harder to deceive. That is self-defense education,
not targeting. Refusing it entirely would also refuse a real product
differentiator: SOVIR not only warns in the moment, it makes the user more
resistant over time.

## Decision

1. **A susceptibility mirror is permitted only under the eight structural
   guarantees below.** All eight are required; removing any one reverts the
   feature to a forbidden covert profile.

   | # | Guarantee | Enforcement |
   |---|---|---|
   | G1 | **Explicit opt-in** | Off by default. Activation requires a dedicated consent grant naming `susceptibility-mirror` as its own scope — it is NOT implied by observer grants |
   | G2 | **Local-only storage** | The profile lives on-device. It is never serialized into `ObservedEvent`, never enters egress, never reaches a provider. Enforced by contract shape, not wording |
   | G3 | **Inspectable** | The user can view every recorded hypothesis about themselves at any time |
   | G4 | **Correctable** | The user can edit or delete individual entries without deleting the whole profile |
   | G5 | **Purgable** | One action deletes the entire profile, with an audit receipt |
   | G6 | **Hypothesis, not diagnosis** | Entries render as "SOVIR cree que…" with a bounded confidence — never as clinical or psychological fact (invariant 6: facts vs. hypotheses) |
   | G7 | **Explicit feedback outranks inference** | A user-marked "casi caigo en esto" contributes more weight than behavioral inference; silent inference alone caps at low confidence |
   | G8 | **Purpose-limited** | The profile may only feed warnings and education shown to that same user. It may not prioritize, segment, rank, feed models, or influence any output aimed at third parties |

2. **Invariant 7 is amended (upon signoff) to:**

   > 7. Prohibido perfilar vulnerabilidades psicológicas de usuarios de forma
   >    encubierta o con fines de influencia/segmentación, y prohibido
   >    construir herramientas de influencia coercitiva. Un "espejo de
   >    susceptibilidad" opt-in, local-only, inspeccionable, corregible y
   >    purgable — usado exclusivamente para reforzar la resiliencia del
   >    propio usuario — está permitido bajo ADR, matriz de privacidad y
   >    revisión humana.

   The blanket prohibition on **covert** profiling and **coercive**
   tooling stays verbatim. The amendment opens exactly one door — the
   consented mirror — and nothing else.

3. **What the mirror may learn from.** Signal categories the user *was
   warned about* (e.g. `PRIZE_LOTTERY_CLAIM`, `ROMANCE_BAIT`) combined with
   explicit user feedback, are the inputs. It characterizes **which attack
   shapes reach this user**, never a clinical trait, diagnosis, or
   personality assessment.

4. **What the mirror may never do.** Score "vulnerability" for any purpose
   other than the user's own view; feed a remote model; inform ad/engagement
   systems; alter enforcement severity downward ("this user ignores warnings
   → warn less" is explicitly forbidden); or survive revocation — deleting
   the grant deletes the profile.

## Consequences

- A new local-only profile store + view surface + feedback action are
  required — deferred to a future ticket gated on this ADR's signature.
- The mirror is a new consent scope; existing grants do not cover it.
- The heuristic engine keeps emitting per-event typed signals unchanged;
  the mirror consumes *warnings already shown*, not raw observation.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Inference noise mislabels the user ("eres susceptible a X") | G6 hypothesis language + G7 explicit-feedback-first + bounded confidence |
| Feature creep toward targeting | G8 in the contract + invariant text keeps covert profiling forbidden |
| Regulatory surface (psychological data ≈ GDPR art. 9) | G2 local-only + G1 explicit consent keeps it defensible; flagged for legal review before any shipping release |
| Profile becomes the weapon it warns against if exfiltrated | G2: it cannot leave the device by contract — there is nothing to exfiltrate through SOVIR |

## Non-goals

- No targeting, ranking nor prioritization of users by vulnerability.
- No inference about the *person* (age, mood, cognition, disability).
- No remote egress of the profile; no provider ever sees it.
- No auto-tuning of policy thresholds from the profile (policy stays
  explicit and human-authored).

## Acceptance criteria

- A principal can open the mirror view and see only patterns derived
  from warnings already shown to them, each labeled hypothesis vs fact.
- Every mirror entry carries a "retract" action that deletes it.
- Revoking the mirror grant removes the store entirely (erasure path).
- No code path outside the mirror reads the profile — grep-verified.

## Test obligations

- Corpus cases: benign navigation produces an empty mirror.
- Property: mirror store never appears in PrincipalDataExport fields
  that leave the device (local-only by construction, not by filter).

## Reversion

- Feature flag `SOVIR_MIRROR=0` disables storage and view.
- Deleting the store table/collection rolls back cleanly; no other
  component depends on it.
