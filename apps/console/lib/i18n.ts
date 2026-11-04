import { cookies, headers } from "next/headers";
import { LOCALES, type Locale } from "./locales";

// Console i18n — same 8 locales as the heuristic engine's term tables.
// UI language is independent from detection coverage: the engine keeps
// evaluating all languages regardless of which one the user reads.
export { LOCALES, LOCALE_NAMES } from "./locales";
export type { Locale } from "./locales";

const DEFAULT_LOCALE: Locale = "es";
const COOKIE = "sovir_lang";

function fromAcceptLanguage(header: string): Locale | null {
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    const base = tag.split("-")[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return null;
}

// Resolution order: explicit user choice (cookie) > browser/OS locale
// (Accept-Language) > product default. The cookie is set by /bff/lang.
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const chosen = jar.get(COOKIE)?.value as Locale | undefined;
  if (chosen && LOCALES.includes(chosen)) return chosen;
  const h = await headers();
  const detected = fromAcceptLanguage(h.get("accept-language") ?? "");
  return detected ?? DEFAULT_LOCALE;
}

// --- Dictionary --------------------------------------------------------------
// Every user-facing string on the simple view. Keys are grouped by surface;
// {n} interpolates a number, {x} interpolates arbitrary text, {a}/{b} money.

export interface Strings {
  nav: {
    home: string; incidents: string; investigations: string; devices: string;
    permissions: string; audit: string; signOut: string; language: string;
    simpleView: string; techView: string;
    summary: string; alerts: string; myDevices: string; privacy: string;
  };
  signin: {
    title: string; sub: string; inputLabel: string; placeholder: string;
    button: string; oidcButton: string; oidcHint: string; devMode: string; note: string;
    errors: {
      backend: string; session: string; name: string;
      oidcDenied: string; oidcState: string; oidcExchange: string; oidcToken: string;
    };
  };
  overview: {
    kicker: string; greeting: string; sub: string; budgetChip: string;
    testButton: string;
    heroWarnTitle: (n: number) => string; heroWarnSub: string;
    heroQuietTitle: string; heroQuietSub: (n: number) => string;
    heroEmptyTitle: string; heroEmptySub: string;
    chipWarnings: string; chipClean: string; chipNone: string;
    howTitle: string; howKicker: string;
    how1T: string; how1S: string; how2T: string; how2S: string;
    how3T: string; how3S: (grants: number, devices: number) => string;
    seePermissions: string; seeDevices: string;
    catTitle: string; catKicker: string; catSub: string; catSeeAlerts: (n: number) => string;
    feedTitle: string; feedEmpty: string;
    tipsTitle: string; tipsKicker: string;
  };
  devices: {
    kickerConnected: (n: number) => string; kickerNone: string;
    title: string; sub: string; connectButton: string;
    noneChip: string; noneTitle: string; noneSub: string; noneButton: string;
    cardActive: string; cardRevoked: string; disconnect: string; disconnectAsk: string;
    lastSeen: string; lastSeenNever: string;
    chipOn: string; chipOff: string;
  };
  common: { lastAlertAgo: string; today: string; week: string };
}

const es: Strings = {
  nav: {
    home: "Inicio", incidents: "Incidentes", investigations: "Investigaciones",
    devices: "Dispositivos", permissions: "Permisos", audit: "Auditoría",
    signOut: "Salir", language: "Idioma", simpleView: "Vista sencilla",
    techView: "Modo técnico",
    summary: "Resumen", alerts: "Avisos de seguridad",
    myDevices: "Mis dispositivos", privacy: "Privacidad y permisos",
  },
  signin: {
    title: "Tu protección personal",
    sub: "SOVIR te ayuda a detectar estafas, cobros engañosos y mensajes de presión antes de que tomes una decisión apresurada. Todo funciona en tu propio equipo.",
    inputLabel: "Escribe tu nombre para abrir tu espacio",
    placeholder: "p. ej. Ana",
    button: "Entrar a mi panel",
    oidcButton: "Entrar con mi cuenta",
    oidcHint: "¿Primera vez? Creas tu cuenta con contraseña en el paso siguiente.",
    devMode: "Entorno de desarrollo",
    note: "Cada nombre tiene su propio espacio privado de avisos, dispositivos y permisos. Entorno local de demostración (sesión aislada en httpOnly, sin contraseñas ni envío de datos a terceros).",
    errors: {
      backend: "El servicio local de SOVIR no está encendido en 127.0.0.1:8787.",
      session: "Tu sesión terminó — vuelve a escribir tu nombre para entrar.",
      name: "Usa solo letras, números, punto o guion (sin espacios especiales).",
      oidcDenied: "Cancelaste el acceso en el proveedor de identidad.",
      oidcState: "El intento de acceso expiró — vuelve a intentarlo.",
      oidcExchange: "No pudimos completar el acceso con tu cuenta.",
      oidcToken: "El proveedor no entregó una credencial válida.",
    },
  },
  overview: {
    kicker: "Tu protección está activa · Todo se analiza dentro de tu propio equipo",
    greeting: "Hola, {x}",
    sub: "SOVIR es tu asistente contra estafas digitales: te avisa cuando una página o mensaje intenta apurarte para que pagues o entregues tus datos personales.",
    budgetChip: "Gasto: ${a} / ${b}",
    testButton: "Hacer una prueba de estafa",
    heroWarnTitle: (n) =>
      `Esta semana te avisamos ante ${n} ${n === 1 ? "intento sospechoso" : "intentos sospechosos"}`,
    heroWarnSub: "Detectamos tácticas de presión o solicitudes de pago dudosas. Debajo puedes ver tu actividad por día.",
    heroQuietTitle: "Todo está tranquilo esta semana",
    heroQuietSub: (n) =>
      `Revisamos ${n} ${n === 1 ? "actividad" : "actividades"} y no encontramos ningún intento de estafa ni cobro engañoso.`,
    heroEmptyTitle: "SOVIR está listo para cuidarte",
    heroEmptySub: "Aún no hay avisos registrados. Si quieres ver cómo funciona antes de que ocurra algo real, pulsa “Hacer una prueba de estafa” arriba.",
    chipWarnings: "Avisos emitidos esta semana",
    chipClean: "Sin amenazas detectadas",
    chipNone: "Sin actividad aún",
    howTitle: "¿Cómo te cuida SOVIR?",
    howKicker: "En palabras simples",
    how1T: "1. Detecta trampas en el momento",
    how1S: "Identifica cuando un sitio usa falsa urgencia, cobros escondidos o se hace pasar por alguien más.",
    how2T: "2. Nunca espía tu vida privada",
    how2S: "Todo funciona dentro de tu dispositivo. No guardamos tus contraseñas, fotos ni conversaciones.",
    how3T: "3. Tú decides qué permisos están encendidos",
    how3S: (g, d) =>
      `Tienes ${g} ${g === 1 ? "permiso activo" : "permisos activos"} y ${d} ${d === 1 ? "dispositivo vinculado" : "dispositivos vinculados"}.`,
    seePermissions: "Ver mis permisos →",
    seeDevices: "Ver mis dispositivos →",
    catTitle: "¿Qué tipo de trampas hemos frenado?",
    catKicker: "Motivos de aviso",
    catSub: "Resumen en español claro de las señales sospechosas vistas esta semana.",
    catSeeAlerts: (n) => `Ver avisos (${n}) →`,
    feedTitle: "Tu actividad reciente",
    feedEmpty: "Todavía no hay actividad que mostrar.",
    tipsTitle: "Guía rápida para no caer en trampas",
    tipsKicker: "Apréndete estos trucos",
  },
  devices: {
    kickerConnected: (n) =>
      `${n} ${n === 1 ? "dispositivo conectado" : "dispositivos conectados"} a tu cuenta`,
    kickerNone: "Aún no has vinculado ningún dispositivo",
    title: "Mis dispositivos",
    sub: "Aquí aparecen tus navegadores, teléfonos o computadoras cuando inicias sesión en ellos. Si ya no usas alguno, puedes desconectarlo con un clic.",
    connectButton: "+ Conectar este navegador",
    noneChip: "Ningún equipo vinculado todavía",
    noneTitle: "Conecta este navegador para empezar",
    noneSub: "No necesitas escribir nombres técnicos ni configurar nada a mano: cuando abres SOVIR en un equipo o navegador y entras a tu cuenta, queda vinculado automáticamente.",
    noneButton: "Conectar este navegador ahora",
    cardActive: "Conectado a tu cuenta y listo para avisarte ante estafas.",
    cardRevoked: "Desconectado — ya no envía información a tu cuenta.",
    disconnect: "Desconectar",
    disconnectAsk: "¿Ya no usas este equipo?",
    lastSeen: "Última actividad",
    lastSeenNever: "sin señales aún",
    chipOn: "conectado", chipOff: "desconectado",
  },
  common: { lastAlertAgo: "el último aviso fue {x}", today: "hoy", week: "esta semana" },
};

const en: Strings = {
  nav: {
    home: "Home", incidents: "Incidents", investigations: "Investigations",
    devices: "Devices", permissions: "Permissions", audit: "Audit",
    signOut: "Sign out", language: "Language", simpleView: "Simple view",
    techView: "Technical mode",
    summary: "Overview", alerts: "Security alerts",
    myDevices: "My devices", privacy: "Privacy & permissions",
  },
  signin: {
    title: "Your personal protection",
    sub: "SOVIR helps you spot scams, deceptive charges and pressure messages before you make a rushed decision. Everything runs on your own device.",
    inputLabel: "Type your name to open your space",
    placeholder: "e.g. Ana",
    button: "Enter my panel",
    oidcButton: "Sign in with my account",
    oidcHint: "First time? You create your password-protected account in the next step.",
    devMode: "Development environment",
    note: "Each name gets its own private space of alerts, devices and permissions. Local demo environment (isolated httpOnly session, no passwords, no data sent to third parties).",
    errors: {
      backend: "SOVIR's local service is not running on 127.0.0.1:8787.",
      session: "Your session ended — type your name again to enter.",
      name: "Use only letters, numbers, dot or dash (no special spaces).",
      oidcDenied: "You cancelled sign-in at the identity provider.",
      oidcState: "The sign-in attempt expired — please try again.",
      oidcExchange: "We could not complete sign-in with your account.",
      oidcToken: "The provider did not return a valid credential.",
    },
  },
  overview: {
    kicker: "Your protection is on · Everything is analyzed on your own device",
    greeting: "Hi, {x}",
    sub: "SOVIR is your assistant against digital scams: it warns you when a page or message tries to rush you into paying or handing over personal data.",
    budgetChip: "Spend: ${a} / ${b}",
    testButton: "Run a scam drill",
    heroWarnTitle: (n) =>
      `This week we warned you about ${n} suspicious ${n === 1 ? "attempt" : "attempts"}`,
    heroWarnSub: "We detected pressure tactics or dubious payment requests. Your daily activity is shown below.",
    heroQuietTitle: "All quiet this week",
    heroQuietSub: (n) =>
      `We checked ${n} ${n === 1 ? "activity" : "activities"} and found no scam attempts or deceptive charges.`,
    heroEmptyTitle: "SOVIR is ready to protect you",
    heroEmptySub: "No alerts recorded yet. To see how it works before something real happens, press “Run a scam drill” above.",
    chipWarnings: "Warnings issued this week",
    chipClean: "No threats detected",
    chipNone: "No activity yet",
    howTitle: "How does SOVIR protect you?",
    howKicker: "In plain words",
    how1T: "1. It spots traps in the moment",
    how1S: "It notices when a site uses fake urgency, hidden charges or impersonates someone.",
    how2T: "2. It never spies on your private life",
    how2S: "Everything runs on your device. We never store your passwords, photos or conversations.",
    how3T: "3. You decide which permissions are on",
    how3S: (g, d) =>
      `You have ${g} active ${g === 1 ? "permission" : "permissions"} and ${d} linked ${d === 1 ? "device" : "devices"}.`,
    seePermissions: "See my permissions →",
    seeDevices: "See my devices →",
    catTitle: "What kinds of traps have we stopped?",
    catKicker: "Warning reasons",
    catSub: "Plain-language summary of suspicious signals seen this week.",
    catSeeAlerts: (n) => `See alerts (${n}) →`,
    feedTitle: "Your recent activity",
    feedEmpty: "Nothing to show yet.",
    tipsTitle: "Quick guide to avoid traps",
    tipsKicker: "Learn these tricks",
  },
  devices: {
    kickerConnected: (n) => `${n} ${n === 1 ? "device" : "devices"} connected to your account`,
    kickerNone: "No devices linked yet",
    title: "My devices",
    sub: "Your browsers, phones or computers appear here when you sign in on them. If you no longer use one, disconnect it with a click.",
    connectButton: "+ Connect this browser",
    noneChip: "No device linked yet",
    noneTitle: "Connect this browser to start",
    noneSub: "No technical names or manual setup needed: when you open SOVIR on a device or browser and sign in, it links automatically.",
    noneButton: "Connect this browser now",
    cardActive: "Connected to your account and ready to warn you about scams.",
    cardRevoked: "Disconnected — no longer sends information to your account.",
    disconnect: "Disconnect",
    disconnectAsk: "No longer using this device?",
    lastSeen: "Last activity",
    lastSeenNever: "no signals yet",
    chipOn: "connected", chipOff: "disconnected",
  },
  common: { lastAlertAgo: "last alert {x}", today: "today", week: "this week" },
};

const pt: Strings = {
  nav: {
    home: "Início", incidents: "Incidentes", investigations: "Investigações",
    devices: "Dispositivos", permissions: "Permissões", audit: "Auditoria",
    signOut: "Sair", language: "Idioma", simpleView: "Vista simples",
    techView: "Modo técnico",
    summary: "Resumo", alerts: "Avisos de segurança",
    myDevices: "Os meus dispositivos", privacy: "Privacidade e permissões",
  },
  signin: {
    title: "A sua proteção pessoal",
    sub: "O SOVIR ajuda a detetar golpes, cobranças enganosas e mensagens de pressão antes de uma decisão precipitada. Tudo funciona no seu próprio dispositivo.",
    inputLabel: "Escreva o seu nome para abrir o seu espaço",
    placeholder: "p. ex. Ana",
    button: "Entrar no meu painel",
    oidcButton: "Entrar com a minha conta",
    oidcHint: "Primeira vez? Cria a sua conta com palavra-passe no passo seguinte.",
    devMode: "Ambiente de desenvolvimento",
    note: "Cada nome tem o seu próprio espaço privado de avisos, dispositivos e permissões. Ambiente local de demonstração (sessão isolada em httpOnly, sem senhas nem envio de dados a terceiros).",
    errors: {
      backend: "O serviço local do SOVIR não está ativo em 127.0.0.1:8787.",
      session: "A sua sessão terminou — escreva o seu nome novamente.",
      name: "Use apenas letras, números, ponto ou hífen.",
      oidcDenied: "Cancelou o acesso no provedor de identidade.",
      oidcState: "A tentativa de acesso expirou — tente novamente.",
      oidcExchange: "Não conseguimos concluir o acesso com a sua conta.",
      oidcToken: "O provedor não devolveu uma credencial válida.",
    },
  },
  overview: {
    kicker: "A sua proteção está ativa · Tudo é analisado no seu próprio dispositivo",
    greeting: "Olá, {x}",
    sub: "O SOVIR é o seu assistente contra golpes digitais: avisa quando uma página ou mensagem tenta apressá-lo a pagar ou entregar dados pessoais.",
    budgetChip: "Gasto: ${a} / ${b}",
    testButton: "Fazer um teste de golpe",
    heroWarnTitle: (n) =>
      `Esta semana avisámos sobre ${n} ${n === 1 ? "tentativa suspeita" : "tentativas suspeitas"}`,
    heroWarnSub: "Detetámos táticas de pressão ou pedidos de pagamento duvidosos. Abaixo vê a sua atividade por dia.",
    heroQuietTitle: "Tudo tranquilo esta semana",
    heroQuietSub: (n) =>
      `Analisámos ${n} ${n === 1 ? "atividade" : "atividades"} e não encontrámos nenhuma tentativa de golpe nem cobrança enganosa.`,
    heroEmptyTitle: "O SOVIR está pronto para o proteger",
    heroEmptySub: "Ainda não há avisos registados. Para ver como funciona antes de algo real, carregue em “Fazer um teste de golpe” acima.",
    chipWarnings: "Avisos emitidos esta semana",
    chipClean: "Sem ameaças detetadas",
    chipNone: "Ainda sem atividade",
    howTitle: "Como o SOVIR o protege?",
    howKicker: "Em palavras simples",
    how1T: "1. Deteta armadilhas no momento",
    how1S: "Identifica quando um site usa urgência falsa, cobranças escondidas ou se faz passar por outra pessoa.",
    how2T: "2. Nunca espia a sua vida privada",
    how2S: "Tudo funciona dentro do seu dispositivo. Não guardamos senhas, fotos nem conversas.",
    how3T: "3. Você decide que permissões estão ativas",
    how3S: (g, d) =>
      `Tem ${g} ${g === 1 ? "permissão ativa" : "permissões ativas"} e ${d} ${d === 1 ? "dispositivo vinculado" : "dispositivos vinculados"}.`,
    seePermissions: "Ver as minhas permissões →",
    seeDevices: "Ver os meus dispositivos →",
    catTitle: "Que tipos de armadilhas travámos?",
    catKicker: "Motivos de aviso",
    catSub: "Resumo em linguagem clara dos sinais suspeitos vistos esta semana.",
    catSeeAlerts: (n) => `Ver avisos (${n}) →`,
    feedTitle: "A sua atividade recente",
    feedEmpty: "Ainda não há atividade para mostrar.",
    tipsTitle: "Guia rápido para não cair em armadilhas",
    tipsKicker: "Aprenda estes truques",
  },
  devices: {
    kickerConnected: (n) =>
      `${n} ${n === 1 ? "dispositivo ligado" : "dispositivos ligados"} à sua conta`,
    kickerNone: "Ainda não vinculou nenhum dispositivo",
    title: "Os meus dispositivos",
    sub: "Os seus navegadores, telemóveis ou computadores aparecem aqui quando inicia sessão neles. Se já não usa algum, desligue-o com um clique.",
    connectButton: "+ Ligar este navegador",
    noneChip: "Nenhum equipamento vinculado ainda",
    noneTitle: "Ligue este navegador para começar",
    noneSub: "Não precisa de escrever nomes técnicos nem configurar nada à mão: ao abrir o SOVIR num equipamento ou navegador e entrar na sua conta, fica vinculado automaticamente.",
    noneButton: "Ligar este navegador agora",
    cardActive: "Ligado à sua conta e pronto para o avisar de golpes.",
    cardRevoked: "Desligado — já não envia informação para a sua conta.",
    disconnect: "Desligar",
    disconnectAsk: "Já não usa este equipamento?",
    lastSeen: "Última atividade",
    lastSeenNever: "sem sinais ainda",
    chipOn: "ligado", chipOff: "desligado",
  },
  common: { lastAlertAgo: "o último aviso foi {x}", today: "hoje", week: "esta semana" },
};

const fr: Strings = {
  nav: {
    home: "Accueil", incidents: "Incidents", investigations: "Enquêtes",
    devices: "Appareils", permissions: "Autorisations", audit: "Audit",
    signOut: "Quitter", language: "Langue", simpleView: "Vue simple",
    techView: "Mode technique",
    summary: "Résumé", alerts: "Alertes de sécurité",
    myDevices: "Mes appareils", privacy: "Confidentialité et autorisations",
  },
  signin: {
    title: "Votre protection personnelle",
    sub: "SOVIR vous aide à repérer les arnaques, les frais trompeurs et les messages pressants avant une décision hâtive. Tout fonctionne sur votre propre appareil.",
    inputLabel: "Écrivez votre nom pour ouvrir votre espace",
    placeholder: "p. ex. Ana",
    button: "Entrer dans mon panneau",
    oidcButton: "Me connecter avec mon compte",
    oidcHint: "Première fois ? Vous créez votre compte avec mot de passe à l’étape suivante.",
    devMode: "Environnement de développement",
    note: "Chaque nom possède son espace privé d'alertes, d'appareils et d'autorisations. Environnement local de démonstration (session isolée en httpOnly, sans mots de passe ni envoi de données à des tiers).",
    errors: {
      backend: "Le service local SOVIR n'est pas actif sur 127.0.0.1:8787.",
      session: "Votre session a expiré — écrivez à nouveau votre nom.",
      name: "Utilisez uniquement lettres, chiffres, point ou tiret.",
      oidcDenied: "Vous avez annulé la connexion chez le fournisseur d'identité.",
      oidcState: "La tentative de connexion a expiré — réessayez.",
      oidcExchange: "Impossible de finaliser la connexion avec votre compte.",
      oidcToken: "Le fournisseur n'a pas renvoyé d'identifiant valide.",
    },
  },
  overview: {
    kicker: "Votre protection est active · Tout est analysé sur votre propre appareil",
    greeting: "Bonjour, {x}",
    sub: "SOVIR est votre assistant contre les arnaques numériques : il vous alerte quand une page ou un message tente de vous presser à payer ou à livrer vos données personnelles.",
    budgetChip: "Dépense : ${a} / ${b}",
    testButton: "Lancer un test d'arnaque",
    heroWarnTitle: (n) =>
      `Cette semaine, nous vous avons alerté sur ${n} ${n === 1 ? "tentative suspecte" : "tentatives suspectes"}`,
    heroWarnSub: "Nous avons détecté des tactiques de pression ou des demandes de paiement douteuses. Votre activité par jour est ci-dessous.",
    heroQuietTitle: "Tout est calme cette semaine",
    heroQuietSub: (n) =>
      `Nous avons examiné ${n} ${n === 1 ? "activité" : "activités"} et n'avons trouvé aucune tentative d'arnaque ni frais trompeur.`,
    heroEmptyTitle: "SOVIR est prêt à vous protéger",
    heroEmptySub: "Aucune alerte enregistrée pour l'instant. Pour voir comment ça marche avant qu'un vrai cas survienne, appuyez sur « Lancer un test d'arnaque » ci-dessus.",
    chipWarnings: "Alertes émises cette semaine",
    chipClean: "Aucune menace détectée",
    chipNone: "Pas encore d'activité",
    howTitle: "Comment SOVIR vous protège ?",
    howKicker: "En mots simples",
    how1T: "1. Il repère les pièges au moment même",
    how1S: "Il identifie quand un site utilise une fausse urgence, des frais cachés ou se fait passer pour quelqu'un d'autre.",
    how2T: "2. Il n'espionne jamais votre vie privée",
    how2S: "Tout fonctionne dans votre appareil. Nous ne conservons ni mots de passe, ni photos, ni conversations.",
    how3T: "3. Vous décidez des autorisations actives",
    how3S: (g, d) =>
      `Vous avez ${g} ${g === 1 ? "autorisation active" : "autorisations actives"} et ${d} ${d === 1 ? "appareil lié" : "appareils liés"}.`,
    seePermissions: "Voir mes autorisations →",
    seeDevices: "Voir mes appareils →",
    catTitle: "Quels types de pièges avons-nous bloqués ?",
    catKicker: "Motifs d'alerte",
    catSub: "Résumé en langage clair des signaux suspects vus cette semaine.",
    catSeeAlerts: (n) => `Voir les alertes (${n}) →`,
    feedTitle: "Votre activité récente",
    feedEmpty: "Rien à afficher pour l'instant.",
    tipsTitle: "Guide rapide pour éviter les pièges",
    tipsKicker: "Apprenez ces astuces",
  },
  devices: {
    kickerConnected: (n) =>
      `${n} ${n === 1 ? "appareil connecté" : "appareils connectés"} à votre compte`,
    kickerNone: "Aucun appareil lié pour l'instant",
    title: "Mes appareils",
    sub: "Vos navigateurs, téléphones ou ordinateurs apparaissent ici quand vous vous y connectez. Si vous n'utilisez plus l'un d'eux, déconnectez-le en un clic.",
    connectButton: "+ Connecter ce navigateur",
    noneChip: "Aucun appareil lié pour l'instant",
    noneTitle: "Connectez ce navigateur pour commencer",
    noneSub: "Pas besoin de noms techniques ni de configuration manuelle : ouvrez SOVIR sur un appareil ou navigateur et connectez-vous, il se lie automatiquement.",
    noneButton: "Connecter ce navigateur maintenant",
    cardActive: "Connecté à votre compte et prêt à vous alerter des arnaques.",
    cardRevoked: "Déconnecté — n'envoie plus d'informations à votre compte.",
    disconnect: "Déconnecter",
    disconnectAsk: "Vous n'utilisez plus cet appareil ?",
    lastSeen: "Dernière activité",
    lastSeenNever: "aucun signal pour l'instant",
    chipOn: "connecté", chipOff: "déconnecté",
  },
  common: { lastAlertAgo: "dernière alerte {x}", today: "aujourd'hui", week: "cette semaine" },
};

const it: Strings = {
  nav: {
    home: "Home", incidents: "Incidenti", investigations: "Indagini",
    devices: "Dispositivi", permissions: "Permessi", audit: "Audit",
    signOut: "Esci", language: "Lingua", simpleView: "Vista semplice",
    techView: "Modalità tecnica",
    summary: "Riepilogo", alerts: "Avvisi di sicurezza",
    myDevices: "I miei dispositivi", privacy: "Privacy e permessi",
  },
  signin: {
    title: "La tua protezione personale",
    sub: "SOVIR ti aiuta a riconoscere truffe, addebiti ingannevoli e messaggi di pressione prima di una decisione affrettata. Tutto funziona sul tuo dispositivo.",
    inputLabel: "Scrivi il tuo nome per aprire il tuo spazio",
    placeholder: "es. Ana",
    button: "Entra nel mio pannello",
    oidcButton: "Accedi con il mio account",
    oidcHint: "Prima volta? Crei il tuo account con password al passo successivo.",
    devMode: "Ambiente di sviluppo",
    note: "Ogni nome ha il suo spazio privato di avvisi, dispositivi e permessi. Ambiente demo locale (sessione isolata in httpOnly, senza password né invio di dati a terzi).",
    errors: {
      backend: "Il servizio locale SOVIR non è attivo su 127.0.0.1:8787.",
      session: "La sessione è scaduta — riscrivi il tuo nome per entrare.",
      name: "Usa solo lettere, numeri, punto o trattino.",
      oidcDenied: "Hai annullato l'accesso presso il provider di identità.",
      oidcState: "Il tentativo di accesso è scaduto — riprova.",
      oidcExchange: "Non siamo riusciti a completare l'accesso con il tuo account.",
      oidcToken: "Il provider non ha restituito una credenziale valida.",
    },
  },
  overview: {
    kicker: "La tua protezione è attiva · Tutto viene analizzato sul tuo dispositivo",
    greeting: "Ciao, {x}",
    sub: "SOVIR è il tuo assistente contro le truffe digitali: ti avvisa quando una pagina o un messaggio cerca di metterti fretta per farti pagare o consegnare dati personali.",
    budgetChip: "Spesa: ${a} / ${b}",
    testButton: "Fai una prova di truffa",
    heroWarnTitle: (n) =>
      `Questa settimana ti abbiamo avvisato di ${n} ${n === 1 ? "tentativo sospetto" : "tentativi sospetti"}`,
    heroWarnSub: "Abbiamo rilevato tattiche di pressione o richieste di pagamento dubbie. Sotto vedi la tua attività per giorno.",
    heroQuietTitle: "Tutto tranquillo questa settimana",
    heroQuietSub: (n) =>
      `Abbiamo controllato ${n} ${n === 1 ? "attività" : "attività"} e non abbiamo trovato tentativi di truffa né addebiti ingannevoli.`,
    heroEmptyTitle: "SOVIR è pronto a proteggerti",
    heroEmptySub: "Nessun avviso registrato finora. Per vedere come funziona prima che succeda davvero, premi «Fai una prova di truffa» qui sopra.",
    chipWarnings: "Avvisi emessi questa settimana",
    chipClean: "Nessuna minaccia rilevata",
    chipNone: "Ancora nessuna attività",
    howTitle: "Come ti protegge SOVIR?",
    howKicker: "In parole semplici",
    how1T: "1. Riconosce le trappole sul momento",
    how1S: "Si accorge quando un sito usa falsa urgenza, addebiti nascosti o finge di essere qualcun altro.",
    how2T: "2. Non spia mai la tua vita privata",
    how2S: "Tutto funziona nel tuo dispositivo. Non conserviamo password, foto né conversazioni.",
    how3T: "3. Decidi tu quali permessi sono attivi",
    how3S: (g, d) =>
      `Hai ${g} ${g === 1 ? "permesso attivo" : "permessi attivi"} e ${d} ${d === 1 ? "dispositivo collegato" : "dispositivi collegati"}.`,
    seePermissions: "Vedi i miei permessi →",
    seeDevices: "Vedi i miei dispositivi →",
    catTitle: "Che tipo di trappole abbiamo fermato?",
    catKicker: "Motivi di avviso",
    catSub: "Riepilogo in linguaggio semplice dei segnali sospetti visti questa settimana.",
    catSeeAlerts: (n) => `Vedi avvisi (${n}) →`,
    feedTitle: "La tua attività recente",
    feedEmpty: "Ancora nulla da mostrare.",
    tipsTitle: "Guida rapida per non cadere nelle trappole",
    tipsKicker: "Impara questi trucchi",
  },
  devices: {
    kickerConnected: (n) =>
      `${n} ${n === 1 ? "dispositivo connesso" : "dispositivi connessi"} al tuo account`,
    kickerNone: "Non hai ancora collegato nessun dispositivo",
    title: "I miei dispositivi",
    sub: "Qui compaiono i tuoi browser, telefoni o computer quando accedi da essi. Se non ne usi più uno, lo scolleghi con un clic.",
    connectButton: "+ Collega questo browser",
    noneChip: "Nessun dispositivo collegato ancora",
    noneTitle: "Collega questo browser per iniziare",
    noneSub: "Non serve scrivere nomi tecnici né configurare nulla a mano: apri SOVIR su un dispositivo o browser, accedi e si collega automaticamente.",
    noneButton: "Collega questo browser ora",
    cardActive: "Connesso al tuo account e pronto ad avvisarti delle truffe.",
    cardRevoked: "Scollegato — non invia più informazioni al tuo account.",
    disconnect: "Scollega",
    disconnectAsk: "Non usi più questo dispositivo?",
    lastSeen: "Ultima attività",
    lastSeenNever: "nessun segnale ancora",
    chipOn: "connesso", chipOff: "scollegato",
  },
  common: { lastAlertAgo: "ultimo avviso {x}", today: "oggi", week: "questa settimana" },
};

const de: Strings = {
  nav: {
    home: "Start", incidents: "Vorfälle", investigations: "Untersuchungen",
    devices: "Geräte", permissions: "Berechtigungen", audit: "Audit",
    signOut: "Abmelden", language: "Sprache", simpleView: "Einfache Ansicht",
    techView: "Technik-Modus",
    summary: "Übersicht", alerts: "Sicherheitswarnungen",
    myDevices: "Meine Geräte", privacy: "Datenschutz & Berechtigungen",
  },
  signin: {
    title: "Dein persönlicher Schutz",
    sub: "SOVIR hilft dir, Betrug, irreführende Abbuchungen und Druck-Nachrichten zu erkennen, bevor du überstürzt handelst. Alles läuft auf deinem eigenen Gerät.",
    inputLabel: "Gib deinen Namen ein, um deinen Bereich zu öffnen",
    placeholder: "z. B. Ana",
    button: "Mein Panel öffnen",
    oidcButton: "Mit meinem Konto anmelden",
    oidcHint: "Zum ersten Mal? Im nächsten Schritt erstellen Sie Ihr Konto mit Passwort.",
    devMode: "Entwicklungsumgebung",
    note: "Jeder Name hat seinen privaten Bereich für Warnungen, Geräte und Berechtigungen. Lokale Demo-Umgebung (isolierte httpOnly-Session, keine Passwörter, keine Daten an Dritte).",
    errors: {
      backend: "Der lokale SOVIR-Dienst läuft nicht auf 127.0.0.1:8787.",
      session: "Deine Sitzung ist abgelaufen — gib deinen Namen erneut ein.",
      name: "Nur Buchstaben, Zahlen, Punkt oder Bindestrich verwenden.",
      oidcDenied: "Du hast die Anmeldung beim Identitätsanbieter abgebrochen.",
      oidcState: "Der Anmeldeversuch ist abgelaufen — bitte erneut versuchen.",
      oidcExchange: "Die Anmeldung mit deinem Konto konnte nicht abgeschlossen werden.",
      oidcToken: "Der Anbieter hat keine gültige Anmeldeinformation geliefert.",
    },
  },
  overview: {
    kicker: "Dein Schutz ist aktiv · Alles wird auf deinem eigenen Gerät analysiert",
    greeting: "Hallo, {x}",
    sub: "SOVIR ist dein Assistent gegen digitale Betrügereien: Es warnt dich, wenn eine Seite oder Nachricht dich zu einer Zahlung oder Herausgabe persönlicher Daten drängen will.",
    budgetChip: "Ausgaben: ${a} / ${b}",
    testButton: "Betrugs-Testlauf starten",
    heroWarnTitle: (n) =>
      `Diese Woche haben wir dich vor ${n} verdächtigen ${n === 1 ? "Versuch" : "Versuchen"} gewarnt`,
    heroWarnSub: "Wir haben Drucktaktiken oder zweifelhafte Zahlungsaufforderungen erkannt. Deine Tagesaktivität siehst du unten.",
    heroQuietTitle: "Diese Woche alles ruhig",
    heroQuietSub: (n) =>
      `Wir haben ${n} ${n === 1 ? "Aktivität" : "Aktivitäten"} geprüft und keine Betrugsversuche oder irreführenden Abbuchungen gefunden.`,
    heroEmptyTitle: "SOVIR ist bereit, dich zu schützen",
    heroEmptySub: "Noch keine Warnungen. Um vorab zu sehen, wie es funktioniert, drücke oben „Betrugs-Testlauf starten“.",
    chipWarnings: "Warnungen diese Woche",
    chipClean: "Keine Bedrohungen erkannt",
    chipNone: "Noch keine Aktivität",
    howTitle: "Wie schützt dich SOVIR?",
    howKicker: "In einfachen Worten",
    how1T: "1. Erkennt Fallen im Moment",
    how1S: "Es erkennt, wenn eine Seite falsche Dringlichkeit, versteckte Gebühren nutzt oder sich als jemand anderes ausgibt.",
    how2T: "2. Spioniert nie dein Privatleben aus",
    how2S: "Alles läuft auf deinem Gerät. Wir speichern keine Passwörter, Fotos oder Unterhaltungen.",
    how3T: "3. Du entscheidest, welche Berechtigungen an sind",
    how3S: (g, d) =>
      `Du hast ${g} aktive ${g === 1 ? "Berechtigung" : "Berechtigungen"} und ${d} verknüpfte ${d === 1 ? "Gerät" : "Geräte"}.`,
    seePermissions: "Meine Berechtigungen ansehen →",
    seeDevices: "Meine Geräte ansehen →",
    catTitle: "Welche Arten von Fallen haben wir gestoppt?",
    catKicker: "Warngründe",
    catSub: "Zusammenfassung der verdächtigen Signale dieser Woche in klarer Sprache.",
    catSeeAlerts: (n) => `Warnungen ansehen (${n}) →`,
    feedTitle: "Deine letzte Aktivität",
    feedEmpty: "Noch nichts anzuzeigen.",
    tipsTitle: "Kurzanleitung gegen Fallen",
    tipsKicker: "Lerne diese Tricks",
  },
  devices: {
    kickerConnected: (n) =>
      `${n} ${n === 1 ? "Gerät" : "Geräte"} mit deinem Konto verbunden`,
    kickerNone: "Noch kein Gerät verknüpft",
    title: "Meine Geräte",
    sub: "Deine Browser, Telefone oder Computer erscheinen hier, wenn du dich auf ihnen anmeldest. Nutzt du eines nicht mehr, trennst du es mit einem Klick.",
    connectButton: "+ Diesen Browser verbinden",
    noneChip: "Noch kein Gerät verknüpft",
    noneTitle: "Verbinde diesen Browser zum Starten",
    noneSub: "Keine technischen Namen oder Handkonfiguration nötig: Öffne SOVIR auf einem Gerät oder Browser, melde dich an — die Verknüpfung erfolgt automatisch.",
    noneButton: "Diesen Browser jetzt verbinden",
    cardActive: "Mit deinem Konto verbunden und bereit, dich vor Betrug zu warnen.",
    cardRevoked: "Getrennt — sendet keine Informationen mehr an dein Konto.",
    disconnect: "Trennen",
    disconnectAsk: "Nutzt du dieses Gerät nicht mehr?",
    lastSeen: "Letzte Aktivität",
    lastSeenNever: "noch keine Signale",
    chipOn: "verbunden", chipOff: "getrennt",
  },
  common: { lastAlertAgo: "letzte Warnung {x}", today: "heute", week: "diese Woche" },
};

const ja: Strings = {
  nav: {
    home: "ホーム", incidents: "インシデント", investigations: "調査",
    devices: "デバイス", permissions: "許可", audit: "監査",
    signOut: "サインアウト", language: "言語", simpleView: "シンプル表示",
    techView: "技術モード",
    summary: "概要", alerts: "セキュリティ警告",
    myDevices: "マイデバイス", privacy: "プライバシーと許可",
  },
  signin: {
    title: "あなたの個人保護",
    sub: "SOVIRは、詐欺・不審な請求・焦らせるメッセージを、慌てた判断の前に見つけるお手伝いをします。すべてはあなたのデバイス上で動作します。",
    inputLabel: "名前を入力して自分のスペースを開く",
    placeholder: "例：アナ",
    button: "マイパネルに入る",
    oidcButton: "アカウントでサインイン",
    oidcHint: "初めての方は次のステップでパスワード付きアカウントを作成します。",
    devMode: "開発環境",
    note: "名前ごとに、警告・デバイス・許可のプライベートなスペースがあります。ローカルのデモ環境です（httpOnlyの分離セッション、パスワード不要、第三者へのデータ送信なし）。",
    errors: {
      backend: "SOVIRのローカルサービスが127.0.0.1:8787で動作していません。",
      session: "セッションが終了しました — もう一度名前を入力してください。",
      name: "文字・数字・ドット・ハイフンのみ使用できます。",
      oidcDenied: "IDプロバイダーでのサインインをキャンセルしました。",
      oidcState: "サインインの試行が期限切れです — もう一度お試しください。",
      oidcExchange: "アカウントでのサインインを完了できませんでした。",
      oidcToken: "プロバイダーが有効な資格情報を返しませんでした。",
    },
  },
  overview: {
    kicker: "保護は有効です · すべての分析はあなたのデバイス上で行われます",
    greeting: "こんにちは、{x}さん",
    sub: "SOVIRはデジタル詐欺対策のアシスタントです。ページやメッセージが支払いや個人情報の提供を急がせようとしたときに警告します。",
    budgetChip: "使用額: ${a} / ${b}",
    testButton: "詐欺のテストを実行",
    heroWarnTitle: (n) => `今週、${n}件の不審な試みについて警告しました`,
    heroWarnSub: "圧力戦術や不審な支払い要求を検出しました。下に日ごとの活動を表示しています。",
    heroQuietTitle: "今週はすべて平穏です",
    heroQuietSub: (n) =>
      `${n}件のアクティビティを確認しましたが、詐欺の試みや不審な請求は見つかりませんでした。`,
    heroEmptyTitle: "SOVIRはあなたを守る準備ができています",
    heroEmptySub: "まだ警告はありません。実際の被害の前に動作を見たい場合は、上の「詐欺のテストを実行」を押してください。",
    chipWarnings: "今週発行された警告",
    chipClean: "脅威は検出されませんでした",
    chipNone: "まだアクティビティがありません",
    howTitle: "SOVIRはどうやってあなたを守るの？",
    howKicker: "やさしい言葉で",
    how1T: "1. その場で罠を検出します",
    how1S: "サイトが偽の緊急性・隠れた請求・なりすましを使うと検出します。",
    how2T: "2. あなたの私生活を決して覗きません",
    how2S: "すべてデバイス内で動作します。パスワード・写真・会話は保存しません。",
    how3T: "3. どの許可を有効にするかはあなたが決めます",
    how3S: (g, d) => `有効な許可が${g}件、リンク済みデバイスが${d}台あります。`,
    seePermissions: "許可を見る →",
    seeDevices: "デバイスを見る →",
    catTitle: "どんな罠を止めましたか？",
    catKicker: "警告の理由",
    catSub: "今週見られた不審なシグナルの、わかりやすい要約です。",
    catSeeAlerts: (n) => `警告を見る（${n}件）→`,
    feedTitle: "最近のアクティビティ",
    feedEmpty: "まだ表示するものがありません。",
    tipsTitle: "罠にかからないための早見表",
    tipsKicker: "このトリックを覚えて",
  },
  devices: {
    kickerConnected: (n) => `${n}台のデバイスがアカウントに接続されています`,
    kickerNone: "まだリンクされたデバイスはありません",
    title: "マイデバイス",
    sub: "サインインしたブラウザ・スマホ・パソコンがここに表示されます。使わなくなったものはワンクリックで切断できます。",
    connectButton: "+ このブラウザを接続",
    noneChip: "まだリンクされた機器はありません",
    noneTitle: "このブラウザを接続して開始",
    noneSub: "技術的な名前や手動設定は不要です。機器やブラウザでSOVIRを開いてアカウントに入れば、自動でリンクされます。",
    noneButton: "このブラウザを今すぐ接続",
    cardActive: "アカウントに接続済みで、詐欺の警告準備ができています。",
    cardRevoked: "切断済み — アカウントへの情報送信を停止しました。",
    disconnect: "切断",
    disconnectAsk: "この機器はもう使いませんか？",
    lastSeen: "最終アクティビティ",
    lastSeenNever: "まだシグナルなし",
    chipOn: "接続中", chipOff: "切断済み",
  },
  common: { lastAlertAgo: "最後の警告：{x}", today: "今日", week: "今週" },
};

const zh: Strings = {
  nav: {
    home: "首页", incidents: "事件", investigations: "调查",
    devices: "设备", permissions: "权限", audit: "审计",
    signOut: "退出", language: "语言", simpleView: "简洁视图",
    techView: "技术模式",
    summary: "概览", alerts: "安全提醒",
    myDevices: "我的设备", privacy: "隐私与权限",
  },
  signin: {
    title: "您的个人防护",
    sub: "SOVIR帮助您在做出仓促决定之前识别诈骗、欺诈性扣费和施压信息。一切都在您自己的设备上运行。",
    inputLabel: "输入您的名字以打开您的空间",
    placeholder: "例如 Ana",
    button: "进入我的面板",
    oidcButton: "使用我的账户登录",
    oidcHint: "首次使用？您将在下一步创建带密码的账户。",
    devMode: "开发环境",
    note: "每个名字都有自己私密的提醒、设备和权限空间。本地演示环境（httpOnly隔离会话，无密码，不向第三方发送数据）。",
    errors: {
      backend: "SOVIR本地服务未在127.0.0.1:8787上运行。",
      session: "您的会话已结束——请重新输入名字进入。",
      name: "请只使用字母、数字、点或连字符。",
      oidcDenied: "您在身份提供方取消了登录。",
      oidcState: "登录尝试已过期——请重试。",
      oidcExchange: "我们无法使用您的账户完成登录。",
      oidcToken: "提供方未返回有效凭证。",
    },
  },
  overview: {
    kicker: "您的防护已开启 · 所有分析都在您自己的设备上完成",
    greeting: "您好，{x}",
    sub: "SOVIR是您防范数字诈骗的助手：当页面或消息催促您付款或交出个人数据时，它会提醒您。",
    budgetChip: "支出：${a} / ${b}",
    testButton: "运行诈骗演练",
    heroWarnTitle: (n) => `本周我们就${n}次可疑尝试向您发出了提醒`,
    heroWarnSub: "我们检测到了施压手法或可疑的付款要求。下方显示您的每日活动。",
    heroQuietTitle: "本周一切平静",
    heroQuietSub: (n) =>
      `我们检查了${n}次活动，未发现诈骗企图或欺诈性扣费。`,
    heroEmptyTitle: "SOVIR已准备好保护您",
    heroEmptySub: "目前还没有提醒记录。想在真实情况发生前了解它的工作方式，请点击上方的“运行诈骗演练”。",
    chipWarnings: "本周发出的提醒",
    chipClean: "未检测到威胁",
    chipNone: "暂无活动",
    howTitle: "SOVIR如何保护您？",
    howKicker: "用简单的话说",
    how1T: "1. 当场识破陷阱",
    how1S: "识别网站使用虚假紧迫感、隐藏收费或冒充他人的情况。",
    how2T: "2. 绝不窥探您的私生活",
    how2S: "一切都在您的设备内运行。我们不保存您的密码、照片或对话。",
    how3T: "3. 由您决定开启哪些权限",
    how3S: (g, d) => `您有${g}项活动权限和${d}台已关联设备。`,
    seePermissions: "查看我的权限 →",
    seeDevices: "查看我的设备 →",
    catTitle: "我们拦截了哪些类型的陷阱？",
    catKicker: "提醒原因",
    catSub: "用清晰语言总结本周看到的可疑信号。",
    catSeeAlerts: (n) => `查看提醒（${n}条）→`,
    feedTitle: "您的最近活动",
    feedEmpty: "暂时还没有可显示的活动。",
    tipsTitle: "防骗快速指南",
    tipsKicker: "学会这些手法",
  },
  devices: {
    kickerConnected: (n) => `${n}台设备已连接到您的账户`,
    kickerNone: "尚未关联任何设备",
    title: "我的设备",
    sub: "当您在某台浏览器、手机或电脑上登录时，它会出现在这里。如果不再使用某台设备，一键即可断开。",
    connectButton: "+ 连接此浏览器",
    noneChip: "尚未关联任何设备",
    noneTitle: "连接此浏览器即可开始",
    noneSub: "无需填写技术名称或手动配置：在设备或浏览器上打开SOVIR并登录账户，即可自动关联。",
    noneButton: "立即连接此浏览器",
    cardActive: "已连接到您的账户，随时为您提醒诈骗。",
    cardRevoked: "已断开——不再向您的账户发送信息。",
    disconnect: "断开",
    disconnectAsk: "不再使用这台设备了吗？",
    lastSeen: "最近活动",
    lastSeenNever: "暂无信号",
    chipOn: "已连接", chipOff: "已断开",
  },
  common: { lastAlertAgo: "最近一次提醒：{x}", today: "今天", week: "本周" },
};

export const STRINGS: Record<Locale, Strings> = { es, en, pt, fr, it, de, ja, zh };

export function stringsFor(locale: Locale): Strings {
  return STRINGS[locale] ?? STRINGS[DEFAULT_LOCALE];
}

// Tiny interpolation: replaces {x} with text, {a}/{b} with money pieces.
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-z])\}/g, (_, k) => String(vars[k] ?? ""));
}
