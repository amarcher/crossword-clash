/**
 * DRAFT legal text (privacy policy + terms). Not legal advice and not reviewed
 * by a lawyer: the owner must review and edit before relying on it.
 *
 * The privacy text describes what the code actually does (verified against
 * index.html, DeferredAnalytics, AdSlot, supabase/migrations, edge functions,
 * docs/NATIVE-NYT-IMPORT.md). Re-check it whenever data handling changes.
 *
 * Governing law: the Commonwealth of Massachusetts, where the operating
 * business is registered.
 *
 * The copyright page gives the DMCA safe harbor (17 U.S.C. 512) only once the
 * designated agent is registered at dmca.copyright.gov AND the same name,
 * postal address, phone and email appear on the page (512(c)(2)). They live
 * in DMCA_AGENT below; the legal tests refuse to ship a [PLACEHOLDER].
 */

export const LEGAL_LAST_UPDATED = "2026-10-28";
export const LEGAL_CONTACT_EMAIL = "acesuplabs@gmail.com";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDoc {
  intro: string;
  sections: LegalSection[];
}

export interface LegalContent {
  privacy: LegalDoc;
  terms: LegalDoc;
  support: LegalDoc;
  copyright: LegalDoc;
}

const C = LEGAL_CONTACT_EMAIL;

/**
 * The designated copyright agent (DMCA). Register the same details at
 * dmca.copyright.gov (service provider: the LLC; alternate names: Crossword
 * Clash, crosswordclash.com), then fill the address and phone in here. The
 * Copyright Office wants a street address, not a PO box.
 */
export const DMCA_AGENT = {
  name: "Fable Designer LLC, which operates Crossword Clash",
  attention: "Copyright Agent",
  address: "82 Wendell Ave. Ste 100, Pittsfield, MA 01201, USA",
  phone: "+1 (617) 420-2364",
  email: LEGAL_CONTACT_EMAIL,
} as const;

const en: LegalContent = {
  privacy: {
    intro:
      "This policy explains what Crossword Clash (the website at crosswordclash.com and the iOS and Android apps) collects, why, and who receives it. Crossword Clash is a crossword game you can play alone or with friends.",
    sections: [
      {
        heading: "Playing without an account",
        paragraphs: [
          "You don't need an account, and there are no passwords. When you use multiplayer features or the daily leaderboard, the app signs you in anonymously with Supabase, which creates a random ID stored in your browser or app. That ID is not linked to your name, email or device by us.",
        ],
      },
      {
        heading: "Accounts (optional)",
        paragraphs: [
          "On the website you can sign in with Apple or Google to keep your solve history across devices and to have a public username. Signing in is optional: everything in the game works without it. When you sign in, Supabase links the provider to your existing anonymous ID, so your games and times stay with you, and stores the provider's user ID and the email address the provider shares with us (Apple lets you hide it). We also store the username you choose, which is public: it appears wherever your display name would, such as in games and on leaderboards. We never see your password. While you are signed in we also keep your solve history on our servers, so it follows you to your other devices: for each puzzle you finish, its title and a fingerprint of its grid, whether it was a daily, an NYT import or another puzzle, whether you played solo or in which race mode, your finish time, and the date you finished on (your local day), which is what your streaks are counted from. Solves made on a device before you signed in are uploaded once, the first time you sign in there. Without an account, all of this stays in your browser only. You can delete your account and its data at any time from the account menu, or by emailing us at " + C + ".",
          "If you subscribe to Crossword Clash Plus, we store an entitlement record against your ID: the product, where it was bought (Apple, Google or Stripe), its status and renewal date, the subscription or transaction identifier the store gave us, and a log of the store's notifications about it. Payments are handled by Apple, Google or Stripe; we never see your card number. In the apps, RevenueCat processes store receipts for us and receives your ID. On the website, Stripe receives your email address for receipts. For the metered Plus features (AI host minutes, studio clue drafts) we count your monthly use. A Plus subscription bought in the app may be attached to your anonymous ID before you sign in; deleting your account cancels a web subscription and removes the record.",
        ],
      },
      {
        heading: "Information stored on our servers (Supabase)",
        paragraphs: ["When Supabase is available, the following is stored in our database:"],
        items: [
          "Your anonymous ID and the display name you type (up to 40 characters) when you host, join or post a leaderboard time. Display names are visible to other players in the same game and, for the daily leaderboard, to anyone who opens the leaderboard.",
          "Game data: a room code, the letters each player claims in each cell, scores, a player colour, timestamps, and race finish times.",
          "Daily leaderboard entries: the date, your display name, your finish time and whether it was solo or a race.",
          "Play statistics, on the website and in the apps: for each puzzle you play, a summary of how the solve went, linked to your anonymous ID. It includes the puzzle's title and size (not its grid or clues), whether you finished, how many squares you filled, your active and total time, wrong letters, and for each clue how long it took and how many of its letters came from crossing answers, plus the kind of device and browser you used (for example “iOS Safari”) and whether you were signed in to an account. When a TV host turns on the AI narrator, we also record whether it started and which engine answered. We use all of this to measure how hard puzzles and clues are, to see where the game is played, and to make better puzzles. On the website, visitors from the European Economic Area, the United Kingdom and Switzerland are only included if they accept analytics.",
          "Puzzles you import or open on the web version (for example from a file or link), including their title, author, grid and clues. Stored puzzle and game records can be read by other users of the service who know or can obtain the relevant identifier, so do not import puzzles you are not willing to share with the people you play with. Puzzles imported through the native NYT import are not uploaded when you play solo (see below).",
          "Published puzzles, reports and hidden authors: if you publish a puzzle from the studio, we store the puzzle (grid, clues, title and your note), your account ID, the language and difficulty you chose, when you published it, and how many times it was played and solved. The puzzle and these counts are public and shown under your username. We keep it until you unpublish it (then for 30 more days, in case you change your mind) or we remove it (then for 30 days, in case of a counter-notice), or until you delete your account. If you report a puzzle, we store the puzzle, your reason and note, and your ID (anonymous or account) so we can stop abuse of reporting; the author never sees who reported them, and the report is kept for a year after it is resolved. If you hide an author, that choice stays in your browser or app only. When we remove a puzzle or stop an account from publishing, we record the reason and who decided.",
        ],
      },
      {
        heading: "Information stored on your device",
        paragraphs: [
          "The app keeps settings and progress in your browser or app storage (localStorage, and sessionStorage for a one-time reload after an update). This includes your solo puzzle and progress, solo statistics and streak, your display name, language, voice/narrator settings, a first-visit tip flag, the timers and lockout state for a game, and the session details needed to rejoin a room after a refresh. This data stays on your device unless a feature above sends it to our servers. You can clear it in your browser or app settings.",
        ],
      },
      {
        heading: "Analytics (website only)",
        paragraphs: [
          "The website uses Google Analytics 4 to count page views and product events, for example which mode you picked, that a puzzle was imported or completed (including the puzzle title and grid size), that you changed language, or shared a result. Google Analytics uses cookies and similar identifiers and receives your IP address and browser details. See Google's privacy information at policies.google.com/technologies/partner-sites.",
          "The website also uses Vercel Web Analytics and Vercel Speed Insights, which measure page views and page-performance metrics without advertising cookies.",
          "The native iOS and Android apps do not include Google Analytics, Vercel Analytics, Speed Insights or advertising.",
        ],
      },
      {
        heading: "Advertising (website only)",
        paragraphs: [
          "The website may show ads served by Google AdSense. Google and its partners may use cookies and similar technologies to show and measure ads, and may personalise them where permitted. You can manage ad personalisation at adssettings.google.com.",
        ],
      },
      {
        heading: "Your cookie choices",
        paragraphs: [
          "If you visit from the European Economic Area, the United Kingdom or Switzerland, we ask before using analytics or advertising cookies. Until you choose, Google Analytics runs without cookies and ads are not loaded. You can accept all, reject all, or choose per category, and change your choice at any time with the Cookie settings link at the bottom of the menu. Game progress and settings stored on your device are essential to the game and are always on.",
        ],
      },
      {
        heading: "AI narrator and voice features",
        paragraphs: [
          "The TV/host view can optionally provide an AI narrator and spoken clue announcements. If a host turns these on, text describing the game is sent to third-party providers through our backend functions or directly from the host's device:",
        ],
        items: [
          "Game events: puzzle title, the display names of players, the clues that were completed, and scores. These go to the provider of the narrator you choose: Anthropic (Claude) for generated commentary, OpenAI (Realtime voice), or ElevenLabs (conversational agent).",
          "Text to be spoken (commentary or clue text) is sent to ElevenLabs for text-to-speech when the ElevenLabs voice is selected.",
          "Each provider handles this data under its own terms and privacy policy. Do not put personal information in display names if you use the narrator.",
        ],
      },
      {
        heading: "Rate limiting and usage logs",
        paragraphs: [
          "To prevent abuse and control costs, our backend functions for the narrator and voice features record your IP address, the endpoint called and the time of each request in a Supabase table, and use it to limit requests per IP address. A separate usage ledger records token/character counts and the service used, without game content or user identifiers.",
        ],
      },
      {
        heading: "Error reporting",
        paragraphs: [
          "If enabled by us on the website, unexpected errors are sent to Sentry (a service provider) so we can fix bugs. A report can include the error message, the page address, browser and device type, and technical context such as the game room ID. Error reporting is switched off in the native iOS and Android apps.",
        ],
      },
      {
        heading: "Native app: importing from The New York Times",
        paragraphs: [
          "In the iOS and Android apps you can import a puzzle you have access to on nytimes.com. The app opens NYT in a separate in-app browser that has no connection to the game. You sign in on NYT's own page; the app never sees your credentials, and NYT's cookies stay in that browser's storage on your device. When you tap Import, the app reads the puzzle (title, author, grid and clues) from the page you are viewing and saves it in the app's local storage. It does not send your NYT session, cookies or the puzzle to our servers, and solo play with an imported puzzle stays on your device.",
          "If you choose to host a multiplayer game or send a challenge with an imported puzzle, a copy of that puzzle is sent to the other participants through our servers. The app tells you this before you do so. Your use of nytimes.com is governed by NYT's own terms and privacy policy. We are not affiliated with The New York Times.",
        ],
      },
      {
        heading: "Who we share information with",
        paragraphs: [
          "We do not sell your personal information. We share it only with service providers that run the product: Supabase (database and realtime), Vercel (hosting and website analytics), Google (Analytics, AdSense), Anthropic, OpenAI and ElevenLabs (narrator and voice, only if used), Sentry (error reporting, if enabled), and Neon (the usage ledger described above). We may also disclose information if required by law.",
        ],
      },
      {
        heading: "Retention and your choices",
        paragraphs: [
          "Game records are deleted 90 days after the game ends or is closed (rooms nobody has touched for a day are closed automatically), puzzles nobody is playing are deleted with them, and anonymous IDs that have not been used for 30 days and have no records are removed. Play statistics keep their per-clue detail for 180 days and are deleted after two years. Published puzzles stay until unpublished (then 30 days), removed (then 30 days) or the account is deleted; resolved reports are kept for a year. Leaderboard entries are kept until we delete them. Request deletion or a copy of the data tied to your anonymous ID by contacting us and, if possible, telling us your display name and room code. You can also clear local data in your browser or app settings, which resets your anonymous ID.",
        ],
      },
      {
        heading: "Children",
        paragraphs: [
          "Crossword Clash is not directed to children under 13 and we do not knowingly collect personal information from them. Display names are free text, so parents should supervise young players.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "Depending on where you live (for example the EEA, UK or California) you may have rights to access, correct, delete or object to processing of your personal information. Contact us to exercise them.",
        ],
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          "We will update the date at the top of this page when this policy changes. Questions: " + C + ".",
        ],
      },
    ],
  },
  copyright: {
    intro:
      "Crossword Clash lets players bring their own puzzles: import a file, host it in a room for friends, or build one in the construction studio. We respect the rights of puzzle makers and publishers, and we handle copyright complaints under the U.S. Digital Millennium Copyright Act (DMCA). This page says where puzzles live, how to send us a notice, and what happens next.",
    sections: [
      {
        heading: "Where puzzles live",
        paragraphs: [
          "A puzzle you import for solo play stays on your device; our servers never receive it. A puzzle you build in the studio stays in your browser until you host it or share a link to it, and a challenge link carries the puzzle inside the link itself. When you host a room or send a challenge, a copy is stored on our servers so the people you invite can play it, and it is deleted on our retention schedule: a day after it is no longer part of any game, and at most 90 days after the game ends. A puzzle an author publishes to the community library is stored on our servers and shown under their username until they unpublish it or we remove it; a removed puzzle is kept for 30 days in case of a counter-notice, then deleted. The daily puzzles are published by us.",
        ],
      },
      {
        heading: "Designated copyright agent",
        paragraphs: ["Notices of claimed infringement for Crossword Clash go to our designated agent:"],
        items: [
          "Name: " + DMCA_AGENT.name,
          "Attention: " + DMCA_AGENT.attention,
          "Postal address: " + DMCA_AGENT.address,
          "Telephone: " + DMCA_AGENT.phone,
          "Email: " + DMCA_AGENT.email + " (subject line: Copyright notice)",
        ],
      },
      {
        heading: "Sending a notice",
        paragraphs: ["Email is fastest. Under the DMCA, a notice must include:"],
        items: [
          "your physical or electronic signature;",
          "the work you believe is infringed;",
          "the puzzle you want removed and where it is (a room code or a link is best);",
          "your name, address, telephone number and email;",
          "a statement that you believe in good faith the use is not authorised by you, your agent or the law;",
          "a statement that the notice is accurate and, under penalty of perjury, that you are the owner or authorised to act for the owner.",
        ],
      },
      {
        heading: "What we do with a notice",
        paragraphs: [
          "We remove the puzzle or disable access to it promptly, tell the person who hosted or shared it where we can reach them, and keep a record of the notice. If the puzzle only exists in a room, closing the room removes it.",
        ],
      },
      {
        heading: "Counter-notices",
        paragraphs: [
          "If your puzzle was removed after a notice and you believe that was a mistake, send a counter-notice to the same agent with your name, contact details and signature, the puzzle that was removed, a statement under penalty of perjury that it was removed by mistake or misidentification, and your consent to the jurisdiction of the U.S. federal courts. We forward it to the complainant and restore the puzzle 10 to 14 business days later unless they tell us they have filed a lawsuit.",
        ],
      },
      {
        heading: "Repeat infringers",
        paragraphs: [
          "We close the accounts of people who repeatedly infringe copyright and block them from hosting rooms. Knowingly false notices or counter-notices can make the sender liable for damages, including our costs.",
        ],
      },
    ],
  },
  terms: {
    intro:
      "By using Crossword Clash (the website and the iOS and Android apps) you agree to these terms. If you do not agree, please do not use it.",
    sections: [
      {
        heading: "The service",
        paragraphs: [
          "Crossword Clash lets you solve crosswords alone or race friends in real time. It is provided free of charge, may change or be unavailable at times, and we may add or remove features.",
        ],
      },
      {
        heading: "Accounts",
        paragraphs: [
          "An account is optional. If you create one, you sign in with Apple or Google and must be at least 13 years old, or older where local law requires. You are responsible for activity on your account. You can delete your account at any time from the account menu.",
        ],
      },
      {
        heading: "Crossword Clash Plus (subscriptions)",
        paragraphs: [
          "Crossword Clash Plus is an optional subscription that unlocks every past daily puzzle, the construction studio with a monthly allowance of AI clue drafts, a monthly allowance of AI host minutes on the TV view, and syncing of unfinished puzzles across devices. It is sold monthly or yearly and renews automatically until cancelled. In the apps, the purchase is made through Apple's App Store or Google Play, which handle billing, renewal, cancellation and refunds under their own terms; cancel in your store account settings. On the website, billing is handled by Stripe; cancel any time from the account menu. Cancelling stops future renewals; the subscription stays active until the end of the period already paid. Prices are shown before you buy and may change for future periods with notice. The metered allowances reset on the first of each month and unused minutes or drafts do not carry over. We may change what Plus includes; if we remove a core feature during a paid period, you may request a pro-rated refund from us or the store. A Plus subscription bought in the app is tied to the device's anonymous ID until you sign in; signing in attaches it to your account so it follows you.",
        ],
      },
      {
        heading: "Acceptable use",
        items: [
          "Do not use display names, usernames, puzzle titles, clues or any other text that is unlawful, hateful, harassing, sexual, or that impersonates someone else.",
          "Do not attempt to disrupt, overload or reverse-engineer the service, bypass rate limits or spending limits, or access data that is not yours.",
          "Do not use automated tools to cheat in games or manipulate leaderboards.",
        ],
      },
      {
        heading: "Puzzles and your content",
        paragraphs: [
          "You are responsible for the puzzles you import or share and for having the right to use them. Do not upload or redistribute puzzles you are not permitted to share. Puzzles you build in the studio are yours and stay in your browser until you host, share or publish them; the same rules apply when you do. When you host a game or send a challenge, you allow us to store and transmit that puzzle to the people you invite. We may remove content or names at our discretion.",
          "Daily puzzles and other bundled puzzles are provided for personal, non-commercial play.",
        ],
      },
      {
        heading: "Publishing puzzles",
        paragraphs: [
          "You keep ownership of the puzzles you make. When you publish one, you give us a worldwide, non-exclusive, royalty-free licence to host, display, reproduce and distribute it in Crossword Clash, to adapt its format for our apps and screens, to feature it (for example as a daily puzzle or on a leaderboard) and to show it in promotion of the service, credited to the name you publish under. Other players may solve it, race on it and share links to it within the service. We do not pay for published puzzles.",
          "Only publish puzzles you made yourself, or have the right to publish, and that follow the community rules below. You can unpublish a puzzle at any time; it then disappears from public lists, but games already in progress, past daily puzzles and copies that players saved may keep it.",
        ],
      },
      {
        heading: "Community rules",
        paragraphs: [
          "We have no tolerance for objectionable content or abusive users. A puzzle, including its title, clues, answers and notes, must not:",
        ],
        items: [
          "copy a grid or clues from another publisher or constructor without their permission;",
          "be hateful, harassing, sexually explicit, or demeaning about a group or a real person;",
          "share someone's personal information, or be used to send messages to or about someone;",
          "be spam, gibberish or deliberately broken.",
        ],
      },
      {
        heading: "Reports, removal and blocking",
        paragraphs: [
          "Every published puzzle can be reported, for example as copied, offensive or nonsense. We review reports promptly and aim to act within 24 hours. We may remove any puzzle or name, and suspend or close accounts, that break these terms, with or without notice. You can hide an author's puzzles so you no longer see them. If you think we got a decision wrong, email " + C + ".",
        ],
      },
      {
        heading: "Copyright complaints and repeat infringers",
        paragraphs: [
          "If you believe a puzzle on Crossword Clash infringes your copyright, follow our copyright policy at crosswordclash.com/copyright: it names our designated agent and explains what a notice and a counter-notice must contain. We remove infringing puzzles and close the accounts of repeat infringers.",
        ],
      },
      {
        heading: "The New York Times and other third parties",
        paragraphs: [
          "Crossword Clash is not affiliated with, endorsed by or sponsored by The New York Times Company. The NYT import in the native apps only lets you open puzzles you already have access to through your own subscription, for your personal use. You are responsible for complying with NYT's terms. Third-party names and trademarks belong to their owners.",
        ],
      },
      {
        heading: "AI narrator and voice",
        paragraphs: [
          "Narrator commentary is generated by AI, may be inaccurate, surprising or inappropriate, and is provided for entertainment. It relies on paid third-party services, so it may be paused or limited at any time without notice.",
        ],
      },
      {
        heading: "Privacy",
        paragraphs: ["Our Privacy Policy describes how information is handled and forms part of these terms."],
      },
      {
        heading: "No warranty",
        paragraphs: [
          'The service is provided "as is" and "as available" without warranties of any kind, express or implied, including fitness for a particular purpose, availability, accuracy or non-infringement. Games, scores and leaderboards may be lost or reset.',
        ],
      },
      {
        heading: "Limitation of liability",
        paragraphs: [
          "To the fullest extent permitted by law, we are not liable for indirect, incidental, special or consequential damages, or for loss of data or profits, arising from your use of the service. Nothing in these terms limits liability that cannot be limited by law.",
        ],
      },
      {
        heading: "Suspension and changes",
        paragraphs: [
          "We may suspend or block access for anyone who breaks these terms. We may update these terms; the date above shows the latest version, and continued use means you accept the update.",
        ],
      },
      {
        heading: "Governing law and contact",
        paragraphs: ["These terms are governed by the laws of the Commonwealth of Massachusetts, USA. Questions about these terms: " + C + "."],
      },
    ],
  },
  support: {
    intro:
      "Help with Crossword Clash on the web and in the iOS and Android apps. The game is free, and an account is optional.",
    sections: [
      {
        heading: "Contact us",
        paragraphs: [
          "Email " + C + " with questions, bug reports or feedback. Tell us your device, what you were doing and, for a multiplayer game, the room code. We usually reply within a few days.",
        ],
      },
      {
        heading: "Common questions",
        items: [
          "Joining a game: choose Join with a code and enter the six-character room code your host shared, or scan the QR code on their screen.",
          "A game needs at least two players before the host can start it. The host can close the room at any time.",
          "Solo progress is saved on your device and is restored when you reopen the app. Deleting the app or clearing its data removes it.",
          "Your own puzzles: Crossword Clash opens .puz, .ipuz, .jpz and .xd files.",
          "Multiplayer and the daily leaderboard need an internet connection. Solo play with a puzzle already on your device does not.",
        ],
      },
      {
        heading: "Report a name or a player",
        paragraphs: [
          "Display names are filtered, but if you see an offensive name or abusive behaviour, email " + C + " with the room code or the leaderboard date and the name. We review reports and remove names or block access where our terms are broken.",
        ],
      },
      {
        heading: "A puzzle that uses your work",
        paragraphs: [
          "If a puzzle hosted or shared on Crossword Clash uses your work without permission, our copyright policy at crosswordclash.com/copyright says how to send a notice and who our designated agent is.",
        ],
      },
      {
        heading: "Delete your data",
        paragraphs: [
          "If you have an account, you can delete it from the account menu. To have the game, puzzle and leaderboard records tied to your anonymous ID deleted, email " + C + " with your display name and, if you have it, a room code. Deleting the app removes everything stored on your device.",
        ],
      },
    ],
  },
};

const es: LegalContent = {
  privacy: {
    intro:
      "Esta política explica qué recopila Crossword Clash (el sitio web crosswordclash.com y las apps de iOS y Android), para qué y quién lo recibe. Crossword Clash es un juego de crucigramas que puedes jugar solo o con amigos.",
    sections: [
      {
        heading: "Jugar sin cuenta",
        paragraphs: [
          "No necesitas una cuenta y no hay contraseñas. Cuando usas las funciones multijugador o la clasificación diaria, la app inicia sesión de forma anónima con Supabase, que crea un identificador aleatorio guardado en tu navegador o app. Nosotros no lo vinculamos a tu nombre, correo ni dispositivo.",
        ],
      },
      {
        heading: "Cuentas (opcional)",
        paragraphs: [
          "En el sitio web puedes iniciar sesión con Apple o Google para conservar tu historial de partidas en todos tus dispositivos y tener un nombre de usuario público. Iniciar sesión es opcional: todo el juego funciona sin cuenta. Al iniciar sesión, Supabase vincula el proveedor a tu identificador anónimo existente, así tus partidas y tiempos siguen siendo tuyos, y guarda el identificador de usuario del proveedor y el correo que este nos comparte (Apple permite ocultarlo). También guardamos el nombre de usuario que elijas, que es público: aparece donde aparecería tu nombre visible, por ejemplo en las partidas y en las clasificaciones. Nunca vemos tu contraseña. Mientras tienes la sesión iniciada también guardamos tu historial de partidas en nuestros servidores, para que te acompañe en tus otros dispositivos: por cada crucigrama que terminas, su título y una huella de su cuadrícula, si era el diario, una importación del NYT u otro crucigrama, si jugaste en solitario o en qué modo de carrera, tu tiempo y la fecha en que lo terminaste (tu día local), de la que se calculan tus rachas. Las partidas hechas en un dispositivo antes de iniciar sesión se suben una sola vez, la primera vez que inicias sesión en él. Sin cuenta, todo esto se queda solo en tu navegador. Puedes eliminar tu cuenta y sus datos en cualquier momento desde el menú de la cuenta, o escribiéndonos a " + C + ".",
          "Si te suscribes a Crossword Clash Plus, guardamos un registro de derecho asociado a tu ID: el producto, dónde se compró (Apple, Google o Stripe), su estado y fecha de renovación, el identificador de suscripción o transacción que nos dio la tienda y un registro de las notificaciones de la tienda al respecto. Los pagos los gestionan Apple, Google o Stripe; nunca vemos el número de tu tarjeta. En las apps, RevenueCat procesa los recibos de la tienda por nosotros y recibe tu ID. En el sitio web, Stripe recibe tu correo electrónico para los recibos. Para las funciones de Plus con límite (minutos del presentador con IA, borradores de pistas del estudio) contamos tu uso mensual. Una suscripción a Plus comprada en la app puede quedar asociada a tu ID anónimo antes de iniciar sesión; eliminar tu cuenta cancela una suscripción web y borra el registro.",
        ],
      },
      {
        heading: "Información guardada en nuestros servidores (Supabase)",
        paragraphs: ["Cuando Supabase está disponible, se guarda lo siguiente en nuestra base de datos:"],
        items: [
          "Tu identificador anónimo y el nombre visible que escribes (hasta 40 caracteres) cuando organizas, te unes o publicas un tiempo en la clasificación. Los nombres son visibles para los demás jugadores de la misma partida y, en la clasificación diaria, para cualquiera que la abra.",
          "Datos de partida: código de sala, las letras que cada jugador reclama en cada casilla, puntuaciones, color de jugador, marcas de tiempo y tiempos de carrera.",
          "Entradas de la clasificación diaria: la fecha, tu nombre visible, tu tiempo y si fue en solitario o en carrera.",
          "Estadísticas de juego, en la web y en las apps: por cada crucigrama que juegas, un resumen de cómo fue, vinculado a tu ID anónimo. Incluye el título y el tamaño del crucigrama (no su cuadrícula ni sus pistas), si lo terminaste, cuántas casillas llenaste, tu tiempo activo y total, las letras incorrectas y, para cada pista, cuánto tardaste y cuántas de sus letras vinieron de respuestas cruzadas, además del tipo de dispositivo y navegador que usaste (por ejemplo «iOS Safari») y si habías iniciado sesión con una cuenta. Cuando quien organiza en una TV activa el narrador con IA, también registramos si arrancó y qué motor respondió. Usamos todo esto para medir la dificultad de los crucigramas y las pistas, saber dónde se juega y crear otros mejores. En la web, solo se incluye a visitantes del Espacio Económico Europeo, el Reino Unido y Suiza si aceptan la analítica.",
          "Los crucigramas que importas o abres en la versión web (por ejemplo desde un archivo o enlace), con título, autor, cuadrícula y pistas. Los registros de crucigramas y partidas pueden ser leídos por otros usuarios del servicio que conozcan u obtengan el identificador correspondiente; no importes crucigramas que no quieras compartir con las personas con las que juegas. Los crucigramas importados con la importación nativa de NYT no se suben cuando juegas en solitario (ver más abajo).",
          "Crucigramas publicados, denuncias y autores ocultos: si publicas un crucigrama desde el estudio, guardamos el crucigrama (cuadrícula, pistas, título y tu nota), el identificador de tu cuenta, el idioma y la dificultad que elegiste, cuándo lo publicaste y cuántas veces se ha jugado y resuelto. El crucigrama y esas cifras son públicos y se muestran con tu nombre de usuario. Lo conservamos hasta que lo retires (y 30 días más, por si cambias de idea) o lo eliminemos (y 30 días más, por si hay una contranotificación), o hasta que borres tu cuenta. Si denuncias un crucigrama, guardamos el crucigrama, tu motivo y tu nota, y tu identificador (anónimo o de cuenta) para evitar abusos de las denuncias; el autor nunca ve quién lo denunció, y la denuncia se conserva un año después de resolverse. Si ocultas a un autor, esa elección se queda solo en tu navegador o app. Cuando eliminamos un crucigrama o impedimos que una cuenta publique, registramos el motivo y quién lo decidió.",
        ],
      },
      {
        heading: "Información guardada en tu dispositivo",
        paragraphs: [
          "La app guarda ajustes y progreso en el almacenamiento de tu navegador o app (localStorage y, para una recarga única tras una actualización, sessionStorage). Incluye tu crucigrama y progreso en solitario, estadísticas y racha, tu nombre visible, idioma, ajustes de voz/narrador, un indicador del consejo de primera visita, temporizadores y bloqueos de una partida, y los datos necesarios para volver a una sala tras recargar. Estos datos permanecen en tu dispositivo salvo que una función anterior los envíe a nuestros servidores. Puedes borrarlos en los ajustes de tu navegador o app.",
        ],
      },
      {
        heading: "Analítica (solo sitio web)",
        paragraphs: [
          "El sitio web usa Google Analytics 4 para contar visitas de página y eventos del producto, por ejemplo qué modo eliges, que se importó o completó un crucigrama (con su título y tamaño de cuadrícula), que cambias de idioma o compartes un resultado. Google Analytics usa cookies e identificadores similares y recibe tu dirección IP y datos del navegador. Consulta la información de privacidad de Google en policies.google.com/technologies/partner-sites.",
          "El sitio también usa Vercel Web Analytics y Vercel Speed Insights, que miden visitas y métricas de rendimiento sin cookies publicitarias.",
          "Las apps nativas de iOS y Android no incluyen Google Analytics, Vercel Analytics, Speed Insights ni publicidad.",
        ],
      },
      {
        heading: "Publicidad (solo sitio web)",
        paragraphs: [
          "El sitio web puede mostrar anuncios servidos por Google AdSense. Google y sus socios pueden usar cookies y tecnologías similares para mostrar y medir anuncios, y personalizarlos cuando esté permitido. Puedes gestionar la personalización en adssettings.google.com.",
        ],
      },
      {
        heading: "Tus opciones de cookies",
        paragraphs: [
          "Si nos visitas desde el Espacio Económico Europeo, el Reino Unido o Suiza, te pedimos permiso antes de usar cookies de analítica o de publicidad. Hasta que elijas, Google Analytics funciona sin cookies y no se cargan anuncios. Puedes aceptar todo, rechazar todo o elegir por categoría, y cambiar tu elección cuando quieras con el enlace Configuración de cookies al final del menú. El progreso y los ajustes del juego guardados en tu dispositivo son esenciales para el juego y siempre están activos.",
        ],
      },
      {
        heading: "Narrador con IA y funciones de voz",
        paragraphs: [
          "La vista TV/anfitrión puede ofrecer opcionalmente un narrador con IA y anuncios de pistas en voz alta. Si el anfitrión los activa, se envía texto sobre la partida a proveedores externos a través de nuestras funciones de servidor o directamente desde el dispositivo del anfitrión:",
        ],
        items: [
          "Eventos de la partida: título del crucigrama, nombres visibles de los jugadores, las pistas completadas y las puntuaciones. Van al proveedor del narrador que elijas: Anthropic (Claude) para comentarios generados, OpenAI (voz en tiempo real) o ElevenLabs (agente conversacional).",
          "El texto que se va a pronunciar (comentarios o pistas) se envía a ElevenLabs para la síntesis de voz cuando se selecciona la voz de ElevenLabs.",
          "Cada proveedor trata estos datos según sus propios términos y política de privacidad. No pongas datos personales en los nombres visibles si usas el narrador.",
        ],
      },
      {
        heading: "Límites de uso y registros",
        paragraphs: [
          "Para evitar abusos y controlar costes, nuestras funciones de servidor del narrador y la voz registran tu dirección IP, el punto de acceso llamado y la hora de cada solicitud en una tabla de Supabase, y la usan para limitar solicitudes por dirección IP. Un registro de uso aparte guarda recuentos de tokens/caracteres y el servicio usado, sin contenido de juego ni identificadores de usuario.",
        ],
      },
      {
        heading: "Informes de errores",
        paragraphs: [
          "Si lo activamos en el sitio web, los errores inesperados se envían a Sentry (un proveedor de servicios) para poder corregir fallos. Un informe puede incluir el mensaje de error, la dirección de la página, el tipo de navegador y dispositivo y contexto técnico como el identificador de la sala. Los informes de errores están desactivados en las apps nativas de iOS y Android.",
        ],
      },
      {
        heading: "App nativa: importar desde The New York Times",
        paragraphs: [
          "En las apps de iOS y Android puedes importar un crucigrama al que tengas acceso en nytimes.com. La app abre NYT en un navegador interno separado que no tiene conexión con el juego. Inicias sesión en la propia página de NYT; la app nunca ve tus credenciales y las cookies de NYT permanecen en el almacenamiento de ese navegador en tu dispositivo. Cuando pulsas Importar, la app lee el crucigrama (título, autor, cuadrícula y pistas) de la página que estás viendo y lo guarda en el almacenamiento local de la app. No envía tu sesión de NYT, cookies ni el crucigrama a nuestros servidores, y el juego en solitario con un crucigrama importado se queda en tu dispositivo.",
          "Si eliges organizar una partida multijugador o enviar un desafío con un crucigrama importado, se envía una copia a los demás participantes a través de nuestros servidores. La app te lo avisa antes. El uso de nytimes.com se rige por los términos y la política de privacidad de NYT. No estamos afiliados a The New York Times.",
        ],
      },
      {
        heading: "Con quién compartimos información",
        paragraphs: [
          "No vendemos tu información personal. Solo la compartimos con los proveedores que hacen funcionar el producto: Supabase (base de datos y tiempo real), Vercel (alojamiento y analítica web), Google (Analytics, AdSense), Anthropic, OpenAI y ElevenLabs (narrador y voz, solo si se usan), Sentry (informes de errores, si están activados) y Neon (el registro de uso descrito). También podemos divulgar información si la ley lo exige.",
        ],
      },
      {
        heading: "Conservación y tus opciones",
        paragraphs: [
          "Los registros de partidas se eliminan 90 días después de que la partida termine o se cierre (las salas que nadie ha tocado en un día se cierran automáticamente), los crucigramas que nadie juega se eliminan con ellas, y los identificadores anónimos sin uso durante 30 días y sin registros se borran. Las estadísticas de juego conservan el detalle por pista durante 180 días y se eliminan a los dos años. Los crucigramas publicados se conservan hasta que se retiran (y 30 días más), se eliminan (y 30 días más) o se borra la cuenta; las denuncias resueltas se conservan un año. Las entradas de la clasificación se conservan hasta que las eliminemos. Puedes solicitar la eliminación o una copia de los datos vinculados a tu identificador anónimo escribiéndonos e indicando, si es posible, tu nombre visible y el código de sala. También puedes borrar los datos locales en los ajustes de tu navegador o app, lo que reinicia tu identificador anónimo.",
        ],
      },
      {
        heading: "Menores",
        paragraphs: [
          "Crossword Clash no está dirigido a menores de 13 años y no recopilamos a sabiendas información personal de ellos. Los nombres visibles son texto libre, por lo que los padres deben supervisar a los jugadores jóvenes.",
        ],
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          "Según dónde vivas (por ejemplo el EEE, el Reino Unido o California) puedes tener derecho a acceder, corregir, eliminar u oponerte al tratamiento de tu información personal. Escríbenos para ejercerlos.",
        ],
      },
      {
        heading: "Cambios y contacto",
        paragraphs: [
          "Actualizaremos la fecha al inicio de esta página cuando cambie la política. Preguntas: " + C + ".",
        ],
      },
    ],
  },
  copyright: {
    intro:
      "Crossword Clash permite traer tus propios crucigramas: importar un archivo, organizar una sala con él para tus amigos o crear uno en el estudio de construcción. Respetamos los derechos de quienes crean y publican crucigramas y tramitamos las reclamaciones de derechos de autor según la ley estadounidense Digital Millennium Copyright Act (DMCA). Esta página explica dónde se guardan los crucigramas, cómo enviarnos una notificación y qué ocurre después.",
    sections: [
      {
        heading: "Dónde se guardan los crucigramas",
        paragraphs: [
          "Un crucigrama que importas para jugar en solitario se queda en tu dispositivo; nuestros servidores nunca lo reciben. Un crucigrama que creas en el estudio se queda en tu navegador hasta que organizas una sala o compartes un enlace, y un enlace de desafío lleva el crucigrama dentro del propio enlace. Cuando organizas una sala o envías un desafío, se guarda una copia en nuestros servidores para que las personas que invitas puedan jugarlo, y se elimina según nuestro calendario de retención: un día después de dejar de formar parte de una partida y, como máximo, 90 días después de terminar la partida. Un crucigrama que un autor publica en la biblioteca de la comunidad se guarda en nuestros servidores y se muestra con su nombre de usuario hasta que lo retira o lo eliminamos; un crucigrama eliminado se conserva 30 días por si hay una contranotificación y después se borra. Los crucigramas diarios los publicamos nosotros.",
        ],
      },
      {
        heading: "Agente designado de derechos de autor",
        paragraphs: ["Las notificaciones de presunta infracción relativas a Crossword Clash se dirigen a nuestro agente designado:"],
        items: [
          "Nombre: " + DMCA_AGENT.name,
          "A la atención de: " + DMCA_AGENT.attention,
          "Dirección postal: " + DMCA_AGENT.address,
          "Teléfono: " + DMCA_AGENT.phone,
          "Correo: " + DMCA_AGENT.email + " (asunto: Copyright notice)",
        ],
      },
      {
        heading: "Enviar una notificación",
        paragraphs: ["El correo es lo más rápido. Según la DMCA, la notificación debe incluir:"],
        items: [
          "tu firma física o electrónica;",
          "la obra que crees infringida;",
          "el crucigrama que quieres retirar y dónde está (mejor con el código de la sala o un enlace);",
          "tu nombre, dirección, teléfono y correo;",
          "una declaración de que crees de buena fe que el uso no está autorizado por ti, tu representante ni la ley;",
          "una declaración de que la notificación es exacta y, bajo pena de perjurio, de que eres el titular o estás autorizado a actuar en su nombre.",
        ],
      },
      {
        heading: "Qué hacemos con una notificación",
        paragraphs: [
          "Retiramos el crucigrama o bloqueamos el acceso a él con rapidez, se lo comunicamos a quien lo organizó o compartió cuando podemos localizarlo y conservamos un registro de la notificación. Si el crucigrama solo existe en una sala, cerrar la sala lo elimina.",
        ],
      },
      {
        heading: "Contranotificaciones",
        paragraphs: [
          "Si retiramos tu crucigrama tras una notificación y crees que fue un error, envía una contranotificación al mismo agente con tu nombre, datos de contacto y firma, el crucigrama retirado, una declaración bajo pena de perjurio de que se retiró por error o mala identificación, y tu aceptación de la jurisdicción de los tribunales federales de EE. UU. La reenviamos al reclamante y restauramos el crucigrama entre 10 y 14 días hábiles después, salvo que nos indique que ha presentado una demanda.",
        ],
      },
      {
        heading: "Infractores reiterados",
        paragraphs: [
          "Cerramos las cuentas de quienes infringen derechos de autor de forma reiterada y les impedimos organizar salas. Quien envíe a sabiendas una notificación o contranotificación falsa puede ser responsable de los daños, incluidos nuestros costes.",
        ],
      },
    ],
  },
  terms: {
    intro:
      "Al usar Crossword Clash (el sitio web y las apps de iOS y Android) aceptas estos términos. Si no estás de acuerdo, por favor no lo uses.",
    sections: [
      {
        heading: "El servicio",
        paragraphs: [
          "Crossword Clash te permite resolver crucigramas solo o competir con amigos en tiempo real. Se ofrece gratis, puede cambiar o no estar disponible en ocasiones, y podemos añadir o quitar funciones.",
        ],
      },
      {
        heading: "Cuentas",
        paragraphs: [
          "La cuenta es opcional. Si creas una, inicias sesión con Apple o Google y debes tener al menos 13 años, o más si la ley local lo exige. Eres responsable de la actividad de tu cuenta. Puedes eliminar tu cuenta en cualquier momento desde el menú de la cuenta.",
        ],
      },
      {
        heading: "Crossword Clash Plus (suscripciones)",
        paragraphs: [
          "Crossword Clash Plus es una suscripción opcional que desbloquea todos los crucigramas diarios pasados, el estudio de construcción con un cupo mensual de borradores de pistas con IA, un cupo mensual de minutos del presentador con IA en la vista de TV y la sincronización de crucigramas sin terminar entre dispositivos. Se vende mensual o anualmente y se renueva automáticamente hasta que la canceles. En las apps, la compra se hace a través del App Store de Apple o de Google Play, que gestionan la facturación, la renovación, la cancelación y los reembolsos según sus propios términos; cancela desde los ajustes de tu cuenta de la tienda. En el sitio web, la facturación la gestiona Stripe; cancela cuando quieras desde el menú de la cuenta. Cancelar detiene las renovaciones futuras; la suscripción sigue activa hasta el final del periodo ya pagado. Los precios se muestran antes de comprar y pueden cambiar para periodos futuros con aviso previo. Los cupos se restablecen el día 1 de cada mes y los minutos o borradores no usados no se acumulan. Podemos cambiar lo que incluye Plus; si retiramos una función principal durante un periodo pagado, puedes pedirnos a nosotros o a la tienda un reembolso proporcional. Una suscripción a Plus comprada en la app queda vinculada al ID anónimo del dispositivo hasta que inicias sesión; al iniciar sesión se asocia a tu cuenta y te acompaña.",
        ],
      },
      {
        heading: "Uso aceptable",
        items: [
          "No uses nombres visibles, nombres de usuario, títulos de crucigramas, pistas ni otro texto que sea ilegal, de odio, acosador, sexual o que suplante a otra persona.",
          "No intentes interrumpir, sobrecargar ni aplicar ingeniería inversa al servicio, eludir límites de uso o de gasto, ni acceder a datos que no son tuyos.",
          "No uses herramientas automáticas para hacer trampa en las partidas ni manipular las clasificaciones.",
        ],
      },
      {
        heading: "Crucigramas y tu contenido",
        paragraphs: [
          "Eres responsable de los crucigramas que importas o compartes y de tener derecho a usarlos. No subas ni redistribuyas crucigramas que no tengas permiso para compartir. Los crucigramas que creas en el estudio son tuyos y se quedan en tu navegador hasta que organizas una sala, los compartes o los publicas; cuando lo haces, se aplican las mismas reglas. Cuando organizas una partida o envías un desafío, nos permites almacenar y transmitir ese crucigrama a las personas que invites. Podemos eliminar contenido o nombres a nuestra discreción.",
          "Los crucigramas diarios y otros crucigramas incluidos se ofrecen para juego personal y no comercial.",
        ],
      },
      {
        heading: "Publicar crucigramas",
        paragraphs: [
          "Los crucigramas que creas siguen siendo tuyos. Al publicar uno, nos concedes una licencia mundial, no exclusiva y gratuita para alojarlo, mostrarlo, reproducirlo y distribuirlo en Crossword Clash, adaptar su formato a nuestras apps y pantallas, destacarlo (por ejemplo como crucigrama diario o en una clasificación) y mostrarlo para promocionar el servicio, con el nombre con el que lo publicas. Otros jugadores pueden resolverlo, competir con él y compartir enlaces dentro del servicio. No pagamos por los crucigramas publicados.",
          "Publica solo crucigramas que hayas creado tú o que tengas derecho a publicar, y que cumplan las normas de la comunidad. Puedes retirar un crucigrama cuando quieras; desaparece de las listas públicas, pero las partidas en curso, los crucigramas diarios pasados y las copias que hayan guardado los jugadores pueden conservarlo.",
        ],
      },
      {
        heading: "Normas de la comunidad",
        paragraphs: [
          "No toleramos contenido inaceptable ni usuarios abusivos. Un crucigrama, incluidos su título, pistas, respuestas y notas, no debe:",
        ],
        items: [
          "copiar una cuadrícula o pistas de otro editor o autor sin su permiso;",
          "ser de odio, acosador, sexualmente explícito ni denigrar a un grupo o a una persona real;",
          "compartir datos personales de alguien ni usarse para enviar mensajes a alguien o sobre alguien;",
          "ser spam, un sinsentido o estar roto a propósito.",
        ],
      },
      {
        heading: "Denuncias, retirada y bloqueo",
        paragraphs: [
          "Cualquier crucigrama publicado se puede denunciar, por ejemplo por copiado, ofensivo o sin sentido. Revisamos las denuncias con rapidez e intentamos actuar en menos de 24 horas. Podemos retirar cualquier crucigrama o nombre, y suspender o cerrar cuentas, que incumplan estos términos, con o sin aviso. Puedes ocultar los crucigramas de un autor para no verlos más. Si crees que nos equivocamos, escribe a " + C + ".",
        ],
      },
      {
        heading: "Reclamaciones de derechos de autor e infractores reiterados",
        paragraphs: [
          "Si crees que un crucigrama de Crossword Clash infringe tus derechos de autor, sigue nuestra política de derechos de autor en crosswordclash.com/copyright: nombra a nuestro agente designado y explica qué debe incluir una notificación y una contranotificación. Retiramos los crucigramas infractores y cerramos las cuentas de quienes infringen de forma reiterada.",
        ],
      },
      {
        heading: "The New York Times y otros terceros",
        paragraphs: [
          "Crossword Clash no está afiliado, respaldado ni patrocinado por The New York Times Company. La importación de NYT en las apps nativas solo te permite abrir crucigramas a los que ya tienes acceso con tu propia suscripción, para tu uso personal. Eres responsable de cumplir los términos de NYT. Los nombres y marcas de terceros pertenecen a sus propietarios.",
        ],
      },
      {
        heading: "Narrador con IA y voz",
        paragraphs: [
          "Los comentarios del narrador los genera una IA, pueden ser inexactos, sorprendentes o inapropiados y se ofrecen como entretenimiento. Depende de servicios externos de pago, por lo que puede pausarse o limitarse en cualquier momento sin aviso.",
        ],
      },
      {
        heading: "Privacidad",
        paragraphs: ["Nuestra Política de privacidad describe cómo se trata la información y forma parte de estos términos."],
      },
      {
        heading: "Sin garantía",
        paragraphs: [
          'El servicio se ofrece "tal cual" y "según disponibilidad", sin garantías de ningún tipo, expresas o implícitas, incluidas la idoneidad para un fin concreto, la disponibilidad, la exactitud o la no infracción. Las partidas, puntuaciones y clasificaciones pueden perderse o reiniciarse.',
        ],
      },
      {
        heading: "Limitación de responsabilidad",
        paragraphs: [
          "En la máxima medida permitida por la ley, no somos responsables de daños indirectos, incidentales, especiales o consecuentes, ni de pérdida de datos o beneficios, derivados de tu uso del servicio. Nada de estos términos limita una responsabilidad que la ley no permita limitar.",
        ],
      },
      {
        heading: "Suspensión y cambios",
        paragraphs: [
          "Podemos suspender o bloquear el acceso a quien incumpla estos términos. Podemos actualizarlos; la fecha de arriba indica la última versión y seguir usando el servicio supone aceptar la actualización.",
        ],
      },
      {
        heading: "Ley aplicable y contacto",
        paragraphs: ["Estos términos se rigen por las leyes de la Mancomunidad de Massachusetts, EE. UU. Preguntas sobre estos términos: " + C + "."],
      },
    ],
  },
  support: {
    intro:
      "Ayuda con Crossword Clash en la web y en las apps de iOS y Android. El juego es gratuito y la cuenta es opcional.",
    sections: [
      {
        heading: "Contáctanos",
        paragraphs: [
          "Escribe a " + C + " con preguntas, errores o comentarios. Indica tu dispositivo, qué estabas haciendo y, si era una partida multijugador, el código de sala. Solemos responder en unos días.",
        ],
      },
      {
        heading: "Preguntas frecuentes",
        items: [
          "Unirse a una partida: elige Unirse con un código e introduce el código de sala de seis caracteres que compartió el anfitrión, o escanea el código QR de su pantalla.",
          "Una partida necesita al menos dos jugadores antes de que el anfitrión pueda empezarla. El anfitrión puede cerrar la sala en cualquier momento.",
          "El progreso en solitario se guarda en tu dispositivo y se recupera al volver a abrir la app. Si eliminas la app o borras sus datos, se pierde.",
          "Tus propios crucigramas: Crossword Clash abre archivos .puz, .ipuz, .jpz y .xd.",
          "El multijugador y la clasificación diaria necesitan conexión a internet. Jugar en solitario con un crucigrama que ya está en tu dispositivo, no.",
        ],
      },
      {
        heading: "Denunciar un nombre o a un jugador",
        paragraphs: [
          "Los nombres visibles se filtran, pero si ves un nombre ofensivo o un comportamiento abusivo, escribe a " + C + " con el código de sala o la fecha de la clasificación y el nombre. Revisamos las denuncias y eliminamos nombres o bloqueamos el acceso cuando se incumplen nuestros términos.",
        ],
      },
      {
        heading: "Un crucigrama que usa tu obra",
        paragraphs: [
          "Si un crucigrama organizado o compartido en Crossword Clash usa tu obra sin permiso, nuestra política de derechos de autor en crosswordclash.com/copyright explica cómo enviar una notificación y quién es nuestro agente designado.",
        ],
      },
      {
        heading: "Eliminar tus datos",
        paragraphs: [
          "Si tienes una cuenta, puedes eliminarla desde el menú de la cuenta. Para que eliminemos los registros de partidas, crucigramas y clasificación vinculados a tu identificador anónimo, escribe a " + C + " con tu nombre visible y, si lo tienes, un código de sala. Eliminar la app borra todo lo guardado en tu dispositivo.",
        ],
      },
    ],
  },
};

export const LEGAL_CONTENT: Record<"en" | "es", LegalContent> = { en, es };
