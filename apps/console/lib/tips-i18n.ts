import type { Locale } from "./i18n";

// Anti-scam education tips shown on the simple-view home panel. Kept in a
// dedicated module so lib/i18n.ts stays a flat string dictionary.
export interface Tip {
  q: string;
  a: string;
}

export const TIPS: Record<Locale, readonly Tip[]> = {
  es: [
    {
      q: "1. Si algo te exige actuar “YA MISMO”",
      a: "Cuenta bloqueada, supuesto premio, multa o paquete retenido: la prisa artificial es el truco favorito del estafador para que no pienses. Detente y verifica por otro medio.",
    },
    {
      q: "2. Primero te asustan, luego te piden pagar",
      a: "Casi todas las estafas siguen el mismo orden: primero crean miedo o urgencia y enseguida te piden una transferencia o tarjeta. SOVIR detecta esa secuencia automáticamente.",
    },
    {
      q: "3. Nombres parecidos a tu banco o empresa",
      a: "Los impostores copian logotipos y usan direcciones casi idénticas a las oficiales. Si alguien te pide claves o códigos por mensaje, desconfía siempre.",
    },
    {
      q: "4. Botones diseñados para confundirte",
      a: "Páginas donde el botón de “Aceptar cobro” brilla y el de “Rechazar” está escondido, o casillas ya marcadas sin tu permiso. SOVIR te avisa cuando detecta estas trampas.",
    },
  ],
  en: [
    {
      q: "1. If something demands you act “RIGHT NOW”",
      a: "Locked account, supposed prize, fine or held package: artificial haste is the scammer's favorite trick to stop you thinking. Pause and verify through another channel.",
    },
    {
      q: "2. They scare you first, then ask you to pay",
      a: "Almost every scam follows the same order: first they create fear or urgency, then they ask for a transfer or card. SOVIR detects that sequence automatically.",
    },
    {
      q: "3. Names that look almost like your bank or company",
      a: "Impostors copy logos and use addresses nearly identical to official ones. If someone asks for passwords or codes by message, always be suspicious.",
    },
    {
      q: "4. Buttons designed to confuse you",
      a: "Pages where the “Accept charge” button shines while “Decline” is hidden, or boxes pre-checked without your permission. SOVIR warns you when it detects these traps.",
    },
  ],
  pt: [
    {
      q: "1. Se algo exige que aja “JÁ”",
      a: "Conta bloqueada, suposto prémio, multa ou encomenda retida: a pressa artificial é o truque favorito do burlão para que não pense. Pare e verifique por outro meio.",
    },
    {
      q: "2. Primeiro assustam-no, depois pedem pagamento",
      a: "Quase todos os golpes seguem a mesma ordem: primeiro criam medo ou urgência e logo pedem uma transferência ou cartão. O SOVIR deteta essa sequência automaticamente.",
    },
    {
      q: "3. Nomes parecidos com o seu banco ou empresa",
      a: "Os impostores copiam logótipos e usam endereços quase idênticos aos oficiais. Se alguém lhe pede chaves ou códigos por mensagem, desconfie sempre.",
    },
    {
      q: "4. Botões desenhados para o confundir",
      a: "Páginas onde o botão “Aceitar cobrança” brilha e o de “Recusar” está escondido, ou caixas já marcadas sem a sua permissão. O SOVIR avisa quando deteta estas armadilhas.",
    },
  ],
  fr: [
    {
      q: "1. Si quelque chose exige d'agir « TOUT DE SUITE »",
      a: "Compte bloqué, prétendu gain, amende ou colis retenu : l'urgence artificielle est le tour préféré de l'escroc pour vous empêcher de réfléchir. Arrêtez-vous et vérifiez par un autre canal.",
    },
    {
      q: "2. On vous effraie d'abord, puis on vous demande de payer",
      a: "Presque toutes les arnaques suivent le même ordre : on crée d'abord la peur ou l'urgence, puis on réclame un virement ou une carte. SOVIR détecte cette séquence automatiquement.",
    },
    {
      q: "3. Des noms ressemblant à votre banque ou entreprise",
      a: "Les imposteurs copient les logos et utilisent des adresses quasi identiques aux officielles. Si quelqu'un demande vos codes par message, méfiez-vous toujours.",
    },
    {
      q: "4. Des boutons conçus pour vous tromper",
      a: "Des pages où le bouton « Accepter le débit » brille tandis que « Refuser » se cache, ou des cases pré-cochées sans votre accord. SOVIR vous alerte quand il repère ces pièges.",
    },
  ],
  it: [
    {
      q: "1. Se qualcosa ti chiede di agire “SUBITO”",
      a: "Conto bloccato, presunto premio, multa o pacco in giacenza: la fretta artificiale è il trucco preferito del truffatore per non farti pensare. Fermati e verifica per un'altra via.",
    },
    {
      q: "2. Prima ti spaventano, poi ti chiedono di pagare",
      a: "Quasi tutte le truffe seguono lo stesso ordine: prima creano paura o urgenza e subito dopo chiedono un bonifico o una carta. SOVIR rileva automaticamente questa sequenza.",
    },
    {
      q: "3. Nomi quasi identici alla tua banca o azienda",
      a: "Gli impostori copiano loghi e usano indirizzi quasi uguali a quelli ufficiali. Se qualcuno ti chiede chiavi o codici via messaggio, diffida sempre.",
    },
    {
      q: "4. Pulsanti pensati per confonderti",
      a: "Pagine dove il pulsante “Accetta addebito” risalta mentre “Rifiuta” è nascosto, o caselle già spuntate senza il tuo permesso. SOVIR ti avvisa quando individua queste trappole.",
    },
  ],
  de: [
    {
      q: "1. Wenn etwas verlangt, „SOFORT“ zu handeln",
      a: "Gesperrtes Konto, angeblicher Gewinn, Strafe oder zurückgehaltenes Paket: Künstliche Hektik ist der Lieblingstrick des Betrügers, damit du nicht nachdenkst. Halte inne und prüfe über einen anderen Weg.",
    },
    {
      q: "2. Erst machen sie dir Angst, dann verlangen sie Zahlung",
      a: "Fast jeder Betrug folgt derselben Reihenfolge: erst erzeugen sie Angst oder Dringlichkeit, dann fordern sie eine Überweisung oder Karte. SOVIR erkennt diese Abfolge automatisch.",
    },
    {
      q: "3. Namen, die deiner Bank oder Firma fast gleichen",
      a: "Betrüger kopieren Logos und nutzen Adressen, die den offiziellen fast identisch sind. Wenn jemand per Nachricht nach Codes oder Schlüsseln fragt, sei immer misstrauisch.",
    },
    {
      q: "4. Buttons, die dich verwirren sollen",
      a: "Seiten, auf denen der „Zahlung akzeptieren“-Button leuchtet und „Ablehnen“ versteckt ist, oder voreingestellte Häkchen ohne deine Zustimmung. SOVIR warnt dich, wenn es solche Fallen erkennt.",
    },
  ],
  ja: [
    {
      q: "1. 「今すぐ」行動を迫られたら",
      a: "アカウント凍結、当選の知らせ、罰金、荷物の保留——人工的な急かしは、考える暇を与えない詐欺師の得意技です。立ち止まって別の方法で確認しましょう。",
    },
    {
      q: "2. まず怖がらせて、次に支払いを求める",
      a: "ほとんどの詐欺は同じ順序です。まず恐怖や緊急性を作り、すぐ送金やカードを求めます。SOVIRはその連鎖を自動的に検出します。",
    },
    {
      q: "3. 銀行や会社にそっくりな名前",
      a: "詐欺師はロゴを真似し、公式とほぼ同じアドレスを使います。メッセージで暗証番号やコードを求められたら、必ず疑ってください。",
    },
    {
      q: "4. 混乱させるためのボタン",
      a: "「支払いを承諾」ボタンは目立つのに「拒否」が隠れているページや、許可なくチェック済みのボックス。SOVIRはこうした罠を検出すると警告します。",
    },
  ],
  zh: [
    {
      q: "1. 如果某事要求您“立刻”行动",
      a: "账户被锁、所谓的奖品、罚单或包裹被扣——人为制造的紧迫感是骗子让您来不及思考的惯用伎俩。请停下来，通过其他渠道核实。",
    },
    {
      q: "2. 先吓唬您，再要求付款",
      a: "几乎所有诈骗都遵循同样的顺序：先制造恐惧或紧迫感，然后立刻要求转账或银行卡。SOVIR会自动识别这一连串手法。",
    },
    {
      q: "3. 与您的银行或公司几乎相同的名字",
      a: "冒充者会复制标识，并使用与官方几乎相同的地址。如果有人通过消息索要密码或验证码，请始终保持警惕。",
    },
    {
      q: "4. 故意让您混淆的按钮",
      a: "“接受扣费”按钮非常醒目而“拒绝”却藏起来的页面，或未经您允许就已勾选的选项框。SOVIR检测到这些陷阱时会提醒您。",
    },
  ],
};
