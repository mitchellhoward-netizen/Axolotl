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
        'Los comediantes tienen agente.',
        'Los influencers tienen agente.',
        'Los gamers profesionales tienen agente.',
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
      h2Plain: 'Cada familia la mejora',
      h2Em: 'para la siguiente.',
      lead: 'Axolotl aprende cómo funciona cada escuela: el calendario, quién se encarga del transporte, qué formularios regresan y qué tan rápido. Eso ayuda a todas las familias de esa escuela. La información personal de nadie se comparte.',
      sharedLabel: 'Se comparte en la escuela',
      shared: ['Salidas tempranas y días libres', 'Quién se encarga del transporte', 'Qué formularios hay y a dónde van', 'Cuánto tarda cada oficina'],
      privateLabel: 'Nunca sale de tu familia',
      private: ['Tus hijos y sus expedientes', 'Tus mensajes', 'Por qué necesitas ayuda', 'Lo que envías'],
      link: '¿Diriges una escuela o distrito? Cómo trabaja Axolotl con las escuelas',
      diagram: {
        alt: 'Diagrama: familias alrededor de la Primaria Lincoln. Lo que cada familia aprende sobre cómo funciona la escuela se suma a una sola imagen compartida.',
        school: ['Primaria', 'Lincoln'],
        family: 'Familia',
        you: 'Tú',
        notes: ['salida temprana 1:20', 'transporte: oficina', 'formularios en 2 días'],
      },
    },
    dinner: {
      time: '6:30 PM',
      label: 'La cena',
      h2Plain: 'Quién se encarga de qué',
      h2Em: 'esta semana.',
      lead: 'Tu pareja, la abuela y la niñera ven el mismo plan, y cada pendiente tiene un nombre.',
      soon: 'Muy pronto · Círculos',
      circles: 'Túrnense para recoger a los niños y cubrir días de enfermedad con las familias en las que confías. Nada queda acordado hasta que todos dicen que sí.',
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
      alt: 'Ejemplo de chat grupal en Mensajes, con la función de círculos. La familia dice que los dos están atorados el miércoles por la salida temprana y pide ayuda. Axolotl reporta que Dana está libre el miércoles y puede llevar a los cuatro niños; Dana acepta si alguien cubre su recogida del viernes, Sam toma el viernes, y Axolotl confirma el plan: Dana el miércoles, Sam el viernes. Luego Sam pregunta al grupo por el programa después de clases.',
      group: 'Tú, Dana, Sam',
      meta: 'Hoy',
      metaTime: '8:02',
      messages: [
        { from: 'Tú', out: true, text: 'El miércoles los dos estamos atorados \u2014 salen a la 1:20. ¿Alguien puede ayudar?' },
        { from: 'Axolotl', text: 'Pregunté en el círculo: Dana está libre el miércoles y puede llevar a los cuatro niños.' },
        { from: 'Dana', text: 'Yo puedo, si alguien cubre mi recogida del viernes.' },
        { from: 'Sam', text: 'Yo me encargo de tu viernes.' },
        { from: 'Dana', text: 'Perfecto. Entonces yo llevo el miércoles.' },
        { from: 'Axolotl', text: 'Queda así: Dana el miércoles, Sam el viernes.' },
        { from: 'Sam', text: 'Otra cosa: ¿alguien ha probado el programa después de clases?' },
        { from: 'Dana', text: 'Sí. Te mando lo que averigüé.' },
        { from: 'Axolotl', text: 'Lo guardo junto a este plan para que nadie tenga que subir a buscarlo.' },
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
    body: 'Axolotl ayuda a tus familias a mantenerse al día: formularios que regresan antes de la fecha límite, preguntas contestadas con tu propia información, y solicitudes que llegan completas, por escrito y a la oficina correcta. Nada que instalar.',
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
        'Axolotl ayuda a las familias a encargarse de lo que la escuela les pide, por texto. Tu personal recibe formularios completos, solicitudes claras y menos preguntas repetidas. Nada que instalar.',
      shareAlt: 'Una carpeta de manila con pendientes escolares y un sello de Confirmado en la primera fila.',
    },
    hero: {
      h1: 'Familias que por fin pueden mantenerse al día.',
      sub: 'Axolotl ayuda a las familias a encargarse de lo que la escuela les pide, por texto, en inglés o español. Tu personal recibe formularios completos, solicitudes claras y menos preguntas repetidas. Nada que instalar.',
      primary: 'Hablemos de un piloto',
    },
    changes: {
      h2: 'Qué cambia para tu personal.',
      lead: 'Axolotl ayuda a tus familias a mantenerse al día, sin agregar nada a la carga de tu personal.',
      head: ['Hoy', 'Con Axolotl', 'Quién se beneficia'],
      rows: [
        {
          pain: 'Formularios y fechas límite sin cumplir',
          does: 'Las familias ven lo único que importa; los formularios regresan completos antes de la fecha límite',
          who: 'Oficina principal, enfermería escolar',
        },
        {
          pain: 'Preguntas repetidas de rutina',
          does: 'Respuestas primero de la información que tu escuela ya publica: camión, calendario, qué llevar',
          who: 'Oficina principal, maestros',
        },
        {
          pain: 'Familias difíciles de contactar',
          does: 'Funciona por texto, en español, alrededor de los turnos de trabajo; pide la opción de noche o por teléfono',
          who: 'Personal de Título I y de participación familiar',
        },
        {
          pain: 'Solicitudes que llegan desordenadas',
          does: 'Las solicitudes de derechos y servicios llegan por escrito, completas, con fecha y dirigidas a transporte, al enlace de McKinney-Vento o a educación especial',
          who: 'Enlaces, educación especial, transporte',
        },
        {
          pain: 'Llegadas tarde y ausencias por logística',
          does: 'Planes de quién recoge ahora, círculos pronto, para que haya menos días de "nadie pudo llevarlos"',
          who: 'Personal de asistencia y transporte',
        },
        {
          pain: 'Programas que nadie reclama',
          does: 'Solicitudes de comidas entregadas; lugares en programas después de clases encontrados y apartados',
          who: 'Servicios de nutrición, programas después de clases',
        },
      ],
    },
    how: {
      h2: 'Cómo trabaja con tu escuela.',
      lead: 'Nada que instalar al principio. Axolotl lee lo que tu escuela ya manda y contesta por los canales de siempre.',
      items: [
        'Lee lo que ya mandas: el boletín semanal, el calendario, el aviso a casa.',
        'Contesta por los canales de siempre, así tu personal no aprende un sistema nuevo.',
        'Manda cada solicitud a la oficina que le toca, no a la recepción.',
        'Solo cuenta algo como hecho cuando tu personal lo confirma.',
      ],
      tensionTitle: 'Van a llegar más solicitudes, no menos.',
      tensionBody:
        'Las evaluaciones, los apoyos y el transporte son obligaciones que tu escuela ya tiene. Axolotl hace que lleguen completas, por escrito y bien dirigidas, así que resuelven con menos tiempo del personal que la misma solicitud repartida en tres llamadas.',
      integration:
        'Si tu distrito quiere una integración más profunda, primero hacen falta el consentimiento explícito de las familias y un acuerdo de privacidad estudiantil. Mientras tanto, Axolotl solo usa lo que las familias deciden reenviarle.',
    },
    never: {
      h2: 'Lo que Axolotl nunca va a hacer.',
      items: [
        { title: 'Reportar sobre las familias.', body: 'Tu personal solo ve lo que la familia decide enviar.' },
        { title: 'Vender datos.', body: 'Ni a proveedores, ni a anunciantes, ni a nadie.' },
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
        'Los círculos nunca son obligatorios. Una familia sin nadie con quien intercambiar recogidas recibe toda la ayuda.',
        'Apoya las metas de participación de tu Título I: horarios flexibles, un idioma que las familias entienden, y una revisión anual de lo que sí funcionó.',
      ],
    },
    pilot: {
      h2: 'Un piloto juntos.',
      lead: 'Un grupo pequeño de familias, una escuela, y algo que de verdad puedas medir.',
      measuresLabel: 'Lo que mediríamos',
      measures: [
        'Porcentaje de formularios entregados a tiempo, comparado con el año pasado.',
        'Días para resolver una solicitud de derechos o servicios.',
        'Participación en juntas y conferencias entre las familias del piloto.',
      ],
      consent:
        'Siempre con el consentimiento de las familias. Las familias deciden unirse, y pueden salir cuando quieran.',
      guardrail:
        'Ningún número de resultados hasta que un piloto produzca números reales. Vamos a publicar lo que medimos, incluso lo que no funcione.',
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
