/**
 * DRAFT legal text (privacy policy + terms). Not legal advice and not reviewed
 * by a lawyer: the owner must review and edit before relying on it.
 *
 * The privacy text describes what the code actually does (verified against
 * index.html, DeferredAnalytics, AdSlot, supabase/migrations, edge functions,
 * docs/NATIVE-NYT-IMPORT.md). Re-check it whenever data handling changes.
 *
 * Placeholders the owner must fill in are the constants below.
 */

export const LEGAL_LAST_UPDATED = "2026-09-30";
/** Deliberately NOT a real address. Replace before publishing. */
export const CONTACT_PLACEHOLDER = "[CONTACT EMAIL]";
/** Replace with the governing law / venue, e.g. "the State of X, USA". */
export const JURISDICTION_PLACEHOLDER = "[GOVERNING LAW / JURISDICTION]";

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
}

const C = CONTACT_PLACEHOLDER;
const J = JURISDICTION_PLACEHOLDER;

const en: LegalContent = {
  privacy: {
    intro:
      "This policy explains what Crossword Clash (the website at crosswordclash.com and the iOS and Android apps) collects, why, and who receives it. Crossword Clash is a crossword game you can play alone or with friends.",
    sections: [
      {
        heading: "Playing without an account",
        paragraphs: [
          "There are no accounts, emails or passwords. When you use multiplayer features or the daily leaderboard, the app signs you in anonymously with Supabase, which creates a random ID stored in your browser or app. That ID is not linked to your name, email or device by us.",
        ],
      },
      {
        heading: "Information stored on our servers (Supabase)",
        paragraphs: ["When Supabase is available, the following is stored in our database:"],
        items: [
          "Your anonymous ID and the display name you type (up to 40 characters) when you host, join or post a leaderboard time. Display names are visible to other players in the same game and, for the daily leaderboard, to anyone who opens the leaderboard.",
          "Game data: a room code, the letters each player claims in each cell, scores, a player colour, timestamps, and race finish times.",
          "Daily leaderboard entries: the date, your display name, your finish time and whether it was solo or a race.",
          "Puzzles you import or open on the web version (for example from a file or link), including their title, author, grid and clues. Stored puzzle and game records can be read by other users of the service who know or can obtain the relevant identifier, so do not import puzzles you are not willing to share with the people you play with. Puzzles imported through the native NYT import are not uploaded when you play solo (see below).",
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
          "Game, puzzle and leaderboard records are kept until we delete them. Request deletion or a copy of the data tied to your anonymous ID by contacting us and, if possible, telling us your display name and room code. You can also clear local data in your browser or app settings, which resets your anonymous ID.",
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
        heading: "Acceptable use",
        items: [
          "Do not use display names or any other text that is unlawful, hateful, harassing, sexual, or that impersonates someone else.",
          "Do not attempt to disrupt, overload or reverse-engineer the service, bypass rate limits or spending limits, or access data that is not yours.",
          "Do not use automated tools to cheat in games or manipulate leaderboards.",
        ],
      },
      {
        heading: "Puzzles and your content",
        paragraphs: [
          "You are responsible for the puzzles you import or share and for having the right to use them. Do not upload or redistribute puzzles you are not permitted to share. When you host a game or send a challenge, you allow us to store and transmit that puzzle to the people you invite. We may remove content or names at our discretion.",
          "The classic library consists of public-domain puzzles from the 1924 Cross Word Puzzle Book. Daily minis and other bundled puzzles are provided for personal, non-commercial play.",
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
        paragraphs: ["These terms are governed by the laws of " + J + ". Questions: " + C + "."],
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
          "No hay cuentas, correos ni contraseñas. Cuando usas las funciones multijugador o la clasificación diaria, la app inicia sesión de forma anónima con Supabase, que crea un identificador aleatorio guardado en tu navegador o app. Nosotros no lo vinculamos a tu nombre, correo ni dispositivo.",
        ],
      },
      {
        heading: "Información guardada en nuestros servidores (Supabase)",
        paragraphs: ["Cuando Supabase está disponible, se guarda lo siguiente en nuestra base de datos:"],
        items: [
          "Tu identificador anónimo y el nombre visible que escribes (hasta 40 caracteres) cuando organizas, te unes o publicas un tiempo en la clasificación. Los nombres son visibles para los demás jugadores de la misma partida y, en la clasificación diaria, para cualquiera que la abra.",
          "Datos de partida: código de sala, las letras que cada jugador reclama en cada casilla, puntuaciones, color de jugador, marcas de tiempo y tiempos de carrera.",
          "Entradas de la clasificación diaria: la fecha, tu nombre visible, tu tiempo y si fue en solitario o en carrera.",
          "Los crucigramas que importas o abres en la versión web (por ejemplo desde un archivo o enlace), con título, autor, cuadrícula y pistas. Los registros de crucigramas y partidas pueden ser leídos por otros usuarios del servicio que conozcan u obtengan el identificador correspondiente; no importes crucigramas que no quieras compartir con las personas con las que juegas. Los crucigramas importados con la importación nativa de NYT no se suben cuando juegas en solitario (ver más abajo).",
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
          "Los registros de partidas, crucigramas y clasificación se conservan hasta que los eliminemos. Puedes solicitar la eliminación o una copia de los datos vinculados a tu identificador anónimo escribiéndonos e indicando, si es posible, tu nombre visible y el código de sala. También puedes borrar los datos locales en los ajustes de tu navegador o app, lo que reinicia tu identificador anónimo.",
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
        heading: "Uso aceptable",
        items: [
          "No uses nombres visibles ni otro texto que sea ilegal, de odio, acosador, sexual o que suplante a otra persona.",
          "No intentes interrumpir, sobrecargar ni aplicar ingeniería inversa al servicio, eludir límites de uso o de gasto, ni acceder a datos que no son tuyos.",
          "No uses herramientas automáticas para hacer trampa en las partidas ni manipular las clasificaciones.",
        ],
      },
      {
        heading: "Crucigramas y tu contenido",
        paragraphs: [
          "Eres responsable de los crucigramas que importas o compartes y de tener derecho a usarlos. No subas ni redistribuyas crucigramas que no tengas permiso para compartir. Cuando organizas una partida o envías un desafío, nos permites almacenar y transmitir ese crucigrama a las personas que invites. Podemos eliminar contenido o nombres a nuestra discreción.",
          "La biblioteca clásica reúne crucigramas de dominio público del Cross Word Puzzle Book de 1924. Los minis diarios y otros crucigramas incluidos se ofrecen para juego personal y no comercial.",
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
        paragraphs: ["Estos términos se rigen por las leyes de " + J + ". Preguntas: " + C + "."],
      },
    ],
  },
};

export const LEGAL_CONTENT: Record<"en" | "es", LegalContent> = { en, es };
