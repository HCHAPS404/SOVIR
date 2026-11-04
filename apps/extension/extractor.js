// SOVIR signal extractor — PURE function, no DOM side effects, no chrome
// APIs. Loaded before content.js (shared content-script global scope) and
// imported by the jsdom test suite. Maps a document+location to the typed
// signal enum set — the ADR-0014 observer invariant.
//
// Detection is data-driven: `TERMS` is the trainable surface. Each signal
// holds per-language term lists; Latin-script languages are matched with
// word boundaries, CJK (ja/zh) with substring alternation (\b is a no-op
// on scripts without spaces). Adding a pattern or a language means adding
// terms — never touching the scan loop.

(function attach(global) {
  const TERMS = {
    URGENT_ACTION: {
      es: ["urgente", "suspendida", "suspendido", "bloqueada", "bloqueado", "verifica", "verificar", "expira", "vence", "vencimiento", "caduca", "actúa ahora", "último aviso", "de inmediato", "última oportunidad", "cuenta limitada", "acción requerida", "solo hoy", "sólo hoy", "tiempo limitado"],
      en: ["urgent", "suspended", "locked", "verify now", "expires", "expired", "act now", "immediately", "last warning", "final notice", "verify your account", "account limited"],
      pt: ["urgente", "suspensa", "suspenso", "bloqueada", "bloqueado", "verifique", "expira", "expirado", "aja agora", "último aviso", "imediatamente", "conta limitada"],
      fr: ["urgent", "urgente", "suspendu", "suspendue", "bloqué", "bloquée", "vérifiez", "vérifie", "expire", "expiré", "agissez", "dernier avertissement", "dernier avis", "immédiatement", "compte limité"],
      it: ["urgente", "sospeso", "sospesa", "bloccato", "bloccata", "verifica", "scade", "scaduto", "agisci", "ultimo avviso", "immediatamente", "conto limitato"],
      de: ["dringend", "gesperrt", "verifizieren", "verifiziere", "läuft ab", "abgelaufen", "sofort", "letzte warnung", "letzte mahnung", "handeln sie jetzt", "konto eingeschränkt"],
      ja: ["緊急", "今すぐ", "直ちに", "最終警告", "確認してください", "期限切れ", "アカウント停止", "凍結されました", "至急", "保留中"],
      zh: ["紧急", "立即", "马上", "最后警告", "请验证", "需要验证", "已暂停", "已冻结", "已过期", "尽快", "限期", "账户受限"],
    },
    EXTORTION_LANGUAGE: {
      es: ["publicaremos", "publicarán", "filtraremos", "tenemos tus videos", "tenemos tu video", "tenemos tus fotos", "tenemos sus datos", "tenemos tu información", "paga o", "pagar o", "o publicamos", "o filtramos", "difundiremos", "divulgaremos", "compartiremos tus", "serán publicados", "será publicado", "paga o lo publicamos", "difundimos tus fotos", "si no pagas"],
      en: ["we will publish", "we'll publish", "we will leak", "we'll leak", "we will release", "pay or we", "pay or your", "your videos will be published", "your photos will be leaked", "your data will be released", "send bitcoin", "bitcoin wallet", "or we publish", "or we leak", "we have your video", "we have your files", "if you don't pay"],
      pt: ["publicaremos", "vazaremos", "vamos publicar", "vamos vazar", "temos seus vídeos", "temos seu vídeo", "temos suas fotos", "temos seus dados", "pague ou", "ou publicamos", "ou vazamos", "divulgaremos", "serão publicados", "carteira bitcoin", "se não pagar"],
      fr: ["nous publierons", "nous divulguerons", "nous diffuserons", "nous avons vos vidéos", "nous avons ta vidéo", "payez ou", "paye ou", "ou nous publions", "vos vidéos seront publiées", "vos données seront divulguées", "portefeuille bitcoin", "envoyez des bitcoins", "si vous ne payez pas"],
      it: ["pubblicheremo", "diffonderemo", "divulgheremo", "abbiamo i tuoi video", "abbiamo il tuo video", "paga o", "o pubblichiamo", "i tuoi video saranno pubblicati", "i tuoi dati saranno diffusi", "portafoglio bitcoin", "se non paghi"],
      de: ["wir werden veröffentlichen", "wir veröffentlichen", "wir leaken", "wir haben deine videos", "wir haben ihre videos", "zahl oder", "zahlen sie oder", "oder wir veröffentlichen", "deine videos werden veröffentlicht", "ihre daten werden veröffentlicht", "bitcoin-wallet", "sende bitcoin", "wenn sie nicht zahlen"],
      ja: ["公開します", "流出させます", "ばら撒きます", "支払わなければ", "払わなければ", "あなたの動画を", "ビットコインウォレット", "ビットコインを送れ", "拡散させます", "あなたの写真を", "あなたのデータを公開"],
      zh: ["我们将公布", "否则公开", "付款否则", "不付款就公开", "比特币钱包", "发送比特币", "您的视频将被公开", "我们会泄露", "将发布您的"],
    },
    SCAREWARE_CLAIM: {
      es: ["virus detectado", "virus encontrado", "dispositivo infectado", "equipo infectado", "ordenador infectado", "amenazas detectadas", "amenaza detectada", "sistema infectado", "llame ahora", "llame inmediatamente", "soporte técnico urgente", "alerta de seguridad", "error crítico", "windows ha detectado", "tu pc está en peligro", "sistema comprometido"],
      en: ["virus detected", "virus found", "device infected", "computer infected", "system infected", "threats detected", "threat detected", "security alert", "call now", "call immediately", "critical alert", "windows has detected", "your pc is at risk", "malware detected", "trojan detected", "spyware detected", "microsoft warning", "apple warning", "system compromised"],
      pt: ["vírus detectado", "vírus encontrado", "dispositivo infectado", "computador infectado", "sistema infectado", "ameaças detectadas", "ameaça detectada", "ligue agora", "alerta de segurança", "suporte técnico urgente", "seu pc está em risco", "sistema comprometido"],
      fr: ["virus détecté", "virus trouvé", "appareil infecté", "ordinateur infecté", "système infecté", "menaces détectées", "menace détectée", "appelez maintenant", "alerte de sécurité", "support technique urgent", "votre pc est en danger", "windows a détecté", "système compromis"],
      it: ["virus rilevato", "virus trovato", "dispositivo infetto", "computer infetto", "sistema infetto", "minacce rilevate", "minaccia rilevata", "chiama ora", "allarme sicurezza", "supporto tecnico urgente", "il tuo pc è a rischio", "windows ha rilevato", "sistema compromesso"],
      de: ["virus erkannt", "virus gefunden", "gerät infiziert", "computer infiziert", "system infiziert", "bedrohungen erkannt", "bedrohung erkannt", "rufen sie jetzt an", "sicherheitswarnung", "technischer support dringend", "ihr pc ist gefährdet", "windows hat erkannt", "schadsoftware erkannt", "system kompromittiert"],
      ja: ["ウイルスが検出されました", "ウイルスを検出", "デバイスが感染", "パソコンが感染", "脅威が検出されました", "セキュリティ警告", "今すぐお電話", "緊急サポート", "マルウェアを検出", "トロイの木馬", "システムが侵害されました"],
      zh: ["检测到病毒", "发现病毒", "设备已被感染", "电脑已感染", "检测到威胁", "安全警告", "立即致电", "紧急技术支持", "检测到恶意软件", "您的电脑处于危险", "系统已被入侵"],
    },
    HIDDEN_FEE_PATTERN: {
      es: ["cargo adicional", "cargos adicionales", "cargo extra", "cuota de servicio", "cuota de gestión", "gastos de gestión", "gastos administrativos", "tarifa de servicio", "comisión adicional", "costes adicionales", "cargos ocultos", "no incluidos en el precio", "tasas adicionales"],
      en: ["service fee", "handling fee", "processing fee", "convenience fee", "resort fee", "booking fee", "administrative fee", "additional charges", "hidden fees", "not included in the price", "surcharge", "mandatory fee", "extra charges"],
      pt: ["taxa adicional", "taxa de serviço", "taxa de administração", "custos adicionais", "cargos extras", "taxas ocultas", "não incluído no preço", "sobretaxa", "taxa de processamento"],
      fr: ["frais de service", "frais supplémentaires", "frais cachés", "frais de gestion", "frais administratifs", "frais de réservation", "non inclus dans le prix", "supplément obligatoire", "frais de traitement"],
      it: ["costo aggiuntivo", "costi aggiuntivi", "spese di servizio", "spese di gestione", "commissione aggiuntiva", "spese nascoste", "non incluso nel prezzo", "supplemento obbligatorio", "spese di elaborazione"],
      de: ["servicegebühr", "bearbeitungsgebühr", "zusätzliche gebühren", "versteckte gebühren", "verwaltungsgebühr", "buchungsgebühr", "nicht im preis enthalten", "zusatzkosten", "pflichtgebühr", "bearbeitungskosten"],
      ja: ["追加料金", "サービス料", "手数料", "隠れ料金", "管理費", "別途費用", "諸費用", "価格に含まれていません"],
      zh: ["额外费用", "服务费", "手续费", "隐藏费用", "管理费", "不包含在价格中", "附加费", "另行收费"],
    },
    PRIZE_LOTTERY_CLAIM: {
      es: ["has ganado", "has sido seleccionado", "felicidades ganaste", "ganador seleccionado", "eres el ganador", "reclama tu premio", "premio mayor", "jackpot", "lotería", "sorteo", "premio garantizado", "usuario afortunado"],
      en: ["you have won", "you've won", "you won", "congratulations you", "selected winner", "claim your prize", "jackpot", "lottery", "sweepstakes", "lucky winner", "guaranteed prize", "winner notification"],
      pt: ["você ganhou", "você foi selecionado", "parabéns você ganhou", "ganhador selecionado", "resgate seu prêmio", "loteria", "sorteio", "jackpot", "grande vencedor"],
      fr: ["vous avez gagné", "vous êtes sélectionné", "félicitations vous avez gagné", "gagnant sélectionné", "réclamez votre prix", "jackpot", "loterie", "tirage au sort", "grand gagnant", "heureux gagnant"],
      it: ["hai vinto", "sei stato selezionato", "congratulazioni hai vinto", "vincitore selezionato", "ritira il tuo premio", "jackpot", "lotteria", "estrazione", "fortunato vincitore", "premio garantito"],
      de: ["sie haben gewonnen", "sie wurden ausgewählt", "herzlichen glückwunsch", "ausgewählter gewinner", "fordern sie ihren preis an", "jackpot", "lotterie", "gewinnspiel", "hauptgewinn", "glücklicher gewinner"],
      ja: ["当選しました", "当選おめでとう", "おめでとうございます", "賞金", "宝くじ", "当たり", "抽選で選ばれました", "ジャックポット", "幸運な当選者", "プレゼントを受け取る"],
      zh: ["恭喜中奖", "您中奖了", "中奖", "恭喜您获得", "奖品", "彩票", "抽奖", "领取您的奖品", "头奖", "幸运儿"],
    },
    INVESTMENT_PROMISE: {
      es: ["rendimiento garantizado", "ganancias garantizadas", "duplica tu dinero", "duplicar tu dinero", "multiplica tu dinero", "ingresos pasivos", "inversión sin riesgo", "retorno garantizado", "rentabilidad asegurada", "beneficio diario garantizado", "ganancia diaria", "hazte rico"],
      en: ["guaranteed returns", "guaranteed profit", "guaranteed income", "double your money", "triple your money", "passive income", "risk-free investment", "guaranteed return", "daily profit", "daily returns", "get rich quick", "financial freedom", "earn up to"],
      pt: ["retorno garantido", "lucro garantido", "renda garantida", "dobre seu dinheiro", "renda passiva", "investimento sem risco", "lucro diário garantido", "dinheiro fácil", "ganhe até"],
      fr: ["rendement garanti", "profit garanti", "revenu garanti", "doublez votre argent", "revenu passif", "investissement sans risque", "profit quotidien garanti", "argent facile", "gagnez jusqu'à", "enrichissez-vous"],
      it: ["rendimento garantito", "profitto garantito", "reddito garantito", "raddoppia i tuoi soldi", "reddito passivo", "investimento senza rischio", "profitto giornaliero garantito", "soldi facili", "guadagna fino a"],
      de: ["garantierte rendite", "garantierter gewinn", "garantiertes einkommen", "verdoppeln sie ihr geld", "passives einkommen", "risikofreie investition", "täglicher gewinn garantiert", "schnelles geld", "verdienen sie bis zu"],
      ja: ["保証された利益", "利益保証", "確実な利益", "お金を倍増", "不労所得", "リスクなしの投資", "元本保証", "毎日の利益", "損なし"],
      zh: ["保证收益", "保证回报", "保本收益", "让您的钱翻倍", "被动收入", "无风险投资", "每天保证利润", "轻松赚钱", "稳赚不赔", "高额回报"],
    },
    GIFT_CARD_PAYMENT: {
      es: ["tarjeta de regalo", "tarjetas de regalo", "tarjeta itunes", "tarjeta google play", "tarjeta steam", "tarjeta amazon", "paga con tarjetas", "pago con tarjeta de regalo", "vale regalo", "tarjeta prepago"],
      en: ["gift card", "gift cards", "itunes card", "google play card", "steam card", "amazon card", "pay with gift cards", "gift card payment", "prepaid card", "payment via gift card"],
      pt: ["cartão presente", "cartões presente", "cartão itunes", "cartão google play", "pague com cartão presente", "vale presente", "cartão pré-pago"],
      fr: ["carte cadeau", "cartes cadeaux", "carte itunes", "carte google play", "carte steam", "payez avec des cartes cadeaux", "carte prépayée", "paiement par carte cadeau"],
      it: ["carta regalo", "carte regalo", "carta itunes", "carta google play", "paga con carta regalo", "carta prepagata", "pagamento con carta regalo"],
      de: ["geschenkkarte", "geschenkkarten", "itunes-karte", "google-play-karte", "steam-karte", "bezahlen sie mit geschenkkarten", "aufladekarte", "prepaid-karte", "zahlung per geschenkkarte"],
      ja: ["ギフトカード", "プリペイドカード", "ギフト券", "ギフトカードで支払", "バニラカード", "itunesカード", "google playカード"],
      zh: ["礼品卡", "充值卡", "预付卡", "苹果礼品卡", "用礼品卡支付", "点卡"],
    },
    SEED_PHRASE_REQUEST: {
      es: ["frase semilla", "frase de recuperación", "frase secreta", "12 palabras", "24 palabras", "palabras de recuperación", "palabras secretas", "clave privada", "frase mnemotécnica", "frase de respaldo"],
      en: ["seed phrase", "recovery phrase", "secret phrase", "12 words", "24 words", "recovery words", "secret words", "private key", "mnemonic phrase", "backup phrase"],
      pt: ["frase semente", "frase de recuperação", "palavras de recuperação", "palavras secretas", "chave privada", "frase mnemônica", "frase de backup"],
      fr: ["phrase de récupération", "phrase secrète", "phrase mnémonique", "mots de récupération", "mots secrets", "clé privée", "phrase de sauvegarde", "12 mots", "24 mots"],
      it: ["frase di recupero", "frase segreta", "frase seed", "parole di recupero", "parole segrete", "chiave privata", "frase mnemonica", "12 parole", "24 parole"],
      de: ["seed-phrase", "wiederherstellungsphrase", "geheime phrase", "wiederherstellungswörter", "geheime wörter", "privater schlüssel", "mnemonische phrase", "sicherheitsphrase", "12 wörter", "24 wörter"],
      ja: ["シードフレーズ", "復元フレーズ", "回復フレーズ", "秘密鍵", "ニーモニックフレーズ", "バックアップフレーズ", "リカバリーワード"],
      zh: ["助记词", "恢复短语", "秘密短语", "私钥", "种子短语", "备份短语", "密钥短语"],
    },
    DELIVERY_CUSTOMS_FEE: {
      es: ["paquete retenido", "paquete en aduana", "paquete pendiente", "cargo de aduana", "cargo aduanero", "tarifa de aduana", "tarifa de entrega", "envío retenido", "envío bloqueado", "gastos de aduana", "entrega pendiente de pago", "pago de aduana requerido"],
      en: ["package held", "package pending", "parcel held", "parcel pending", "customs fee", "customs charge", "customs duty", "delivery fee required", "shipment held", "shipment blocked", "import fees", "delivery pending payment", "shipping fee required"],
      pt: ["pacote retido", "pacote pendente", "encomenda retida", "encomenda pendente", "taxa de alfândega", "taxa aduaneira", "taxa de entrega", "envio retido", "despacho aduaneiro pendente", "pagamento de alfândega"],
      fr: ["colis retenu", "colis en attente", "colis bloqué", "frais de douane", "droits de douane", "frais de livraison requis", "livraison en attente", "expédition bloquée", "redevance douanière", "paiement des douanes"],
      it: ["pacco trattenuto", "pacco in dogana", "pacco in attesa", "spese doganali", "tassa doganale", "spese di consegna richieste", "consegna in sospeso", "spedizione bloccata", "oneri doganali", "pagamento della dogana"],
      de: ["paket zurückgehalten", "paket hängt fest", "paket im zoll", "zollgebühr", "zollkosten", "zollabgabe", "liefergebühr erforderlich", "lieferung ausstehend", "versand blockiert", "einfuhrgebühren", "zollzahlung erforderlich"],
      ja: ["荷物が保留", "小包が保留", "税関手数料", "関税", "配送料が必要", "配達が保留", "輸入手数料", "通関手数料", "荷物が止まっています"],
      zh: ["包裹被扣留", "包裹待处理", "海关费用", "关税", "需要支付运费", "快递扣留", "进口费用", "清关费用", "包裹等待支付"],
    },
    AUTHORITY_IMPERSONATION: {
      es: ["hacienda", "agencia tributaria", "policía nacional", "guardia civil", "fiscalía", "multa oficial", "multa pendiente", "sanción administrativa", "seguridad social", "ministerio del interior", "notificación oficial", "deuda tributaria", "orden de arresto"],
      en: ["irs notice", "irs refund", "hmrc", "police fine", "arrest warrant", "tax refund", "tax debt", "government fine", "official notice", "social security administration", "federal police", "court order", "warrant issued", "tax authority", "fbi notice"],
      pt: ["receita federal", "polícia federal", "polícia civil", "multa oficial", "multa pendente", "finanças", "tribunal", "notificação oficial", "dívida tributária", "ministério público", "mandado de prisão"],
      fr: ["police nationale", "police judiciaire", "gendarmerie", "amende officielle", "amende impayée", "trésor public", "ministère de l'intérieur", "impôts", "avis officiel", "tribunal", "mandat d'arrêt", "amende forfaitaire", "dgfip"],
      it: ["polizia di stato", "polizia postale", "agenzia delle entrate", "multa ufficiale", "multa non pagata", "guardia di finanza", "carabinieri", "avviso ufficiale", "tribunale", "mandato d'arresto"],
      de: ["bundespolizei", "finanzamt", "offizielle strafe", "steuerrückzahlung", "steuerbehörde", "staatsanwaltschaft", "zollbehörde", "offizielle benachrichtigung", "gericht", "haftbefehl", "bundeskriminalamt", "polizei warnt"],
      ja: ["国税庁", "警察庁", "警視庁", "罰金", "税務署", "裁判所", "検察庁", "逮捕状", "公式通知", "未納税"],
      zh: ["税务局", "公安局", "检察院", "法院", "罚款", "官方通知", "通缉令", "未缴税款", "税务机关", "行政处罚"],
    },
    SCARCITY_PRESSURE: {
      es: ["solo quedan", "solo queda", "últimas unidades", "última unidad", "quedan pocos", "stock limitado", "agotándose", "solo por hoy", "oferta por tiempo limitado", "se agota", "apúrate quedan", "quedan muy pocos"],
      en: ["only a few left", "limited stock", "selling out fast", "almost gone", "last chance", "while supplies last", "limited time offer", "hurry only", "ends tonight", "almost sold out", "few units left"],
      pt: ["restam apenas", "últimas unidades", "estoque limitado", "acabando rápido", "última chance", "oferta por tempo limitado", "só hoje", "quase esgotado", "restam poucos"],
      fr: ["il ne reste que", "stock limité", "dernières unités", "dernière chance", "offre à durée limitée", "aujourd'hui seulement", "presque épuisé", "plus que quelques", "dépêchez-vous"],
      it: ["ne rimangono solo", "ultimi pezzi", "scorte limitate", "ultima occasione", "offerta a tempo limitato", "solo oggi", "quasi esaurito", "affrettati", "pochi rimasti"],
      de: ["nur noch wenige", "begrenzter vorrat", "letzte chance", "angebot nur für kurze zeit", "nur heute", "fast ausverkauft", "letztes stück", "begrenzte stückzahl", "beeilen sie sich"],
      ja: ["残りわずか", "残りあと", "在庫限り", "本日限り", "期間限定", "今だけ", "売り切れ間近", "ラストチャンス", "数量限定"],
      zh: ["仅剩", "只剩", "库存有限", "限时优惠", "仅限今天", "即将售罄", "最后机会", "数量有限", "倒计时"],
    },
    JOB_SCAM_OFFER: {
      es: ["trabaja desde casa", "trabajo desde casa", "gana dinero desde casa", "sin experiencia necesaria", "ingresos desde casa", "reclutamos sin experiencia", "empleo inmediato", "trabajo fácil dinero", "sé tu propio jefe", "gana hasta"],
      en: ["work from home", "earn money from home", "no experience needed", "no experience required", "weekly payout", "easy money job", "immediate start", "get paid to", "make money online", "be your own boss", "earn up to"],
      pt: ["trabalhe de casa", "trabalho em casa", "ganhe dinheiro em casa", "sem experiência", "renda extra", "ganhe até", "trabalho fácil", "dinheiro rápido", "seja seu próprio chefe"],
      fr: ["travail à domicile", "travaillez de chez vous", "gagnez de l'argent depuis chez vous", "sans expérience", "revenu complémentaire", "gagnez jusqu'à", "argent facile", "emploi immédiat", "soyez votre propre patron"],
      it: ["lavoro da casa", "lavora da casa", "guadagna da casa", "senza esperienza", "reddito extra", "guadagna fino a", "soldi facili", "lavoro immediato", "sii il tuo capo"],
      de: ["arbeiten von zu hause", "heimarbeit", "geld verdienen von zu hause", "ohne erfahrung", "nebenverdienst", "verdienen sie bis zu", "leichtes geld", "sofortiger arbeitsbeginn", "sei dein eigener chef"],
      ja: ["在宅ワーク", "在宅勤務", "家で稼げる", "未経験ok", "副業", "高収入", "簡単な仕事", "即日払い", "自宅で稼ぐ"],
      zh: ["居家办公", "在家工作", "无需经验", "兼职", "高薪日结", "轻松赚钱", "立即入职", "网上赚钱", "日入过千"],
    },
    OFF_PLATFORM_MOVE: {
      // Case 14 precision: bare "por whatsapp"/"per telegram" matched any
      // classified that merely names a channel. Require contact intent —
      // imperative invites and hidden-contact phrasing stay.
      es: ["escríbeme por whatsapp", "escribeme por whatsapp", "contáctame por whatsapp", "contactame por whatsapp", "hablamos por whatsapp", "me escribes por whatsapp", "mensaje directo", "información oculta", "hidden information", "contacto oculto", "escríbeme al", "mi número es"],
      en: ["message me on whatsapp", "whatsapp me", "text me at", "dm me", "contact me on telegram", "message me on telegram", "chat on whatsapp", "hidden information", "reach me at", "my number is", "hit me up on"],
      pt: ["me chama no whatsapp", "fale comigo pelo whatsapp", "contato pelo whatsapp", "me chama no telegram", "informação oculta", "meu número é", "me manda mensagem no whatsapp"],
      fr: ["écris-moi sur whatsapp", "contacte-moi sur whatsapp", "on discute sur whatsapp", "envoie-moi un message sur telegram", "message privé", "informations cachées", "mon numéro est"],
      it: ["scrivimi su whatsapp", "contattami su whatsapp", "parliamo su whatsapp", "scrivimi su telegram", "messaggio diretto", "informazioni nascoste", "il mio numero è"],
      de: ["schreib mir auf whatsapp", "kontaktiere mich über whatsapp", "schreib mir bei telegram", "direktnachricht", "versteckte informationen", "meine nummer ist"],
      ja: ["whatsappで連絡", "ラインで連絡", "lineで連絡", "テレグラムで連絡", "直接連絡", "非公開情報", "連絡先は"],
      zh: ["通过whatsapp联系", "微信联系", "加微信", "通过telegram联系", "私信我", "隐藏信息", "我的号码是"],
    },
    BULK_BUYER_LURE: {
      es: ["te compramos", "compramos toda clase", "compro toda clase", "compra inmediata", "pago de contado", "compramos todo tipo", "compro lo que sea", "compramos motos", "compramos carros"],
      en: ["we buy all kinds", "we buy any", "immediate purchase", "cash payment", "instant cash for", "buying all types", "we buy cars", "we buy houses", "cash offer"],
      pt: ["compramos todo tipo", "compramos qualquer", "compra imediata", "pagamento à vista", "compramos carros", "compramos motos", "dinheiro na hora"],
      fr: ["nous achetons tout type", "nous achetons toutes sortes", "achat immédiat", "paiement comptant", "paiement cash", "nous achetons des voitures", "achat comptant"],
      it: ["compriamo qualsiasi", "compriamo ogni tipo", "acquisto immediato", "pagamento in contanti", "pagamento immediato", "compriamo auto", "compriamo moto"],
      de: ["wir kaufen alle arten", "wir kaufen jede art", "sofortkauf", "barzahlung", "sofortige zahlung", "wir kaufen autos", "wir kaufen motorräder", "ankauf sofort"],
      ja: ["何でも買い取り", "即金買取", "即日買取", "現金買取", "高価買取", "車を買い取り", "バイクを買い取り"],
      zh: ["现金收购", "立即购买", "现款支付", "高价收购", "我们收购各种", "回收各种", "即时付款"],
    },
    MIRACLE_CURE_CLAIM: {
      es: ["cura milagrosa", "remedio milagroso", "cura el cáncer", "cura la diabetes", "elimina toxinas", "desintoxica tu cuerpo", "pierde peso sin esfuerzo", "baja de peso sin dieta", "secreto que los médicos ocultan", "método revolucionario", "cura definitiva"],
      en: ["miracle cure", "miracle remedy", "cures cancer", "cures diabetes", "eliminates toxins", "detox your body", "lose weight without effort", "secret doctors don't want", "revolutionary method", "one weird trick", "doctors hate this"],
      pt: ["cura milagrosa", "remédio milagroso", "cura o câncer", "elimina toxinas", "desintoxica seu corpo", "perca peso sem esforço", "segredo que os médicos escondem", "método revolucionário"],
      fr: ["remède miracle", "guérit le cancer", "guérit tout", "élimine les toxines", "détoxifie votre corps", "perdez du poids sans effort", "secret que les médecins cachent", "méthode révolutionnaire", "guérison miracle"],
      it: ["cura miracolosa", "rimedio miracoloso", "cura il cancro", "elimina le tossine", "disintossica il tuo corpo", "perdi peso senza sforzo", "segreto che i medici nascondono", "metodo rivoluzionario"],
      de: ["wunderheilung", "wundermittel", "heilt krebs", "heilt alles", "eliminiert gifte", "entgiftet ihren körper", "abnehmen ohne mühe", "geheimnis das ärzte verstecken", "revolutionäre methode", "wunderkur"],
      ja: ["奇跡の治療", "万能薬", "がんを治す", "毒素を排出", "デトックス", "楽して痩せる", "医師が隠す秘密", "革命的な方法", "何でも治す"],
      zh: ["神奇疗法", "万能药", "治愈癌症", "排毒", "轻松减肥", "医生不愿透露的秘密", "革命性方法", "包治百病"],
    },
  };

  // Romance-scam bait needs love AND a money/emergency ask in the SAME
  // text block — either side alone is ordinary copy.
  const ROMANCE_LOVE = {
    es: ["mi amor", "mi querido", "mi querida", "alma gemela", "te amo", "nuestra relación", "conocerte", "enamorado"],
    en: ["my love", "soulmate", "darling", "my dear", "i love you", "our relationship", "meet you", "fall in love"],
    pt: ["meu amor", "alma gêmea", "meu querido", "minha querida", "te amo", "nosso relacionamento", "apaixonado"],
    fr: ["mon amour", "âme sœur", "mon chéri", "ma chérie", "je t'aime", "notre relation", "te rencontrer", "amoureux"],
    it: ["amore mio", "anima gemella", "tesoro", "ti amo", "la nostra relazione", "conoscerti", "innamorato"],
    de: ["meine liebe", "seelenverwandter", "seelenverwandte", "schatz", "ich liebe dich", "unsere beziehung", "dich zu treffen"],
    ja: ["愛している", "運命の人", "私の愛", "あなたに会いたい", "私たちの関係", "恋に落ちる"],
    zh: ["亲爱的", "爱人", "灵魂伴侣", "我爱你", "我们的关系", "想见你"],
  };
  const ROMANCE_MONEY = {
    es: ["dinero", "ayuda económica", "emergencia", "hospital", "visa", "boleto", "billete", "transferencia", "aduana"],
    en: ["money", "financial help", "emergency", "plane ticket", "hospital", "visa", "customs", "wire transfer", "ticket"],
    pt: ["dinheiro", "ajuda financeira", "emergência", "passagem", "hospital", "visto", "alfândega", "transferência"],
    fr: ["argent", "aide financière", "urgence", "billet d'avion", "hôpital", "visa", "douane", "virement"],
    it: ["soldi", "aiuto finanziario", "emergenza", "biglietto aereo", "ospedale", "visto", "dogana", "bonifico"],
    de: ["geld", "finanzielle hilfe", "notfall", "flugticket", "krankenhaus", "visum", "zoll", "überweisung"],
    ja: ["お金", "経済的援助", "緊急", "航空券", "病院", "ビザ", "関税", "送金"],
    zh: ["钱", "经济帮助", "紧急", "机票", "医院", "签证", "海关", "转账"],
  };

  const LATIN = ["es", "en", "pt", "fr", "it", "de"];
  const CJK = ["ja", "zh"];

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function buildRe(terms, langs, wordBound) {
    const pool = [];
    for (const l of langs) {
      for (const t of terms[l] ?? []) pool.push(escapeRe(t));
    }
    if (!pool.length) return null;
    const body = pool.join("|");
    return wordBound ? new RegExp(`\\b(?:${body})\\b`, "i") : new RegExp(`(?:${body})`);
  }

  // One compiled pattern per signal: latin regex + cjk regex.
  const TEXT_PATTERNS = Object.entries(TERMS).map(([signal, langs]) => ({
    signal,
    latin: buildRe(langs, LATIN, true),
    cjk: buildRe(langs, CJK, false),
  }));
  const ROMANCE_LOVE_RE = {
    latin: buildRe(ROMANCE_LOVE, LATIN, true),
    cjk: buildRe(ROMANCE_LOVE, CJK, false),
  };
  const ROMANCE_MONEY_RE = {
    latin: buildRe(ROMANCE_MONEY, LATIN, true),
    cjk: buildRe(ROMANCE_MONEY, CJK, false),
  };

  // High-abuse TLDs (free/disposable domains favored by throwaway phishing).
  const SUSPICIOUS_TLD = new Set([
    "tk", "ml", "ga", "cf", "gq", "buzz", "top", "cam", "rest", "monster",
    "quest", "icu", "lat", "cfd", "cyou", "bond", "sbs", "date", "bid",
    "stream", "download", "review", "country", "loan", "men", "work", "win",
    "racing", "science", "faith", "party", "cricket", "accountant",
  ]);
  const IP_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;
  const DOMAIN_IN_TEXT =
    /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,})(?=[\/\s.,;:!?\)]|$)/i;
  const TRACKER_HOSTS = [
    "google-analytics.com",
    "googletagmanager.com",
    "connect.facebook.net",
    "doubleclick.net",
    "hotjar.com",
  ];
  // PII fields that turn a credential form into over-broad harvesting.
  const PII_FIELD =
    /ssn|social.*(security|seguridad)|dni|nif|nie|cpf|rg|codice.?fiscale|steuer|tax.?id|maiden|birth|nacimiento|nascimento|naissance|geburt|個人番号|マイナンバー|身份证|身份证号/i;
  const SEED_FIELD = /seed|recovery|mnemonic|private.?key|mnem[oó]nica|frase|シード|助记词|私钥|种子/i;
  const COUNTDOWN_SEL =
    "[class*='countdown' i], [id*='countdown' i], [class*='timer' i], [id*='timer' i], [data-countdown]";

  function baseDomain(host) {
    const parts = String(host).toLowerCase().split(".");
    return parts.slice(-2).join(".");
  }
  function hostIsSuspicious(host) {
    const h = String(host).toLowerCase();
    if (!h) return false;
    if (IP_HOST.test(h) || h.includes("xn--")) return true;
    return SUSPICIOUS_TLD.has(h.split(".").pop());
  }
  function isNavTarget(href) {
    return href && !/^(#|javascript:|mailto:|tel:)/i.test(href.trim());
  }
  function testBoth(re, t) {
    return (re.latin && re.latin.test(t)) || (re.cjk && re.cjk.test(t));
  }

  function sovirExtractSignals(doc, loc, collect) {
    const signals = new Set();

    const hasPassword = !!doc.querySelector('input[type="password"]');
    if (hasPassword) signals.add("CREDENTIAL_REQUEST");

    // Credential form whose action posts to a different origin: the page
    // collects secrets for someone else — classic phishing shape.
    for (const form of doc.querySelectorAll("form[action]")) {
      if (!form.querySelector('input[type="password"]')) continue;
      try {
        const actionHost = new URL(form.action, loc.href ?? undefined).host;
        const pageHost = new URL(loc.href).host;
        if (actionHost && pageHost && actionHost !== pageHost) {
          signals.add("IDENTITY_UNVERIFIED");
          break;
        }
      } catch {}
    }

    // Over-broad harvesting: credential field plus national-ID/birth/
    // sensitive PII inputs in the same surface.
    if (hasPassword) {
      for (const f of doc.querySelectorAll("input[name], input[id], input[placeholder]")) {
        const hint = `${f.name ?? ""} ${f.id ?? ""} ${f.getAttribute("placeholder") ?? ""}`;
        if (PII_FIELD.test(hint)) {
          signals.add("DATA_HARVESTING");
          break;
        }
      }
    }

    const paymentFields = doc.querySelectorAll(
      'input[autocomplete^="cc-"], input[name*="card" i], input[id*="card" i], input[name*="cvv" i], input[name*="iban" i]',
    );
    if (paymentFields.length > 0) signals.add("PAYMENT_REQUEST");

    // Seed-phrase ask: dedicated input names/placeholders are direct theft
    // probes even without matching copy around them.
    for (const f of doc.querySelectorAll(
      "input[placeholder], input[name], textarea[placeholder], textarea[name]",
    )) {
      const hint = `${f.name ?? ""} ${f.getAttribute("placeholder") ?? ""}`;
      if (SEED_FIELD.test(hint)) {
        signals.add("SEED_PHRASE_REQUEST");
        break;
      }
    }

    // One bounded pass over prominent copy: every language table is
    // tested against each text block — romance bait needs love AND money.
    const textBlocks = doc.querySelectorAll(
      "h1, h2, h3, p, div, span, li, a, button, .btn, strong, b, .alert, [class*='warn' i]",
    );
    let scanned = 0;
    let loveSeen = false;
    let moneySeen = false;
    for (const el of textBlocks) {
      if (++scanned > 1200) break;
      const t = el.textContent;
      if (!t || t.length > 800) continue;
      let matched = false;
      for (const p of TEXT_PATTERNS) {
        if (signals.has(p.signal)) continue;
        if (testBoth(p, t)) {
          signals.add(p.signal);
          matched = true;
        }
      }
      // text_hint: only blocks that fired a pattern, each ≤200c, total
      // bounded in content.js — the scam-relevant span stays local for
      // the ONNX text voter; it is never persisted nor sent remotely.
      if (matched && Array.isArray(collect) && collect.join(" ").length < 1500) {
        collect.push(t.trim().replace(/\s+/g, " ").slice(0, 200));
      }
      // Case 12: romance bait spans separate chat bubbles — love cues and
      // money asks tracked across blocks and joined after the scan.
      if (!loveSeen && testBoth(ROMANCE_LOVE_RE, t)) loveSeen = true;
      if (!moneySeen && testBoth(ROMANCE_MONEY_RE, t)) moneySeen = true;
    }
    if (!signals.has("ROMANCE_BAIT") && loveSeen && moneySeen) {
      signals.add("ROMANCE_BAIT");
    }

    // Countdown timers are structural scarcity pressure — fake urgency
    // rendered as a widget, which text matching alone misses.
    if (!signals.has("SCARCITY_PRESSURE")) {
      for (const el of doc.querySelectorAll(COUNTDOWN_SEL)) {
        if (/\d/.test(el.textContent ?? "")) {
          signals.add("SCARCITY_PRESSURE");
          break;
        }
      }
    }

    // Deceptive links: visible text claims a destination (domain-shaped)
    // that the href does not actually reach — fake-link phishing.
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (!isNavTarget(href)) continue;
      const m = DOMAIN_IN_TEXT.exec((a.textContent || "").trim());
      if (!m) continue;
      try {
        const hrefHost = new URL(href, loc.href ?? undefined).host;
        if (hrefHost && baseDomain(hrefHost) !== baseDomain(m[1])) {
          signals.add("LINK_DESTINATION_MISMATCH");
          break;
        }
      } catch {}
    }

    // Untrustworthy domains: abusive TLD, punycode lookalike or bare-IP
    // host — on the page itself or on destinations it pushes. loc.host is
    // checked raw: real location.host is already punycode, and URL parsing
    // rejects IDNA-invalid labels differently across engines (ICU).
    const pageHost = loc.host || (() => {
      try {
        return new URL(loc.href).host;
      } catch {
        return "";
      }
    })();
    if (hostIsSuspicious(pageHost)) signals.add("SUSPICIOUS_DOMAIN");
    if (!signals.has("SUSPICIOUS_DOMAIN")) {
      for (const el of doc.querySelectorAll("a[href], form[action]")) {
        const target = el.getAttribute("href") || el.getAttribute("action") || "";
        if (!isNavTarget(target)) continue;
        try {
          if (hostIsSuspicious(new URL(target, loc.href ?? undefined).host)) {
            signals.add("SUSPICIOUS_DOMAIN");
            break;
          }
        } catch {}
      }
    }

    // Brand impersonation in the DOM: the page presents a known brand
    // identity (title, og:site_name / application-name, or a logo img alt)
    // while served from a host outside that brand's curated domains — the
    // textual sibling of the visual voter's AUTHORITY_IMPERSONATION.
    // Lexicon generated from ml/brand-domains.json (brand-domains.js must
    // load before this script); absent data means abstain, never guess.
    const brandLex = global.SOVIR_BRAND_DOMAINS;
    if (Array.isArray(brandLex) && brandLex.length && pageHost) {
      const host = pageHost.toLowerCase();
      const fields = [];
      const push = (text, identity) => {
        if (text && text.length < 400) fields.push({ text, identity });
      };
      push(doc.title, false);
      for (const m of doc.querySelectorAll(
        'meta[name="application-name"], meta[property="og:site_name"]',
      )) {
        push(m.getAttribute("content"), true);
      }
      for (const m of doc.querySelectorAll(
        'meta[property="og:title"], meta[name="twitter:title"]',
      )) {
        push(m.getAttribute("content"), false);
      }
      for (const img of doc.querySelectorAll(
        'header img[alt], nav img[alt], [class*="logo" i] img[alt], [id*="logo" i] img[alt], img[class*="logo" i][alt], img[id*="logo" i][alt]',
      )) {
        push(img.getAttribute("alt"), true);
      }
      const normText = (s) =>
        String(s)
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const claims = fields
        .map((f) => ({ t: ` ${normText(f.text)} `, identity: f.identity }))
        .filter((f) => f.t.length > 2)
        .slice(0, 40);
      // Words that put a brand name in identity context — a travel blog
      // titled "amazon river tours" is not claiming Amazon, but "Amazon
      // Sign-In" is. Only single-word brands need this corroborant.
      const BRAND_CTX =
        /sign|log ?in|login|account|cuenta|verif|secure|segur|official|oficial|billing|factur|support|soporte|pay|pago|wallet|password|contrase|customer|client|service|servicio|update|actualiz|logo|\bid\b/;
      outer: for (const brand of brandLex) {
        if (brand.d.some((d) => host === d || host.endsWith(`.${d}`))) continue;
        const phrase = ` ${brand.n} `;
        for (const claim of claims) {
          const idx = claim.t.indexOf(phrase);
          if (idx < 0) continue;
          if (claim.identity && claim.t.trim() === brand.n) {
            signals.add("DOM_BRAND_MISMATCH");
            break outer;
          }
          if (brand.m) {
            signals.add("DOM_BRAND_MISMATCH");
            break outer;
          }
          const window = claim.t.slice(
            Math.max(0, idx - 16),
            idx + phrase.length + 16,
          );
          if (BRAND_CTX.test(window)) {
            signals.add("DOM_BRAND_MISMATCH");
            break outer;
          }
        }
      }
    }

    const prechecked = doc.querySelectorAll(
      'form input[type="checkbox"][checked], [class*="cookie" i] input[type="checkbox"][checked]',
    );
    if (prechecked.length > 0) signals.add("CONSENT_DARK_PATTERN");

    const scripts = doc.querySelectorAll("script[src]");
    for (const s of scripts) {
      try {
        const host = new URL(s.src).host;
        if (TRACKER_HOSTS.some((t) => host.endsWith(t))) {
          signals.add("TRACKING_OBSERVED");
          break;
        }
      } catch {}
    }

    if (signals.size > 0 && loc.protocol === "http:") {
      signals.add("IDENTITY_UNVERIFIED");
    }
    return [...signals].sort();
  }

  // DOM-guided logo regions (ADR-0024 direction): the visual voter should
  // not guess where the logo lives — the DOM already knows. Candidate
  // slots are images/SVGs in header, nav or logo-* marked containers plus
  // any image touching the top zone of the viewport. Output is geometry
  // ONLY (rects + viewport size, no src/alt/pixels) — it stays inside the
  // extension and feeds the local ONNX matcher, nothing crosses the API.
  const LOGO_REGION_SEL = [
    "header img",
    "nav img",
    "header svg",
    "nav svg",
    '[class*="logo" i] img',
    '[id*="logo" i] img',
    '[class*="logo" i] svg',
    '[id*="logo" i] svg',
    'img[class*="logo" i]',
    'img[id*="logo" i]',
    'svg[class*="logo" i]',
    'svg[id*="logo" i]',
    "header a img",
  ].join(",");
  const LOGO_TOP_ZONE_PX = 220;
  const MAX_LOGO_REGIONS = 16;
  const MIN_LOGO_PX = 12;

  function sovirExtractLogoRegions(doc) {
    const view = doc?.defaultView;
    const vw = Math.round(view?.innerWidth || doc?.documentElement?.clientWidth || 0);
    const vh = Math.round(view?.innerHeight || doc?.documentElement?.clientHeight || 0);
    if (!vw || !vh || !doc?.querySelectorAll) return { regions: [], vw, vh };
    const seen = new Set();
    const regions = [];
    const addRect = (el) => {
      if (regions.length >= MAX_LOGO_REGIONS) return;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width < MIN_LOGO_PX || r.height < MIN_LOGO_PX) return;
      const x = Math.max(0, Math.round(r.x));
      const y = Math.max(0, Math.round(r.y));
      const w = Math.min(vw - x, Math.round(r.width));
      const h = Math.min(vh - y, Math.round(r.height));
      if (w < MIN_LOGO_PX || h < MIN_LOGO_PX || w <= 0 || h <= 0) return;
      const key = `${x}:${y}:${w}:${h}`;
      if (seen.has(key)) return;
      seen.add(key);
      regions.push({ x, y, w, h });
    };
    for (const el of doc.querySelectorAll(LOGO_REGION_SEL)) addRect(el);
    // Any unmarked image in the top zone is also a logo candidate —
    // phishing kits often drop the header logo in a plain <img>.
    for (const img of doc.querySelectorAll("img")) {
      if (regions.length >= MAX_LOGO_REGIONS) break;
      const r = img.getBoundingClientRect?.();
      if (!r || r.y > LOGO_TOP_ZONE_PX) continue;
      addRect(img);
    }
    return { regions, vw, vh };
  }

  global.sovirExtractSignals = sovirExtractSignals;
  global.sovirExtractLogoRegions = sovirExtractLogoRegions;
})(globalThis);
