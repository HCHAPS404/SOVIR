import { cookies } from "next/headers";
import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { ProfilePanel } from "../../components/ProfilePanel";
import { getLocale, stringsFor } from "../../lib/i18n";

export const metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  await requireApiSession();
  const jar = await cookies();
  const principal = jar.get("sovir_api_principal")?.value ?? "";
  const name = jar.get("sovir_display_name")?.value ?? principal.replace(/^console-/, "");
  const locale = await getLocale();
  const s = stringsFor(locale);

  return (
    <ConsoleFrame current="/perfil">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className="dot dot--success" aria-hidden="true" />
              {s.profile.kicker}
            </p>
            <h1>{s.profile.title}</h1>
            <p className="page-head-sub">{s.profile.sub}</p>
          </div>
        </header>
        <section className="panel profile-card" aria-label={s.profile.title}>
          <ProfilePanel
            name={name}
            lang={locale}
            labels={{
              photo: s.profile.photo,
              photoHint: s.profile.photoHint,
              removePhoto: s.profile.removePhoto,
              name: s.profile.name,
              save: s.profile.save,
              language: s.nav.language,
              signOut: s.nav.signOut,
            }}
          />
        </section>
      </div>
    </ConsoleFrame>
  );
}
