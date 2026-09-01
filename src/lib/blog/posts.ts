// The blog is a small, hand-written content set: there is no CMS and no database table behind it,
// so the posts live here as data and the routes render them statically.

export const blogPath = "/blog";

export const blogCategories = ["Guías", "Comparativas", "Rendimiento", "Para admins"] as const;

export type BlogCategory = (typeof blogCategories)[number];

// Category colour lives in CSS tokens (`--category-*` in globals.css). The class strings are
// written out in full because Tailwind extracts them statically: a composed `bg-category-${slug}`
// would never reach the stylesheet.
export const blogCategoryMeta: Record<BlogCategory, { slug: string; badge: string; dot: string; ink: string }> = {
  "Guías": {
    slug: "guias",
    badge: "bg-category-guias/12 text-category-guias-ink dark:bg-category-guias/20",
    dot: "bg-category-guias",
    ink: "text-category-guias-ink",
  },
  "Comparativas": {
    slug: "comparativas",
    badge: "bg-category-comparativas/14 text-category-comparativas-ink dark:bg-category-comparativas/22",
    dot: "bg-category-comparativas",
    ink: "text-category-comparativas-ink",
  },
  "Rendimiento": {
    slug: "rendimiento",
    badge: "bg-category-rendimiento/16 text-category-rendimiento-ink dark:bg-category-rendimiento/22",
    dot: "bg-category-rendimiento",
    ink: "text-category-rendimiento-ink",
  },
  "Para admins": {
    slug: "admins",
    badge: "bg-category-admins/14 text-category-admins-ink dark:bg-category-admins/22",
    dot: "bg-category-admins",
    ink: "text-category-admins-ink",
  },
};

// Intrinsic size of the cover art. Every post ships one file at this size; the layout never
// asks for more than half of it, so the covers stay sharp on a 2x display.
export const blogCoverWidth = 1920;
export const blogCoverHeight = 1080;

export type BlogSection = { heading: string; paragraphs: readonly string[] };

export type BlogPost = {
  slug: string;
  title: string;
  category: BlogCategory;
  // ISO date, YYYY-MM-DD. Rendered with formatBlogDate so the output never depends on the
  // runtime's ICU data.
  publishedAt: string;
  excerpt: string;
  readingMinutes: number;
  /** Path under public/. Generated cover art, one composition and one hue per post. */
  cover: string;
  /**
   * What the cover shows. These images used to ship as `alt=""`, which declares an image
   * decorative -- a false claim about the piece of art that leads an article, and the reason none
   * of them could appear in image search.
   */
  coverAlt: string;
  /** Optional highlighted line, rendered between the second and third section. */
  pullQuote?: string;
  sections: readonly BlogSection[];
};

// Newest first: the rail card and the index both read this order directly.
export const blogPosts: readonly BlogPost[] = [
  {
    slug: "elegir-servidor",
    title: "Cómo elegir servidor de Minecraft según tu forma de jugar",
    category: "Guías",
    publishedAt: "2026-08-26",
    excerpt: "El mejor servidor no es el que más jugadores tiene, sino el que encaja con las horas que juegas y con lo que te apetece construir.",
    readingMinutes: 5,
    cover: "/blog/portada-elegir-servidor.webp",
    coverAlt: "Ilustración de una brújula verde en 3D sobre fondo claro, la imagen que abre la guía para elegir servidor de Minecraft.",
    pullQuote: "Quédate con el servidor que te apetezca volver a abrir al día siguiente. Esa es la única métrica que importa de verdad.",
    sections: [
      {
        heading: "Empieza por tus horas, no por el ranking",
        paragraphs: [
          "Un servidor con tres mil jugadores conectados a las seis de la tarde puede estar vacío cuando tú te sientas a jugar. Antes de mirar la valoración, mira la franja horaria: si juegas de madrugada entre semana, te interesa una comunidad con gente despierta a esa hora, aunque su pico sea más bajo.",
          "En la ficha de cada servidor de OpinaCraft tienes el histórico de jugadores. Ese gráfico dice más sobre si vas a encontrar a alguien con quien jugar que cualquier número absoluto.",
        ],
      },
      {
        heading: "Decide qué quieres hacer las tres primeras horas",
        paragraphs: [
          "Un survival vanilla, un servidor de minijuegos y un SMP con economía piden cosas distintas de ti. En el vanilla te vas a pasar la primera tarde buscando sitio y picando; en los minijuegos entras y juegas en dos minutos; en un SMP con economía tendrás que entender su mercado antes de sentirte útil.",
          "Si no tienes claro cuánto tiempo vas a poder dedicarle, empieza por algo que no penalice desconectarse una semana. Los servidores con decaimiento de terrenos o con eventos obligatorios se disfrutan mucho más cuando ya sabes que vas a estar.",
        ],
      },
      {
        heading: "Mira las reglas antes que las capturas",
        paragraphs: [
          "Griefing permitido o no, PvP activado en el mundo principal, si hay reclamación de terrenos y cómo se resuelven los conflictos: son cuatro respuestas que determinan tu experiencia mucho más que la calidad del spawn.",
          "Las opiniones de otros jugadores suelen ser el mejor sitio para averiguar cómo se aplican esas reglas en la práctica, que no siempre es lo mismo que cómo están escritas.",
        ],
      },
      {
        heading: "Prueba dos o tres y quédate con uno",
        paragraphs: [
          "Entrar en un servidor no cuesta nada. Guarda dos o tres candidatos, dedícales una tarde a cada uno y quédate con el que te apetezca volver a abrir al día siguiente. Esa es la única métrica que importa de verdad.",
        ],
      },
    ],
  },
  {
    slug: "java-o-bedrock",
    title: "Java o Bedrock: qué cambia al unirte a un servidor",
    category: "Comparativas",
    publishedAt: "2026-08-19",
    excerpt: "Las dos ediciones comparten el nombre y poco más cuando hablamos de multijugador. Esto es lo que cambia al conectarte.",
    readingMinutes: 4,
    cover: "/blog/portada-java-o-bedrock.webp",
    coverAlt: "Ilustración de una puerta azul entreabierta en 3D sobre fondo claro, la imagen que abre la comparativa entre Java y Bedrock.",
    pullQuote: "Un servidor publicado como Java no aparecerá si lo buscas desde una consola, por muy bien escrita que esté la dirección.",
    sections: [
      {
        heading: "No son el mismo juego por dentro",
        paragraphs: [
          "Java Edition es la versión histórica de PC. Bedrock es la que corre en consola, móvil y en la app de Windows. Comparten aspecto y mecánicas básicas, pero son motores distintos, con redes distintas y con protocolos que no se hablan entre sí.",
          "Por eso un servidor publicado como Java no aparecerá si lo buscas desde una consola, y por eso la dirección que te pasa un amigo puede no funcionarte aunque esté escrita bien.",
        ],
      },
      {
        heading: "La dirección y el puerto",
        paragraphs: [
          "En Java basta normalmente con el dominio: el cliente resuelve el puerto por ti gracias a los registros SRV. En Bedrock casi siempre tendrás que escribir el puerto a mano, y el habitual es el 19132 en vez del 25565 de Java.",
          "Si un servidor ofrece las dos ediciones, lo normal es que tenga dos direcciones o dos puertos. Merece la pena copiarlas de la ficha en vez de escribirlas de memoria.",
        ],
      },
      {
        heading: "Rendimiento y mods",
        paragraphs: [
          "Bedrock suele ir más fino en equipos modestos y en consola. Java, a cambio, tiene el ecosistema grande de mods y plugins: la mayoría de servidores con mecánicas propias muy elaboradas están ahí.",
          "Hay servidores que usan puentes para aceptar jugadores de ambas ediciones en el mismo mundo. Funcionan bien para lo básico, pero conviene leer las opiniones: algunas mecánicas específicas de Java se comportan de forma rara para quien entra desde Bedrock.",
        ],
      },
      {
        heading: "Qué elegir",
        paragraphs: [
          "Si juegas en PC y quieres variedad de comunidades, Java. Si juegas en consola o móvil, o compartes partida con alguien que lo hace, Bedrock. Y si vas a publicar un servidor, indica la edición con claridad: es el primer filtro que aplica casi todo el mundo.",
        ],
      },
    ],
  },
  {
    slug: "ping-y-latencia",
    title: "Qué ping es aceptable y por qué varía tanto",
    category: "Rendimiento",
    publishedAt: "2026-08-11",
    excerpt: "Cien milisegundos no significan lo mismo en un survival que en un minijuego de PvP. Cómo leer la latencia que ves en el catálogo.",
    readingMinutes: 4,
    cover: "/blog/portada-ping-y-latencia.webp",
    coverAlt: "Ilustración de un reloj de arena naranja en 3D sobre fondo claro, la imagen que abre el artículo sobre el ping y la latencia.",
    pullQuote: "Cien milisegundos estables se llevan mucho mejor que sesenta que saltan a cuatrocientos cada dos por tres.",
    sections: [
      {
        heading: "Qué mide el número",
        paragraphs: [
          "El ping es el tiempo que tarda un paquete en ir hasta el servidor y volver. La medida que ves en OpinaCraft se toma desde nuestro monitor, no desde tu conexión: sirve para comparar servidores entre sí, no para predecir exactamente lo que verás tú.",
          "Como referencia: por debajo de 60 ms la partida se siente inmediata, entre 60 y 120 ms es perfectamente jugable para construir y explorar, y por encima de 200 ms empiezan a notarse los golpes que no registran y los bloques que reaparecen.",
        ],
      },
      {
        heading: "Por qué cambia de una hora a otra",
        paragraphs: [
          "La distancia física es solo una parte. Un servidor lleno consume más CPU por tick, y cuando el servidor no llega a sus veinte ticks por segundo la sensación de retardo aumenta aunque el ping siga igual.",
          "También influye el camino que sigue tu conexión: dos personas en la misma ciudad, con operadores distintos, pueden ver treinta milisegundos de diferencia contra el mismo servidor.",
        ],
      },
      {
        heading: "Ping alto no siempre es culpa del servidor",
        paragraphs: [
          "Antes de descartar una comunidad, prueba con cable en vez de wifi, cierra las descargas en segundo plano y comprueba si el resto de juegos te va igual. Si el problema es tuyo, lo verás en todos los servidores por igual.",
          "Si el problema es del servidor, lo verás también en el histórico: caídas de disponibilidad y picos de latencia a la misma hora todos los días suelen indicar una máquina que se queda corta.",
        ],
      },
      {
        heading: "Cuánto peso darle",
        paragraphs: [
          "Para PvP competitivo, la latencia es el primer criterio. Para un survival tranquilo con amigos es un criterio más entre otros: cien milisegundos estables se llevan mucho mejor que sesenta que saltan a cuatrocientos cada dos por tres.",
        ],
      },
    ],
  },
  {
    slug: "primeras-resenas",
    title: "Publica tu servidor y consigue tus primeras reseñas",
    category: "Para admins",
    publishedAt: "2026-08-04",
    excerpt: "Una ficha completa y unas cuantas opiniones honestas valen más que cualquier campaña. Cómo arrancar sin trampas.",
    readingMinutes: 5,
    cover: "/blog/portada-primeras-resenas.webp",
    coverAlt: "Ilustración de una estrella morada en 3D sobre fondo claro, la imagen que abre la guía para conseguir las primeras reseñas de un servidor.",
    pullQuote: "Una reseña de cuatro estrellas que explica qué mejorarías es más creíble, y más útil, que diez cincos publicados la misma tarde.",
    sections: [
      {
        heading: "Completa la ficha antes de compartirla",
        paragraphs: [
          "Dirección correcta, edición, versión, modalidades y una descripción que explique en tres frases qué se hace en tu servidor. La mitad de las fichas que no consiguen jugadores fallan aquí: quien las lee no llega a entender a qué se va a jugar.",
          "Verifica el endpoint. Un servidor con estado en línea y latencia visible transmite algo que ninguna descripción consigue: que está encendido y funcionando ahora mismo.",
        ],
      },
      {
        heading: "Las primeras opiniones salen de tu comunidad",
        paragraphs: [
          "Pide a la gente que ya juega contigo que cuente su experiencia real, con lo bueno y lo malo. Una reseña de cuatro estrellas que explica qué mejorarías es mucho más creíble, y más útil, que diez cincos idénticos publicados la misma tarde.",
          "No compres opiniones ni las intercambies con otros administradores. Se detecta rápido, y una ficha con reseñas sospechosas ahuyenta exactamente al tipo de jugador que quieres atraer.",
        ],
      },
      {
        heading: "Responde, sobre todo a las críticas",
        paragraphs: [
          "La respuesta oficial es la herramienta más infravalorada del panel. Contestar a una queja con un cambio concreto (hemos subido la memoria y el lag de las tardes debería haber bajado) convierte una mala reseña en una prueba de que hay alguien al mando.",
          "Responde también a las buenas, pero sin repetir la misma fórmula: se nota.",
        ],
      },
      {
        heading: "Mantén el ritmo",
        paragraphs: [
          "Actualiza la ficha cuando cambies de versión o de modalidad, y revisa el histórico de jugadores para saber qué eventos funcionan de verdad. Un servidor que se cuida se ve en los datos, y los datos son lo primero que mira quien está decidiendo dónde jugar.",
        ],
      },
    ],
  },
];

const monthAbbreviations = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;

function dateParts(publishedAt: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(publishedAt);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day: String(Number(day)) };
}

// Written by hand instead of with Intl so a runtime without full ICU still renders Spanish:
// "2026-08-26" becomes "26 ago 2026".
export function formatBlogDate(publishedAt: string) {
  const parts = dateParts(publishedAt);
  if (!parts) return publishedAt;
  return `${parts.day} ${monthAbbreviations[parts.monthIndex]} ${parts.year}`;
}

// "2026-08-26" becomes "26 de agosto de 2026".
export function formatBlogDateLong(publishedAt: string) {
  const parts = dateParts(publishedAt);
  if (!parts) return publishedAt;
  return `${parts.day} de ${monthNames[parts.monthIndex]} de ${parts.year}`;
}

export function blogPostPath(slug: string) {
  return `${blogPath}/${slug}`;
}

export function latestBlogPosts(limit = 4) {
  return blogPosts.slice(0, limit);
}

export function findBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug) ?? null;
}

export function otherBlogPosts(slug: string, limit = 3) {
  return blogPosts.filter((post) => post.slug !== slug).slice(0, limit);
}

/** Anchor id for a section heading, so the article's table of contents can link into the body. */
export function blogSectionId(heading: string) {
  return heading
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function blogCategoryBySlug(slug: string | undefined): BlogCategory | undefined {
  if (!slug) return undefined;
  return blogCategories.find((category) => blogCategoryMeta[category].slug === slug);
}

export function blogCategoryHref(category?: BlogCategory) {
  return category ? `${blogPath}?categoria=${blogCategoryMeta[category].slug}` : blogPath;
}

export function postsInCategory(category: BlogCategory | undefined) {
  return category ? blogPosts.filter((post) => post.category === category) : blogPosts;
}
