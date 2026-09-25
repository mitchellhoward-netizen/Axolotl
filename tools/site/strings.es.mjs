/**
 * Todo el texto del sitio en español, en un solo lugar.
 *
 * Misma estructura exacta que strings.en.mjs: el build falla si falta una clave,
 * así que /es no puede quedarse atrás. Pendiente: revisión de una persona que
 * hable español con fluidez antes de publicar (el brief lo pide).
 *
 * Registro: tuteo, frases cortas, palabras de todos los días. Se usa el mismo
 * vocabulario que ya estaba en el sitio ("tu sí", "salida temprana", "kínder").
 */

export default {
  lang: 'es',
  locale: 'es_US',

  meta: {
    title: 'Axolotl: toda familia merece un agente para la escuela.',
    description:
      'Axolotl es el agente de tu familia para la escuela, por texto. Lee lo que manda la escuela, se encarga de los formularios y de quién recoge a los niños, y consigue la ayuda que le corresponde a tu hijo. Nada se envía sin tu sí.',
    shareAlt:
      'Una carpeta de manila con la etiqueta "La familia Howard" con pendientes escolares, cada uno marcado Confirmado, Esperando tu sí o Solicitado.',
  },

  a11y: {
    skip: 'Saltar al contenido',
    home: 'Axolotl, inicio',
    menu: 'Menú',
    mainNav: 'Navegación principal',
    footerNav: 'Pie de página',
    mascot: 'Un ajolote rosa sonriente con branquias.',
    statusWord: 'Estado',
  },

  nav: {
    how: 'Cómo funciona',
    help: 'Ayuda disponible',
    schools: 'Para escuelas',
    join: 'Únete al piloto',
    langSwitch: 'English',
    langSwitchHref: '/',
  },

  exampleCaption:
    'Conversación de ejemplo. Escuela y familia ficticias.',

  // ── La página de inicio, como un día de escuela ─────────────────────────────
  // Cada sección es un momento del día, y la luz de la página cambia con él:
  // amanecer, día, tarde dorada, atardecer, noche. Las horas son parte del texto.
  day: {
    // Short enough to fit inside the signup field on a small phone.
    phonePlaceholder: 'Tu teléfono',
    agents: {
      label: 'Quién tiene agente',
      items: [
        'Las estrellas de cine tienen agente.',
        'Los atletas tienen agente.',
        'Los escritores tienen agente.',
        'Los jazzistas tienen agente.',
        'Los comediantes tienen agente.',
        'Los surfistas profesionales tienen agente.',
        'Los influencers tienen agente.',
        'Los gamers profesionales tienen agente.',
        'Los toreros tienen agente.',
        'Los modelos de manos tienen agente.',
        'Los payasos tienen agente.',
      ],
      parentsLead: 'Mamás y papás tienen',
      parentsTail: 'una pila de permisos por firmar.',
    },
    morning: {
      time: '7:15 AM',
      label: 'Un día de escuela',
      h1Plain: 'Toda familia merece',
      h1Em: 'un agente.',
    },
    inbox: {
      time: '8:30 AM',
      label: 'El correo',
      h2Plain: 'Ocho correos de la escuela.',
      h2Em: 'Uno que importa.',
      lead: 'Axolotl lee todo lo que manda la escuela, encuentra el que tiene fecha límite, llena el formulario y espera tu sí. Listo significa que la escuela lo confirmó.',
      steps: [
        { tag: 'Lee', body: 'Correos reenviados, la foto de un formulario en papel o tu Gmail' },
        { tag: 'Encuentra', body: 'Lo único que tiene fecha' },
        { tag: 'Pregunta', body: 'Ves lo que va a mandar. Tu sí lo manda' },
        { tag: 'Confirma', body: 'Solo cuenta como listo cuando la escuela lo confirma' },
      ],
      inboxLabel: 'Correo · 8 nuevos de la Primaria Lincoln',
      emails: [
        'Día de fotos, 3 de oct.',
        'Feria del libro la próxima semana',
        'Kínder: examen físico y dental antes del 15 de oct.',
        'Semana de espíritu escolar',
        'Junta de padres, jueves',
        'Menú de octubre',
        'Devolver libros de la biblioteca',
      ],
      highlight: 2,
    },
    midday: {
      time: '11:48 AM',
      label: 'Mediodía',
    },
    qualify: {
      time: '3:05 PM',
      label: 'A la salida',
      h2Plain: 'La ayuda que a tu hijo',
      h2Em: 'ya le corresponde.',
      lead: 'Transporte, evaluaciones, intérpretes, comidas gratis. La ayuda existe, pero hay que saber pedirla, pedirla por escrito y seguir insistiendo. Axolotl se da cuenta cuando tu hijo podría calificar, y hace las tres cosas.',
      timelineTitle: 'Una solicitud, de principio a fin',
      steps: [
        {
          when: '30 de sep. · 2:14 PM',
          title: 'La escuela manda un correo',
          kind: 'email',
          from: 'Sra. Park, 2.º grado · Primaria Lincoln',
          subject: 'Resultados de la evaluación de lectura de otoño',
          before: 'Maya obtuvo un resultado ',
          mark: 'muy por debajo del nivel esperado',
          after: ' en fluidez lectora. Vamos a darle práctica en grupos pequeños en clase.',
        },
        {
          when: '3:05 PM',
          title: 'Axolotl entiende lo que significa',
          kind: 'text',
          in: 'La evaluación de lectura de Maya salió muy por debajo del nivel esperado. Puedes pedirle a la escuela que la evalúe para darle más apoyo. Tiene que ser por escrito. ¿Quieres que lo redacte?',
          out: 'Sí, por favor',
        },
        {
          when: '9:40 PM',
          title: 'Escribe la carta',
          kind: 'letter',
          to: 'Para la Sra. Alvarez, educación especial, Primaria Lincoln',
          before: 'Solicito una evaluación completa de mi hija, Maya Howard, para servicios de educación especial conforme a la ',
          mark: 'Ley de Educación para Personas con Discapacidades (IDEA)',
          after: '. Doy mi consentimiento para la evaluación.',
          sent: 'Enviada con tu sí',
        },
        {
          when: '8 de oct. · Día 8',
          title: 'Sin respuesta, así que insiste',
          kind: 'text',
          in: 'Lincoln todavía no contesta. Le mandé a la Sra. Alvarez un recordatorio amable, con copia a la oficina.',
          pending: true,
        },
        {
          when: '10 de oct. · Día 10',
          title: 'La escuela contesta',
          kind: 'reply',
          from: 'Primaria Lincoln',
          text: 'Recibido. La evaluación de Maya está programada para el 21 de octubre.',
          track: 'Seguimiento: día 10 de 60. Vence el 29 de nov.',
          done: true,
        },
      ],
      alsoLabel: 'También puede pedir:',
      also: [
        'Transporte a la escuela',
        'Un intérprete en las juntas',
        'Almuerzo gratis o a precio reducido',
        'El tiempo extra que dice su plan',
        'Un lugar en el programa después de clases',
      ],
      note: 'Axolotl no es abogado. Pide lo que a tu hijo ya le corresponde.',
    },
    school: {
      time: '3:40 PM',
      label: 'En la puerta de la escuela',
      h2Plain: 'Cada familia hace Lincoln más fácil',
      h2Em: 'para la siguiente.',
      lead: 'Cada vez que Axolotl resuelve algo en una escuela, aprende qué funcionó: qué oficina, qué formulario, cuánto tardó. La escuela lo revisa y lo hace oficial. La siguiente familia solo dice que sí. Los datos personales de nadie entran ahí.',
      steps: [
        { tag: 'Una familia', text: 'Axolotl encuentra un camino que funciona.' },
        { tag: 'Muchas familias', text: 'Sigue funcionando, así que queda comprobado.' },
        { tag: 'La escuela', text: 'Lo hace oficial y promete qué tan rápido.' },
      ],
      link: '¿Diriges una escuela? Haz oficial tu primer camino',
      // Un camino ilustrativo en la escuela de ejemplo. Las cifras muestran lo que
      // registra un camino; no son resultados medidos, y el encabezado dice "Ejemplo".
      card: {
        eyebrow: 'Ejemplo \u00b7 Primaria Lincoln',
        version: 'Camino v2',
        title: 'Cambiar quién recoge en un día de salida temprana',
        doLabel: 'Lo que haces',
        doText: 'Le escribes a Axolotl quién recoge. Dices que sí al mensaje.',
        happensLabel: 'Lo que pasa',
        happensText: 'La oficina lo recibe antes de las 11 y lo confirma el mismo día.',
        stats: [
          { v: '31', l: 'familias lo usaron' },
          { v: '31', l: 'confirmadas' },
          { v: '2:10 h', l: 'espera típica' },
        ],
        neverLabel: 'Nunca se comparte',
        neverText: 'Por qué lo pediste. Detalles de custodia. Nada más que el nombre y el teléfono del adulto.',
        stamp: { top: 'Oficial', name: ['Dirección', 'Ruiz'], date: '2 oct' },
        stampAlt: 'Hecho oficial por la dirección de la escuela (Ruiz) el 2 de octubre',
      },
      moreLabel: 'Más caminos en Lincoln',
      more: [
        { name: 'Reportar una ausencia', status: 'oficial', official: true },
        { name: 'Pedir transporte', status: 'oficial, 5 días', official: true },
        { name: 'Medicamentos en la escuela', status: 'comprobado' },
        { name: 'Intérprete para una reunión', status: 'comprobado' },
        { name: 'Ver el expediente de tu hijo', status: 'nuevo' },
      ],
      note: 'Los caminos escolares llegan primero a nuestras escuelas piloto.',
    },
    dinner: {
      time: '6:30 PM',
      label: 'La cena',
      h2Plain: 'Quién se encarga de qué',
      h2Em: 'esta semana.',
      lead: 'Tu círculo son las pocas personas con las que ya te echas la mano: la niñera, la abuela, la mamá o el papá que conociste en el fútbol. Dile a Axolotl qué necesitas. Les pregunta, reparte quién hace qué y les recuerda a todos.',
      weekLabel: 'Esta semana',
      week: [
        { day: 'Lun', who: 'Tú' },
        { day: 'Mar', who: 'Tú' },
        { day: 'Mié 1:20', who: 'Dana', set: true },
        { day: 'Jue', who: 'Abuela' },
        { day: 'Vie', who: 'Sam', set: true },
      ],
      rules: [
        { h: 'Todos dicen que sí.', p: 'Nadie entra sin aceptar. Cualquiera puede salirse cuando quiera.' },
        { h: 'El plan, no el motivo.', p: 'Tu círculo ve quién recoge y cuándo. Nunca por qué lo pediste.' },
        { h: 'En cualquier idioma.', p: 'Dana escribe en inglés, y tú lo lees en español.' },
      ],
      soon: 'Muy pronto \u00b7 Círculos',
      circles: 'Únete al piloto y serás de los primeros en crear uno.',
    },
    night: {
      time: '9:40 PM',
      label: 'Los niños ya duermen',
      h2Plain: 'Todo',
      h2Em: 'resuelto.',
      lead: 'En lugar de una mesa llena de formularios, un solo resumen: qué se mandó, qué confirmó la escuela y qué sigue pendiente.',
      summaryLabel: 'Hoy, en un resumen',
      summary: [
        { title: 'Formularios de salud de Leo', detail: 'Lincoln confirmó · K-1042', done: true },
        { title: 'Salida al mediodía', detail: 'La abuela recogió a Leo · se avisó a la oficina', done: true },
        { title: 'Transporte a Lincoln', detail: 'Solicitado · el distrito tiene 10 días', done: false },
        { title: 'Evaluación de lectura de Maya', detail: 'Solicitada · el plazo empezó el 30 de sep.', done: false },
      ],
      doneWord: 'Listo',
      waitingWord: 'Esperando a la escuela',
      promises: [
        { title: 'Tu sí lo manda.', body: 'Cada correo, formulario y solicitud espera un sí explícito. Una sugerencia no es permiso.' },
        { title: 'Listo significa confirmado.', body: 'Solo cuenta la confirmación de la propia escuela. Si no puede confirmar, te lo dice y te da el enlace.' },
        { title: 'Nunca se vende.', body: 'La información de tu familia es tuya. Nunca te pide la contraseña del portal escolar.' },
      ],
      links: [
        { label: 'Lee todos los límites, en palabras simples', href: '/security' },
        { label: 'Cómo manejamos la información', href: '/privacy' },
      ],
      closePlain: 'Lo de mañana',
      closeEm: 'ya está resuelto.',
    },
  },

  hero: {
    h1: 'Toda familia merece un agente.',
    sub: 'Axolotl es el agente de tu familia para la escuela. Lee lo que manda la escuela, se encarga de los formularios y de quién recoge a los niños, y consigue la ayuda que le corresponde a tu hijo. Solo mándale un mensaje. Nada se envía sin tu sí.',
    primary: 'Únete al piloto',
    secondary: 'Ver cómo funciona',
    trust:
      'Gratis durante el piloto, en inglés o español.',
    // The hero visual is the thread the parent actually gets: Axolotl's weekly
    // triage, the parent's yes, and the school's confirmation. Plain text only.
    phone: {
      meta: 'Hoy',
      metaTime: '7:15 AM',
      thread: [
        { in: 'Llegaron ocho correos de la escuela esta semana. Dos cosas necesitan tu atención.' },
        { out: 'Hoy tengo juntas todo el día. ¿Puedes encargarte?' },
        { in: 'Ya voy. El formulario de excursión de Maya vence el viernes; ya lo llené.' },
        { out: 'Envíalo.' },
        { in: 'Enviado. Lincoln confirmó que lo tiene \u2014 referencia K-1042.' },
        { in: 'La salida temprana del miércoles a la 1:20 sigue sin cubrir. ¿Le pido a la abuela que los recoja?' },
        { out: 'Sí, por favor. Eres lo máximo.' },
        { in: 'Le pregunté. La abuela dice que ella los recoge.' },
        { in: 'El transporte de Leo a Lincoln entró al distrito bajo McKinney-Vento. Tienen diez días para responder.' },
        { in: 'La evaluación de lectura de Maya también está solicitada: su reloj empezó el 30 de septiembre.' },
        { in: 'El resto es solo información: día de fotos, la feria del libro, la semana de espíritu.' },
      ],
      alt: 'Conversación de texto en un teléfono. Axolotl dice que llegaron ocho correos y que dos cosas necesitan a la familia. La familia, en juntas todo el día, le pide a Axolotl que se encargue. Axolotl llenó el formulario de excursión de Maya y lo envía con el visto bueno de la familia, luego confirma que Lincoln lo tiene, referencia K-1042, y avisa que la salida temprana del miércoles sigue sin cubrir; con el sí de la familia le pregunta a la abuela, que dice que ella los recoge.',
    },
    // El teléfono ya no dibuja la carpeta, pero la tarjeta social (share.html)
    // sí, así que sus filas viven aquí.
    folder: {
      label: 'La familia Howard',
      tab: 'Howard',
      listLabel: 'Lo que hay en esta carpeta',
      annotation: 'solo falta tu sí',
      rows: [
        {
          label: 'Miércoles: salida temprana a la 1:20',
          detail: 'La abuela recoge a Leo. Ella confirmó.',
          status: 'confirmed',
        },
        {
          label: 'Formulario de excursión, entrega el viernes',
          detail: 'Lleno para Maya. Listo para enviar.',
          status: 'waiting',
          annotated: true,
        },
        {
          label: 'Transporte a Lincoln',
          detail: 'Solicitado al distrito bajo McKinney-Vento.',
          status: 'requested',
        },
        {
          label: 'Evaluación de lectura de Maya',
          detail: 'Solicitada el 30 de septiembre. El reloj del distrito ya empezó.',
          status: 'requested',
        },
        {
          label: 'Recogida del viernes',
          detail: 'Dana lleva a los cuatro niños. Todas las familias dijeron sí.',
          status: 'soon',
          tag: 'Círculos',
        },
      ],
    },
  },

  statuses: {
    confirmed: 'Confirmado',
    waiting: 'Esperando tu sí',
    requested: 'Solicitado, esperando al distrito',
    reminder: 'Recordatorio puesto',
    soon: 'Próximamente',
  },

  week: {
    h2: 'Mantiene la semana en marcha.',
    lead: 'Las salidas tempranas, los días de enfermedad y los pendientes pequeños que dan por hecho que alguien está en casa a la 1:20.',
    stepsLabel: 'Lo que hizo',
    shotAlt: 'Una conversación de texto con Axolotl:',
    you: 'Tú',
    prev: 'Anterior',
    next: 'Siguiente',
    trackLabel: 'La semana, una pantalla a la vez',
    preview: { domain: 'lincoln.k12.us', title: 'Boletín semanal de Lincoln' },
    meta: 'Hoy',
    cols: [
      {
        h3: 'Días libres y salidas tempranas',
        time: '7:15',
        steps: [
          'Leí el calendario del distrito.',
          'Lo comparé con tus turnos.',
          'Le escribí a la abuela con tu sí.',
        ],
        turns: [
          { in: 'Salió el calendario del distrito. El miércoles la salida es a la 1:20.' },
          { out: 'No puedo recogerlos, tengo reuniones hasta las 3.' },
          { in: 'La abuela es la primera en tu lista de respaldo. ¿Le escribo?' },
          { out: 'Por favor.' },
          { in: 'Le mando esto: «¿Puedes recoger a Leo y a Maya el miércoles? Salen a la 1:20.»' },
          { out: 'Sí' },
          { in: 'Enviado. La abuela dice que ella los recoge.' },
          { in: 'Le avisé a la oficina que ella pasa por ellos.' },
          { out: 'Eres lo máximo.' },
          { in: 'El miércoles al mediodía te confirmo que todo sigue en pie.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Cambios del mismo día',
        time: '11:48',
        steps: [
          'La escuela avisó: salida al mediodía.',
          'Revisé tu calendario: reuniones hasta las 3.',
          'Le escribí a la abuela y avisé a la oficina.',
        ],
        turns: [
          { in: 'Lincoln escribió. Hoy salen al mediodía.' },
          { in: 'Faltan doce minutos.' },
          { out: 'No puedo salir. Tengo reuniones hasta las 3.' },
          { in: 'La abuela es la primera en tu lista de respaldo. ¿Le escribo esto?: «¿Puedes recoger a Leo y a Maya al mediodía? Lincoln adelantó la salida.»' },
          { out: 'Sí, rápido.' },
          { in: 'Enviado. La abuela dice que ya va para allá.' },
          { in: '¿Le escribo a la oficina que ella los recoge?' },
          { out: 'Sí, y pide que manden a Leo a la oficina.' },
          { in: 'Enviado. La oficina confirmó. Leo la espera en la entrada.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Los pendientes pequeños',
        time: '16:05',
        steps: [
          'El jueves es día de pijama.',
          'El formulario de la excursión es para el viernes.',
          'Redactó la nota de ausencia de Leo.',
        ],
        turns: [
          { in: 'Tres cosas esta semana: el jueves es el día de pijama, el formulario de la excursión vence el viernes, y Leo necesita una nota de ausencia.' },
          { out: 'El lunes tiene dentista en la mañana.' },
          { in: 'Entonces escribo la nota de ausencia para el lunes y lleno el formulario.' },
          { out: '¿Necesitas algo de mí?' },
          { in: 'Solo un sí. Lo demás ya lo tengo.' },
          { in: 'Listo para enviar: la nota de ausencia y el formulario de Maya.' },
          { out: 'Sí' },
          { in: 'Los dos enviados. La oficina confirmó que los tiene.' },
          { out: '¿Y el día de pijama?' },
          { in: 'Nada que hacer: solo va en pijama. Te recuerdo el jueves en la mañana.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Quién se encarga',
        time: '18:30',
        steps: [
          'Recogida de Leo el miércoles: la abuela.',
          'El formulario de Maya: tú.',
          'Dentista el jueves: Sam.',
        ],
        turns: [
          { in: 'Así va la semana.' },
          { in: 'Recogida del miércoles: la abuela. El formulario de Maya: tú. Dentista el jueves: Sam.' },
          { out: '¿Puedes confirmar con Sam lo del jueves?' },
          { in: '¿Le escribo a Sam?: «¿Sigue en pie llevar a Leo al dentista el jueves a las 4?»' },
          { out: 'Sí' },
          { in: 'Enviado. Sam dice que sí, a las 4.' },
          { out: '¿Y el viernes? Puede que salga tarde.' },
          { in: 'El viernes sigue sin cubrir. Dana es la siguiente en tu lista. ¿Le pregunto?' },
          { out: 'Sí.' },
          { in: 'Le pregunté. Te aviso lo que diga.' },
        ],
        status: 'confirmed',
      },
    ],
  },

  how: {
    h2: 'Nada sale hasta que digas sí.',
    lead: 'Ocho correos de la escuela, una fecha límite que importa y dos formularios que tienen que regresar.',
    steps: [
      {
        title: 'Detecta la fecha límite.',
        body: 'Siete de los ocho correos son solo información. Uno necesita tu atención, con la fecha incluida.',
      },
      {
        title: 'Hace el trabajo.',
        body: 'Encuentra una cita dentro de la red y llena los dos formularios.',
      },
      {
        title: 'Espera tu sí.',
        body: 'Ves exactamente lo que va a enviar. Tu sí es lo que lo envía.',
      },
      {
        title: 'Hecho quiere decir confirmado.',
        body: 'Solo da algo por terminado cuando la escuela lo confirma.',
      },
    ],
    stepsLabel: 'Cómo funciona, en orden',
    phone: {
      contact: 'Axolotl',
      meta: 'Hoy',
      metaTime: '4:02 PM',
      who: 'Axolotl: ',
      whoParent: 'Familia: ',
      thread: [
        {
          kind: 'in',
          text: 'La escuela de Leo mandó una nota. Algo necesita tu atención: kínder pide examen físico y dental antes del 15 de octubre.',
        },
        { kind: 'in', text: 'A Leo le faltan los dos.' },
        { kind: 'out', text: 'Ay. ¿Puedes encargarte?' },
        {
          kind: 'in',
          text: 'Ya voy. Su físico está cubierto en la red, y hay lugar el jueves a las 4:10.',
        },
        { kind: 'in', text: 'Llené los dos formularios mientras estaba ahí.' },
        { kind: 'out', text: '¿Tengo que sacarlo de la escuela?' },
        { kind: 'in', text: 'No \u2014 las 4:10 son después de la salida. Agendo la cita y envío los formularios.' },
        {
          kind: 'in',
          text: 'Listo para enviar: Leo Howard, kínder, físico y dental.',
        },
        { kind: 'out', text: 'Sí' },
        {
          kind: 'in',
          text: 'Agendado y enviado. La Primaria Lincoln lo confirmó. Referencia K-1042.',
        },
      ],
      caption: 'Conversación de ejemplo. Escuela y familia ficticias.',
      alt: 'Conversación de texto en un teléfono: Axolotl dice que Leo necesita un examen físico y uno dental antes del 15 de octubre. La familia le pide que se encargue. Axolotl encuentra una cita en la red, llena los dos formularios y muestra los datos listos para enviar. La familia responde Sí, y Axolotl confirma que la Primaria Lincoln lo aceptó, referencia K-1042.',
    },
    channel: {
      line: 'Un solo número. Sin app, sin portal. En inglés o español.',
      label: 'Cosas que mandan las familias',
      items: [
        { kind: 'text', text: 'Fwd: Boletín semanal de Lincoln' },
        { kind: 'photo', text: 'Foto de un formulario' },
        { kind: 'text', text: '¿El distrito tiene escuela de verano?' },
        { kind: 'text', text: 'Leo no va hoy, está enfermo.' },
      ],
    },
  },

  circles: {
    h2: 'Coordina sin esfuerzo con la gente en la que ya confías.',
    soon: 'Próximamente',
    lead: 'Tu círculo es la gente que ya te ayuda: tu pareja, tu mamá, la niñera, las familias con las que te turnas. Pronto, Axolotl los mete en un solo plan — pregunta con tus palabras, reparte quién hace qué, y solo lo cierra cuando todos dicen que sí. Las recogidas son el principio, no todo.',
    chat: {
      alt: 'Ejemplo de chat grupal en Mensajes, con un círculo. La familia dice que el miércoles salen a la 1:20 y pregunta si alguien puede recoger a Maya. Axolotl les pregunta a Dana y a Sam. Dana responde en inglés y Axolotl lo traduce: puede, si alguien cubre su viernes. Sam se encarga del viernes. Axolotl confirma el plan y avisa que les recordará esa mañana. La abuela ofrece el jueves y Axolotl lo agrega a la semana.',
      group: 'Tú, Dana, Sam, Abuela',
      meta: 'Hoy',
      metaTime: '6:31 p.m.',
      messages: [
        { from: 'Tú', out: true, text: 'El miércoles salen a la 1:20 y trabajo hasta las 3. ¿Alguien puede recoger a Maya?' },
        { from: 'Axolotl', text: 'Dana, Sam: ¿alguno está libre el miércoles a la 1:20?' },
        { from: 'Dana', text: 'I can, if someone covers my Friday.' },
        { from: 'Axolotl', text: 'Dana dice: \u201cYo puedo, si alguien cubre mi viernes.\u201d' },
        { from: 'Sam', text: 'Yo me encargo del viernes de Dana.' },
        { from: 'Axolotl', text: 'Listo: Dana el miércoles, Sam el viernes. Les recuerdo a los dos esa mañana.' },
        { from: 'Abuela', text: 'Y yo puedo el jueves si alguien lo necesita.' },
        { from: 'Tú', out: true, text: 'Son los mejores.' },
        { from: 'Axolotl', text: 'Ya quedó en la semana. Todo cubierto.' },
      ],
    },
    listLabel: 'Cómo funcionan los círculos',
    list: [
      'Nunca necesitas un círculo para recibir toda la ayuda.',
      'Un círculo solo ve el plan, nunca por qué una familia necesita ayuda.',
      'Nada se acuerda hasta que todos digan sí.',
      'No son solo las recogidas: días de enfermedad, la ida a la escuela, cambios de cita, y compartir lo que averiguaste sobre una maestra o un programa.',
      'Cada quien lee y escribe en su propio idioma.',
      'Si el distrito le debe transporte a tu familia, Axolotl le pregunta primero al distrito.',
      'Axolotl coordina. No maneja; las familias deciden.',
    ],
    // The ring sketch: families who already trade pickups, around one plan.
    // No ticks, no counts — nobody keeps score.
    form: {
      legend: 'Empieza un círculo',
      phoneLabel: 'Tu número de teléfono',
      familiesLabel: '¿Cuántas familias?',
      familiesOptions: ['2 a 3', '4 a 6', '7 o más'],
      schoolLabel: 'Escuela',
      schoolHint: '(opcional)',
      submit: 'Empezar un círculo',
      note: 'Te escribimos cuando abran los círculos.',
      success: 'Ya estás en la lista. Te escribimos cuando abran los círculos.',
      errors: {
        phone: 'Escribe un número de 10 dígitos de EE. UU.',
        families: 'Elige cuántas familias.',
        generic: 'No pudimos guardar tu registro. Inténtalo de nuevo.',
      },
    },
  },

  voices: {
    h2: 'De familias en el piloto.',
    quotes: [],
  },

  join: {
    h2: 'Únete al piloto.',
    lead: 'Estamos incorporando a un grupo pequeño de familias. Agrega tu número y te escribimos sobre el acceso. Gratis durante el piloto, en inglés o español.',
    phoneLabel: 'Tu número de teléfono',
    submit: 'Únete al piloto',
    note: 'Al unirte, aceptas recibir mensajes sobre el acceso.',
    circleLink: 'Mejor empieza un círculo',
    questionLink: '¿Tienes una pregunta primero?',
    success: 'Ya estás en la lista. Te escribimos al {phone}.',
    error: 'Escribe un número de 10 dígitos de EE. UU.',
    generic: 'No pudimos guardar tu registro. Inténtalo de nuevo.',
  },

  schoolsBand: {
    h2: 'Para escuelas y distritos.',
    body: 'Cada familia recibe un agente, y tu oficina deja de perseguir: justificaciones de ausencia entregadas, formularios completos, solicitudes en la oficina correcta, y menos faltas cuando tu escuela se conecta. Nada que instalar.',
    link: 'Cómo trabaja Axolotl con las escuelas',
  },

  contact: {
    h2: 'Preguntas.',
    lead: 'Pregunta por el piloto o pregunta cómo funciona. Guardamos tu mensaje y contestamos por correo.',
    emailLabel: 'Correo electrónico',
    messageLabel: '¿Qué quieres preguntar?',
    messageHint: '(opcional)',
    submit: 'Enviar',
    note: 'Usamos estos datos para contestarte. Por favor no incluyas expedientes de tu hijo, información médica ni contraseñas escolares.',
    privacyLink: 'Cómo manejamos los datos del sitio',
    success: 'Tu mensaje quedó guardado. Contestamos al correo que nos diste.',
    error: 'No pudimos guardar tu mensaje. Inténtalo de nuevo.',
  },

  websitePrivacy: {
    summary: 'Privacidad del sitio',
    h2: 'Lo que compartes aquí.',
    blocks: [
      {
        h3: 'Lo que nos mandas',
        body: 'Recolectamos el correo y el mensaje que envías para poder contestarte. Las consultas se guardan en nuestra base de datos. Por favor no mandes expedientes de tu hijo, información médica ni contraseñas escolares.',
      },
      {
        h3: 'La lista del piloto y las solicitudes escolares',
        body: 'Un registro de familia o de círculo nos da tu número de teléfono, y el de círculo también dice cuántas familias y, si quieres, tu escuela. Una solicitud de piloto escolar nos da tu nombre, tu puesto, tu escuela o distrito y tu correo. Todo se guarda en nuestra base de datos. Un proveedor de mensajes puede procesar tu número para mandarte un texto de confirmación.',
      },
      {
        h3: 'Este sitio no es el servicio',
        body: 'Estos formularios no se conectan con tu escuela ni con los expedientes de tu hijo. El sitio carga tipografías de Google Fonts, así que tu navegador hace solicitudes a Google y a nuestro proveedor de hosting cuando visitas la página. Cómo maneja el servicio la información de tu familia está en la política de privacidad.',
      },
      {
        h3: '¿Preguntas sobre tu información?',
        body: 'Usa el formulario de arriba para preguntas de privacidad o para pedir algo sobre la información que enviaste.',
      },
    ],
    link: 'Leer la política de privacidad del servicio',
  },

  footer: {
    tagline: 'El agente escolar para las familias',
    links: [
      { label: 'Contacto', href: '#contact' },
      { label: 'Privacidad', href: '/privacy' },
      { label: 'Seguridad y confianza', href: '/security' },
    ],
  },

  schools: {
    meta: {
      title: 'Axolotl para escuelas y distritos',
      description:
        'Axolotl es un agente gratuito al que las familias le escriben por texto. Tu oficina deja de perseguir formularios, de llamar por ausencias y de reenviar solicitudes, y menos niños faltan. Tu personal decide la forma oficial de hacer cada trámite.',
      shareAlt: 'Una carpeta de manila con pendientes escolares y un sello de Confirmado en la primera fila.',
    },
    hero: {
      eyebrow: 'Para directores y distritos',
      h1Plain: 'Cada familia recibe un agente.',
      h1Em: 'Tu oficina deja de perseguir.',
      sub: 'Axolotl es un agente gratuito al que las familias le escriben por texto. Termina el formulario, entrega la justificación de ausencia, contesta preguntas de rutina con tu propia información, y manda cada solicitud completa a la oficina correcta. Conecta tu escuela y conoce tu calendario, tu asistencia y tus reglas, para que menos niños falten.',
      primary: 'Hablemos de un piloto',
      secondary: 'Ver lo que recupera tu oficina',
    },
    office: {
      h2Plain: 'El trabajo que tu oficina hace dos veces,',
      h2Em: 'hecho una sola.',
      lead: 'Casi todo el día de una oficina escolar es ir y venir: llamar por una ausencia, perseguir un formulario, reenviar una solicitud, contestar la misma pregunta otra vez. Es el mismo trabajo en el que las familias están atoradas del otro lado. Axolotl quita el ir y venir para los dos.',
      head: ['Hoy', 'Con Axolotl', 'Quién recupera tiempo'],
      rows: [
        {
          pain: 'Llamar a casa por las ausencias',
          does: 'La familia escribe “está enferma” y Axolotl entrega la justificación en tu formato. Sin llamada, y tus cifras de faltas justificadas e injustificadas quedan bien.',
          who: 'Personal de asistencia',
        },
        {
          pain: 'Perseguir formularios',
          does: 'Permisos, contactos de emergencia, solicitudes de comidas y cartillas de vacunas regresan completos, antes de la fecha límite.',
          who: 'Oficina principal, enfermería',
        },
        {
          pain: 'Paquetes de inscripción incompletos',
          does: 'Un paquete completo, siguiendo la lista que aprobó tu personal de registro.',
          who: 'Registro escolar',
        },
        {
          pain: 'La misma pregunta cuarenta veces',
          does: '“¿Cuándo es la salida temprana?” se contesta con tus propios avisos. Tu personal ni la ve.',
          who: 'Oficina principal, maestros',
        },
        {
          pain: 'Solicitudes en el escritorio equivocado',
          does: 'Transporte, educación especial, el enlace de McKinney-Vento o enfermería la reciben directo, con el estudiante ya identificado.',
          who: 'Oficina principal, dirección',
        },
        {
          pain: 'Buscar a alguien que hable el idioma',
          does: 'Tu personal escribe en inglés; las familias leen y contestan en su idioma.',
          who: 'Todos',
        },
        {
          pain: 'Agendar juntas a base de llamadas',
          does: 'Las juntas de educación especial y las conferencias se agendan alrededor de los turnos de la familia en un solo intercambio.',
          who: 'Educación especial, maestros',
        },
        {
          pain: 'Cartas largas escritas con IA',
          does: 'Una solicitud corta y ordenada que dice qué necesita la familia.',
          who: 'Dirección, educación especial',
        },
      ],
    },
    door: {
      h2Plain: 'La misma familia, la misma necesidad.',
      h2Em: 'Una solicitud que sí puedes atender.',
      lead: 'Una mamá preocupada por el habla de su hija le pide ayuda a una IA. Sin puerta de entrada, llega una carta legal a todos los que están en el correo. Con Axolotl, la oficina correcta recibe una solicitud que puede atender hoy.',
      example: 'Ejemplo',
      before: {
        label: 'Sin puerta de entrada',
        to: 'Para: Dirección · Cc: Superintendencia, Consejo escolar',
        subject: 'SOLICITUD FORMAL conforme a IDEA, la Sección 504 y FERPA',
        body: 'Estimada directora Ruiz: Por medio de la presente solicito formalmente, conforme a la Ley de Educación para Personas con Discapacidades (20 U.S.C. § 1400 y siguientes) y la Sección 504 de la Ley de Rehabilitación de 1973, una evaluación multidisciplinaria integral de mi hija en todas las áreas de posible discapacidad, y solicito además que se conserven todos los expedientes…',
        foot: ['1380 palabras', '3 leyes citadas', 'Sin grado ni salón', 'Enviada a la dirección'],
      },
      after: {
        label: 'Con Axolotl',
        to: 'Para: Coordinación de educación especial',
        rows: [
          ['Solicitud', 'Evaluación de habla y lenguaje'],
          ['Estudiante', 'Maya R., 2.º grado, salón 12'],
          ['Lo que ve la familia', 'A veces cuesta entenderle; se frustra al leer en voz alta.'],
          ['Adjunto', 'Consentimiento firmado para evaluar'],
          ['La familia prefiere', 'Texto, en español, después de las 5 PM'],
        ],
        sent: 'Enviada con el sí de la familia · 7:42 PM',
        foot: ['64 palabras', 'Una oficina', 'Lista para atender'],
      },
      tensionTitle: 'Más solicitudes, menos idas y vueltas.',
      tensionBody:
        'Las familias que por fin saben qué pedir van a pedir, y la IA hace que pedir sea más fácil que nunca. La promesa honesta no es menos solicitudes. Es que cada una llegue completa, a la oficina que la puede resolver, y tome un intercambio en vez de cinco.',
    },
    attendance: {
      h2Plain: 'Menos días perdidos,',
      h2Em: 'una familia a la vez.',
      lead: 'Una ventana de chat no arregla la asistencia. Saber el número real, recibir una respuesta clara a las 6:45 AM y quitar lo que deja a un niño en casa, sí.',
      items: [
        {
          h: 'El número real, dicho con cariño.',
          p: 'Las familias suelen creer que su hijo ha faltado menos de lo que en verdad ha faltado. Axolotl les dice el número real, a tiempo y con apoyo. Nunca con amenazas.',
        },
        {
          h: 'La pregunta de las 6:45 AM.',
          p: '“Tiene mocos, sin fiebre. ¿Puede ir?” Contestada con las reglas de tu propia enfermería, para que el niño que puede estar en la escuela, esté.',
        },
        {
          h: 'El día de la logística.',
          p: 'Salida temprana, un cambio de camión, un turno que se alarga: un plan con el propio círculo de la familia antes de perder el día.',
        },
        {
          h: 'La barrera detrás del patrón.',
          p: 'Cuando las faltas tienen una causa, como el transporte, un plan para el asma o un niño que evita la escuela, la solicitud llega a la oficina que la puede resolver.',
        },
      ],
      research:
        'Decirles a las familias el número real de faltas es una de las pocas intervenciones de asistencia probadas a gran escala (Rogers y Feller, Nature Human Behaviour, 2018). Axolotl agrega la conversación que sigue al mensaje.',
      threadLabel: 'Una mamá, un domingo en la noche',
      thread: [
        {
          from: 'axolotl',
          text: 'Un aviso: Maya ha faltado 7 días desde septiembre, casi todos lunes. A este paso serían unos 18 este año. ¿Algo hace difíciles los lunes?',
        },
        { from: 'parent', text: 'Los lunes entro a las 6. Nadie la puede llevar.' },
        {
          from: 'axolotl',
          text: 'Dana, de tu círculo, pasa por Lincoln a las 7:40 los lunes. ¿Le pregunto? También puedo preguntar a transporte si Maya califica para el camión.',
        },
        { from: 'parent', text: 'Sí a las dos.' },
      ],
    },
    flywheel: {
      h2Plain: 'Cada semana',
      h2Em: 'es más fácil.',
      lead: 'Cada trámite que Axolotl termina hace más ligero el siguiente, para la próxima familia y para tu oficina.',
      steps: [
        { tag: 'Una familia escribe lo que necesita', text: 'En su idioma, a las 10 PM, después del turno.' },
        { tag: 'Axolotl lo hace bien a la primera', text: 'Completo, en tu formato, a la oficina correcta. La familia lo aprueba.' },
        { tag: 'Tu oficina recibe una solicitud limpia', text: 'Sin perseguir, sin reenviar, sin descifrar.' },
        { tag: 'Tu personal hace oficial la ruta', text: 'Una respuesta. Treinta segundos en vez de cuarenta llamadas.' },
        { tag: 'La siguiente familia la sigue', text: 'Más rápido y con menos errores. Tú la promueves porque le ahorra tiempo a tu personal.' },
        { tag: 'El resumen muestra dónde se atoran', text: 'Arreglas la causa, como un aviso más claro o un formulario más corto, y la pregunta deja de llegar.' },
      ],
      example: {
        label: 'Ejemplo · inscripción a mitad de año',
        beforeLabel: 'Idas y vueltas hoy',
        before: 5,
        afterLabel: 'Con una ruta oficial',
        after: 1,
      },
      note: 'En todo un distrito, las rutas oficiales forman un manual de cómo funcionan tus escuelas. Tu personal decide qué incluye, y puede publicarlo para que cualquier asistente de IA que use una familia mande una solicitud completa a la oficina correcta.',
    },
    paths: {
      h2Plain: 'Tu personal decide',
      h2Em: 'cómo se hacen las cosas.',
      lead: 'Una ruta es la forma oficial de hacer un trámite en tu escuela: qué manda la familia, qué oficina lo atiende y cuándo recibe respuesta. Axolotl aprende las rutas de familias reales. Tu personal las hace oficiales.',
      steps: [
        { tag: 'Aprendida', text: 'Axolotl ve lo que de verdad les funcionó a las familias de tu escuela: qué formulario, qué oficina, qué respuesta llegó.' },
        { tag: 'Aprobada', text: 'Alguien de tu personal revisa la ruta, corrige lo que esté mal y la hace oficial con una sola respuesta.' },
        { tag: 'Seguida', text: 'Cada familia que viene después sigue la forma oficial, en su idioma, con un tiempo de espera honesto.' },
      ],
      card: {
        eyebrow: 'Ejemplo · Lincoln Elementary',
        version: 'Ruta v3',
        title: 'Inscribir a un estudiante a mitad de año',
        doLabel: 'La familia manda',
        doText: 'Comprobante de domicilio, acta de nacimiento y cartilla de vacunas, en un solo paquete. Fotos del teléfono están bien.',
        happensLabel: 'Tu oficina',
        happensText: 'Registro escolar recibe un paquete completo y confirma la fecha de inicio en dos días de clases.',
        stats: [
          { v: '48', l: 'familias la usaron' },
          { v: '2 días', l: 'respuesta prometida' },
          { v: '0', l: 'a la oficina equivocada' },
        ],
        neverLabel: 'Nunca pide:',
        neverText: 'estatus migratorio ni número de Seguro Social. Tu escuela no puede exigir ninguno de los dos para inscribir.',
        stamp: { top: 'Oficial', name: ['Registro', 'Okafor'], date: 'Ago 2026' },
        stampAlt: 'Hecha oficial por Okafor, de registro escolar, agosto de 2026',
      },
    },
    staff: {
      h2Plain: 'Tu personal también lo usa,',
      h2Em: 'desde el primer día.',
      lead: 'Directores, personal de registro y maestros le escriben a Axolotl igual que las familias. Pregunta en qué se atoran, corrige una ruta con tus palabras, traduce un aviso, o pregunta quién debe todavía un formulario.',
      threadLabel: 'Personal de registro, escribiéndole a Axolotl',
      thread: [
        { from: 'staff', text: '¿En qué se están atorando las familias esta semana?' },
        { from: 'axolotl', text: 'Inscripción: 6 familias no sabían qué cuenta como comprobante de domicilio. Todo lo demás se contestó con tu aviso del lunes.' },
        { from: 'staff', text: 'Sirve un contrato de renta o cualquier recibo de servicios. Agrégalo.' },
        { from: 'axolotl', text: 'Listo, la ruta de inscripción ya es v4. ¿Les aviso a esas 6 familias?' },
        { from: 'staff', text: 'Sí, por favor.' },
      ],
      brief: {
        eyebrow: 'Resumen del lunes · Lincoln Elementary',
        example: 'Ejemplo',
        rows: [
          { v: '31', l: 'preguntas de rutina contestadas con tu propia información', note: 'Camión, calendario, qué llevar' },
          { v: '14', l: 'familias preguntaron por el cambio de la ruta 9', note: 'Contestado con tu aviso' },
          { v: '6', l: 'familias atoradas con el comprobante de domicilio', note: 'Ruta actualizada a v4' },
        ],
        foot: 'Patrones, no personas. El resumen nunca muestra quién preguntó ni qué dijo.',
      },
    },
    connect: {
      h2Plain: 'Conecta tu escuela,',
      h2Em: 'y el agente de cada familia la conoce.',
      lead: 'Axolotl funciona para las familias sin ti. Conectado, deja de adivinar: contesta con tu información e invita a las familias que te preocupan.',
      head: ['Lo que compartes', 'Lo que reciben las familias'],
      rows: [
        ['Asistencia diaria', 'El número real de faltas de su hijo, a tiempo y con apoyo'],
        ['Las reglas de enfermería', 'Una respuesta clara en las mañanas de enfermedad'],
        ['Calendario y rutas de camión', 'Salidas tempranas y cambios de ruta, sin llamarte'],
        ['Directorio de oficinas y personal', 'Cada solicitud a la persona correcta, con el estudiante ya identificado'],
        ['Lista de estudiantes con teléfonos de las familias', 'Una invitación de su propia escuela, y siempre el niño correcto'],
      ],
      ruleTitle: 'La información va hacia las familias, no sale de ellas.',
      ruleBody:
        'Tus datos ayudan a cada familia con su propio hijo. Sus conversaciones con Axolotl nunca regresan a ti, a menos que decidan enviarte algo. Tu personal ve patrones, nunca personas.',
      start:
        'Se empieza con un archivo nocturno, no con un proyecto de integración, bajo un acuerdo de privacidad estudiantil.',
    },
    never: {
      h2: 'Lo que Axolotl nunca va a hacer.',
      items: [
        { title: 'Reportar sobre las familias.', body: 'Tu personal solo ve lo que la familia decide enviar. El resumen muestra patrones, nunca personas.' },
        { title: 'Vender datos.', body: 'Ni a proveedores, ni a anunciantes, ni a nadie.' },
        { title: 'Hacer oficial una ruta por su cuenta.', body: 'Puede sugerir una ruta. Solo tu personal puede hacerla oficial.' },
        {
          title: 'Inventar una respuesta.',
          body: 'Las respuestas de rutina salen de la información que tu escuela publica. Cuando no está seguro, lo dice y manda la pregunta a quien le toca.',
        },
        {
          title: 'Reemplazar a tu personal ni tus obligaciones.',
          body: 'Ayuda a las familias a usar lo que tu escuela ya ofrece.',
        },
        {
          title: 'Enviar algo sin el sí de la familia.',
          body: 'Cada mensaje y cada formulario espera la aprobación de la familia.',
        },
      ],
    },
    equity: {
      h2: 'Acceso y equidad.',
      lead: 'Las familias con menos margen son las primeras para las que esto tiene que funcionar.',
      items: [
        'Inglés y español, escritos para un nivel de lectura sencillo.',
        'Funciona alrededor de los turnos, y pide la opción de noche o por teléfono en vez de una junta a media mañana.',
        'Una familia que nunca ha escrito una carta formal manda la misma solicitud completa y bien dirigida que una con abogado.',
        'Los círculos nunca son obligatorios. Una familia sin nadie con quien intercambiar recogidas recibe toda la ayuda.',
        'Apoya las metas de participación de tu Título I: horarios flexibles, un idioma que las familias entienden, y una revisión anual de lo que sí funcionó.',
      ],
    },
    pilot: {
      h2: 'Un piloto juntos.',
      lead: 'Una escuela, un semestre, y un número de antes en el que puedas confiar.',
      baselineTitle: 'Empezamos contando.',
      baseline:
        'Antes de lanzar nada, pasamos un día en tu oficina contando lo que toma tiempo: llamadas, formularios perseguidos, solicitudes reenviadas, preguntas repetidas. Ese es tu número de antes.',
      measuresLabel: 'Lo que mediríamos',
      measures: [
        'Idas y vueltas por solicitud, contra el número de antes.',
        'Ausentismo crónico entre las familias invitadas, comparado con las familias invitadas después.',
        'Solicitudes que llegaron a la oficina correcta a la primera.',
        'Porcentaje de formularios entregados a tiempo, comparado con el año pasado.',
      ],
      consent:
        'Siempre con el consentimiento de las familias. Las familias deciden unirse, y pueden salir cuando quieran.',
      integration:
        'Conectar datos de asistencia o de la lista de estudiantes requiere primero un acuerdo de privacidad estudiantil firmado.',
      guardrail:
        'Ningún número de resultados hasta que un piloto produzca números reales. Los números en esta página son ejemplos. Vamos a publicar lo que medimos, incluso lo que no funcione.',
    },
    form: {
      h2: 'Hablemos de un piloto.',
      lead: 'Cuéntanos de tu escuela o distrito y te escribimos por correo.',
      nameLabel: 'Tu nombre',
      roleLabel: 'Tu puesto',
      schoolLabel: 'Escuela o distrito',
      emailLabel: 'Correo electrónico',
      messageLabel: '¿Algo que debamos saber?',
      messageHint: '(opcional)',
      submit: 'Enviar',
      note: 'Usamos estos datos para contestarte. Por favor no incluyas expedientes de estudiantes ni información médica.',
      success: 'Tu mensaje quedó guardado. Contestamos al correo que nos diste.',
      error: 'No pudimos guardar tu mensaje. Inténtalo de nuevo.',
      generic: 'Por favor llena todos los campos.',
    },
  },
};
