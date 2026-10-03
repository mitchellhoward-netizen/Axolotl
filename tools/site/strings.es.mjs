/**
 * Todo el texto del sitio en español, en un solo lugar.
 *
 * Misma estructura exacta que strings.en.mjs: el build falla si falta una clave,
 * así que /es no puede quedarse atrás. Pendiente: revisión de una persona que
 * hable español con fluidez antes de publicar (el brief lo pide).
 *
 * Registro: tuteo, frases cortas, palabras de todos los días. Se usa el mismo
 * vocabulario que ya estaba en el sitio ("tu sí", "Medi-Cal", "el condado").
 */

export default {
  lang: 'es',
  locale: 'es_US',

  meta: {
    title: 'Axolotl: toda familia trabajadora merece un agente.',
    description:
      'Axolotl es un número confidencial al que las familias trabajadoras escriben para conseguir todo lo que les corresponde: el cuidado de un papá o una mamá, Medi-Cal y beneficios, permisos del trabajo, la escuela de los niños. Hace el trabajo, una persona de verdad te ayuda cuando se complica, y nada se envía sin tu sí.',
    shareAlt:
      'Una carpeta de manila con la etiqueta "La familia Reyes" con pendientes del cuidado de mamá, beneficios y trabajo, cada uno marcado Confirmado, Esperando tu sí o Solicitado.',
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
    employers: 'Para empleadores',
    join: 'Únete al piloto',
    langSwitch: 'English',
    langSwitchHref: '/',
  },

  exampleCaption:
    'Conversación de ejemplo. Familia y empleador ficticios.',

  // ── La página de inicio, como un día de trabajo ─────────────────────────────
  // Cada sección es un momento del día de una mamá que trabaja, y la luz de la
  // página cambia con él: amanecer, día, tarde dorada, atardecer, noche.
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
      parentsLead: 'Las familias que trabajan tienen',
      parentsTail: 'una pila de cartas y música de espera.',
    },
    morning: {
      time: '5:40 AM',
      label: 'Antes de un turno a las 7',
      h1Plain: 'Toda familia trabajadora merece',
      h1Em: 'un agente.',
    },
    inbox: {
      time: '8:30 AM',
      label: 'En su descanso',
      h2Plain: 'Ocho cartas este mes.',
      h2Em: 'Una que importa.',
      lead: 'El condado, el seguro, recursos humanos, la escuela. Axolotl lo lee todo, encuentra lo que tiene fecha límite, llena el formulario y espera tu sí. Listo significa que lo confirmaron.',
      steps: [
        { tag: 'Lee', body: 'Una foto de una carta, un correo reenviado, un formulario de recursos humanos' },
        { tag: 'Encuentra', body: 'Lo único que tiene fecha' },
        { tag: 'Pregunta', body: 'Ves lo que va a enviar. Tu sí lo envía' },
        { tag: 'Confirma', body: 'Solo cuenta como listo cuando ellos lo confirman' },
      ],
      inboxLabel: 'Este mes · 8 cartas y correos',
      emails: [
        'Seguro: explicación de beneficios',
        'Recursos humanos: inscripción abierta',
        'Condado: renovación de Medi-Cal de mamá, vence el 15 de oct.',
        'Escuela: día de fotos, 3 de oct.',
        'Farmacia: receta lista',
        'Estado de cuenta del banco',
        'Libros de la biblioteca',
      ],
      highlight: 2,
    },
    midday: {
      time: '11:48 AM',
      label: 'Mediodía',
    },
    qualify: {
      time: '3:05 PM',
      label: 'Después del turno',
      h2Plain: 'La ayuda que a tu familia',
      h2Em: 'ya le corresponde.',
      lead: 'Que te paguen por cuidar, ahorros en Medicare, ayuda para comida, permiso pagado. La ayuda existe, pero tienes que saber pedirla, pedirla a la oficina correcta y seguir insistiendo. Axolotl nota cuándo tu familia podría calificar y hace las tres cosas.',
      timelineTitle: 'Una solicitud, de principio a fin',
      steps: [
        {
          when: '2 de oct. · 2:14 PM',
          title: 'La visita al médico',
          kind: 'email',
          from: 'Consultorio de la Dra. Lee · Valley Clinic',
          subject: 'Resumen de la visita de Carmen Reyes',
          before: 'La Sra. Reyes ahora ',
          mark: 'necesita ayuda diaria para bañarse y con sus medicinas',
          after: '. Recomendamos apoyo en casa.',
        },
        {
          when: '3:05 PM',
          title: 'Axolotl ve lo que significa',
          kind: 'text',
          in: 'Tu mamá tiene Medi-Cal y ahora necesita ayuda diaria. Podría calificar para IHSS, y a ti te podrían pagar por cuidarla. ¿Empiezo la solicitud?',
          out: 'Sí, por favor',
        },
        {
          when: '9:40 PM',
          title: 'Llena la solicitud',
          kind: 'letter',
          to: 'A la oficina de IHSS del condado',
          before: 'Solicito Servicios de Apoyo en el Hogar (IHSS) para mi madre, Carmen Reyes, que tiene Medi-Cal y ',
          mark: 'necesita ayuda con su cuidado diario',
          after: '. Quisiera ser su proveedora.',
          sent: 'Enviada con tu sí',
        },
        {
          when: '10 de oct. · Día 8',
          title: 'No contestan, así que da seguimiento',
          kind: 'text',
          in: 'El condado todavía no contesta. Llamé y ya la tienen. Una trabajadora social va a llamar para programar una visita a casa.',
          pending: true,
        },
        {
          when: '16 de oct. · Día 14',
          title: 'El condado contesta',
          kind: 'reply',
          from: 'Oficina de IHSS del condado',
          text: 'Recibida. La visita a casa de Carmen Reyes es el 23 de octubre.',
          track: 'Sigue: el formulario del médico. El consultorio de la Dra. Lee ya lo tiene.',
          done: true,
        },
      ],
      alsoLabel: 'También puede pedir:',
      also: [
        'Ahorros en Medicare para tu papá o mamá',
        'Ayuda para comida (CalFresh)',
        'Permiso familiar pagado',
        'Ayuda para pagar el cuidado infantil',
        'Un intérprete en las citas',
      ],
      note: 'Axolotl no es abogado. Pide lo que a tu familia ya le corresponde.',
    },
    school: {
      time: '3:40 PM',
      label: 'De regreso a casa',
      h2Plain: 'Cada familia le facilita el condado',
      h2Em: 'a la siguiente.',
      lead: 'Cada vez que Axolotl logra algo, aprende qué funcionó: qué oficina, qué formulario, cuánto tardó. Una guía de cuidado lo revisa, y la siguiente familia solo dice que sí. No se guardan datos personales de nadie.',
      steps: [
        { tag: 'Una familia', text: 'Axolotl encuentra un camino que funciona.' },
        { tag: 'Muchas familias', text: 'Sigue funcionando, así que queda comprobado.' },
        { tag: 'Una guía de cuidado', text: 'Lo revisa y lo vuelve la forma estándar.' },
      ],
      link: '¿Tienes un equipo de trabajadores por hora? Mira lo que recibe tu gente',
      card: {
        eyebrow: 'Ejemplo · Condado de Valley',
        version: 'Camino v2',
        title: 'Renovar el Medi-Cal de tu papá o mamá',
        doLabel: 'Lo que haces tú',
        doText: 'Mandas una foto de la carta de renovación. Dices que sí al formulario.',
        happensLabel: 'Lo que pasa',
        happensText: 'El formulario llega completo y el condado lo confirma.',
        stats: [
          { v: '31', l: 'familias lo usaron' },
          { v: '31', l: 'confirmadas' },
          { v: '6 días', l: 'espera típica' },
        ],
        neverLabel: 'Nunca se comparte',
        neverText: 'Por qué lo pediste. Datos de salud. Nada que el condado no pida.',
        stamp: { top: 'Verificado', name: ['Guía', 'Ana R.'], date: '2 oct.' },
        stampAlt: 'Verificado por la guía de cuidado Ana R. el 2 de octubre',
      },
      moreLabel: 'Más caminos en el condado de Valley',
      more: [
        { name: 'Ahorros en Medicare para tu papá o mamá', status: 'verificado', official: true },
        { name: 'Renovar CalFresh', status: 'verificado', official: true },
        { name: 'Solicitar IHSS', status: 'comprobado' },
        { name: 'Reclamo de permiso familiar pagado', status: 'comprobado' },
        { name: 'Programa de día para adultos', status: 'nuevo' },
      ],
      note: 'Los caminos llegan con nuestras primeras familias piloto.',
    },
    dinner: {
      time: '6:30 PM',
      label: 'La cena',
      h2Plain: 'Quién está con mamá',
      h2Em: 'esta semana.',
      lead: 'Tu círculo es la gente que ya te ayuda: tu hermano, tu hermana, una vecina, la niñera. Dile a Axolotl lo que necesitas. Les pregunta, organiza quién hace qué y les recuerda a todos.',
      weekLabel: 'Esta semana',
      week: [
        { day: 'Lun', who: 'Tú' },
        { day: 'Mar 10:00', who: 'Luis', set: true },
        { day: 'Mié', who: 'La cuidadora' },
        { day: 'Jue', who: 'Marisol', set: true },
        { day: 'Vie', who: 'Tú' },
      ],
      rules: [
        { h: 'Todos dicen que sí.', p: 'Nadie entra sin aceptar. Cualquiera puede salirse cuando quiera.' },
        { h: 'El plan, no el motivo.', p: 'Tu círculo ve quién está con mamá y cuándo. Nunca los detalles médicos.' },
        { h: 'En cualquier idioma.', p: 'Luis escribe en español, Marisol lo lee en inglés.' },
      ],
      soon: 'Muy pronto · Círculos',
      circles: 'Únete al piloto y serás de los primeros en crear uno.',
    },
    night: {
      time: '9:40 PM',
      label: 'Los niños ya duermen',
      h2Plain: 'Todo está',
      h2Em: 'resuelto.',
      lead: 'En lugar de una mesa llena de cartas, un solo resumen: lo que se envió, lo que se confirmó y lo que sigue pendiente.',
      summaryLabel: 'Hoy, en un resumen',
      summary: [
        { title: 'La cuidadora de mamá', detail: 'Cubierta por tu cuidado de respaldo · llegó 7:30', done: true },
        { title: 'Tu turno de hoy', detail: 'Dana cubrió de 7 a 11 · tu gerente aprobó', done: true },
        { title: 'Renovación de Medi-Cal de mamá', detail: 'El condado confirmó · R-4471', done: true },
        { title: 'Pago por cuidar (IHSS)', detail: 'Solicitado · esperando al condado', done: false },
      ],
      doneWord: 'Listo',
      waitingWord: 'Esperando respuesta',
      promises: [
        { title: 'Tu sí lo envía.', body: 'Cada correo, formulario y solicitud espera un sí claro. Una sugerencia no es permiso.' },
        { title: 'Tu empleador nunca ve tu caso.', body: 'Si tu trabajo paga Axolotl, solo ve totales. Nunca quién preguntó ni sobre qué.' },
        { title: 'Una persona de verdad cuando se complica.', body: 'En una crisis o una decisión grande, una guía de cuidado te acompaña. Tu información nunca se vende.' },
      ],
      links: [
        { label: 'Lee cada límite, en palabras sencillas', href: '/security' },
        { label: 'Cómo manejamos la información', href: '/privacy' },
      ],
      closePlain: 'Lo de mañana,',
      closeEm: 'ya resuelto.',
    },
  },

  hero: {
    h1: 'Toda familia trabajadora merece un agente.',
    sub: 'A tu familia le corresponde mucho, de tu trabajo y de programas públicos, y casi nada te llega. Axolotl es un número confidencial al que le escribes. Se encarga del cuidado de tu mamá o tu papá, los beneficios, los papeles del permiso y la escuela de los niños, y una persona de verdad te ayuda cuando se complica. Nada se envía sin tu sí.',
    primary: 'Únete al piloto',
    secondary: 'Mira cómo funciona',
    trust:
      'Gratis para las familias del piloto, en español o en inglés.',
    phone: {
      meta: 'Hoy',
      metaTime: '5:40 AM',
      thread: [
        { out: 'La cuidadora de mi mamá canceló y entro a las 7. Ayúdame.' },
        { in: 'Tu cuidado de respaldo del trabajo cubre una cuidadora hoy, a las 6:45. ¿La reservo?' },
        { out: 'Sí.' },
        { in: 'Listo. Ana, de Sunrise Home Care, llega a las 6:45.' },
        { in: 'La renovación de Medi-Cal de mamá vence el viernes. Ya está llena y solo falta tu sí.' },
        { out: 'Envíala.' },
        { in: 'Enviada. El condado confirmó que la tiene.' },
        { in: 'Podrían pagarte por cuidar a tu mamá, con IHSS. ¿Lo reviso?' },
        { out: '¿En serio? Sí.' },
      ],
      alt: 'Conversación de texto en un teléfono, antes de un turno a las 7. La trabajadora dice que la cuidadora de su mamá canceló. Axolotl dice que el cuidado de respaldo de su trabajo cubre una cuidadora hoy y, con su sí, reserva una para las 6:45. Ya llenó la renovación de Medi-Cal de su mamá y la envía con su sí; el condado confirma. Luego le dice que podrían pagarle por cuidar a su mamá con IHSS, y ella dice que sí.',
    },
    folder: {
      label: 'La familia Reyes',
      tab: 'Reyes',
      listLabel: 'Qué hay en esta carpeta',
      annotation: 'solo falta tu sí',
      rows: [
        {
          label: 'La cuidadora de mamá hoy',
          detail: 'Cubierta por el cuidado de respaldo. Ana llega a las 6:45.',
          status: 'confirmed',
        },
        {
          label: 'Renovación de Medi-Cal de mamá',
          detail: 'Llenada con los datos del año pasado. Lista para enviar.',
          status: 'waiting',
          annotated: true,
        },
        {
          label: 'Pago por cuidar (IHSS)',
          detail: 'Solicitud iniciada con el condado.',
          status: 'requested',
        },
        {
          label: 'Turno del jueves',
          detail: 'Dana aceptó el cambio. Tu gerente aprobó.',
          status: 'confirmed',
        },
        {
          label: 'La semana de mamá',
          detail: 'Luis tiene el martes. Marisol tiene el jueves.',
          status: 'soon',
          tag: 'Círculos',
        },
      ],
    },
  },

  statuses: {
    confirmed: 'Confirmado',
    waiting: 'Esperando tu sí',
    requested: 'Solicitado, esperando al condado',
    reminder: 'Recordatorio puesto',
    soon: 'Muy pronto',
  },

  week: {
    h2: 'Mantiene la semana en marcha.',
    lead: 'La cuidadora que cancela, el turno que no puedes perder y los formularios que dan por hecho que alguien está libre a las 2 PM.',
    stepsLabel: 'Lo que hizo',
    shotAlt: 'Una conversación de texto con Axolotl:',
    you: 'Tú',
    prev: 'Anterior',
    next: 'Siguiente',
    trackLabel: 'La semana, una pantalla a la vez',
    preview: { domain: 'benefits.valleymed.org', title: 'Tu guía de beneficios' },
    meta: 'Hoy',
    cols: [
      {
        h3: 'Cuando falla el cuidado',
        time: '5:40 AM',
        steps: [
          'La cuidadora canceló.',
          'Encontró cuidado que cubre tu trabajo.',
          'Le pidió a Dana un cambio, con tu sí.',
        ],
        turns: [
          { out: 'La cuidadora de mamá canceló. Entro a las 7.' },
          { in: 'Tu cuidado de respaldo cubre una cuidadora hoy. La más temprana es a las 7:30.' },
          { out: 'Es muy tarde.' },
          { in: 'Dana podría cubrir de 7 a 11 si tú cubres su sábado. ¿Le pregunto?' },
          { out: 'Sí' },
          { in: 'Esto es lo que le voy a mandar: “¿Me cambias de 7 a 11 hoy por tu sábado?”' },
          { out: 'Mándalo' },
          { in: 'Dana dijo que sí. Le mandé el cambio a tu gerente.' },
          { in: 'Aprobado. La cuidadora está reservada para las 7:30.' },
          { out: 'Me salvaste la mañana.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Los beneficios que ya tienes',
        time: '11:48 AM',
        steps: [
          'Leyó tu guía de beneficios.',
          'Encontró terapia gratis en tu trabajo.',
          'La reservó con tu sí.',
        ],
        turns: [
          { out: 'Mi mamá está peor y no puedo dormir.' },
          { in: 'Lo siento mucho. Es mucho que cargar.' },
          { in: 'Tu trabajo incluye terapia gratis. Es confidencial. Tu trabajo nunca ve quién la usa.' },
          { out: 'No sabía eso.' },
          { in: 'Hay una terapeuta que habla español el martes a las 6 PM, por teléfono. ¿La quieres?' },
          { out: 'Sí' },
          { in: 'Reservada. Te recuerdo el martes a las 5.' },
          { in: 'Tu mamá también podría calificar para un programa de día para adultos con Medi-Cal. ¿Lo reviso?' },
          { out: 'Por favor.' },
          { in: 'Ya voy. Hoy en la noche te mando lo que encuentre.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Los niños',
        time: '4:05 PM',
        steps: [
          'El día de fotos es el jueves.',
          'El permiso de la excursión vence el viernes.',
          'Escribió la nota de ausencia de Leo.',
        ],
        turns: [
          { in: 'Tres cosas esta semana: día de fotos el jueves, el permiso de la excursión vence el viernes, y Leo necesita una nota de ausencia.' },
          { out: 'Tiene cita con el dentista el lunes en la mañana.' },
          { in: 'Entonces escribo la nota de ausencia para el lunes y lleno el permiso.' },
          { out: '¿Necesitas algo de mí?' },
          { in: 'Solo tu sí. Todo lo demás ya lo tengo.' },
          { in: 'Listo para enviar: la nota de ausencia y el permiso de Maya.' },
          { out: 'Sí' },
          { in: 'Los dos enviados. La escuela confirmó que los tiene.' },
          { out: '¿Y el día de fotos?' },
          { in: 'No hay que hacer nada. Te recuerdo el jueves en la mañana.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Quién está con mamá',
        time: '6:30 PM',
        steps: [
          'Cita del martes: Luis.',
          'Jueves: la cuidadora.',
          'Domingo: tu hermana, si puede.',
        ],
        turns: [
          { in: 'Así va la semana de tu mamá.' },
          { in: 'Cita con la doctora el martes: Luis. Jueves: la cuidadora. Sábado: tú.' },
          { out: '¿Puedes confirmar que Luis sigue libre el martes?' },
          { in: '¿Le escribo a Luis: “¿Sigues bien para llevar a mamá con la Dra. Lee el martes a las 10?”' },
          { out: 'Sí' },
          { in: 'Enviado. Luis dice que sí, a las 10.' },
          { out: '¿Y el domingo? Tal vez tome un turno.' },
          { in: 'Nadie está con ella el domingo todavía. Sigue Marisol. ¿Le pregunto?' },
          { out: 'Sí.' },
          { in: 'Le pregunté. Te digo qué responde.' },
        ],
        status: 'confirmed',
      },
    ],
  },

  how: {
    h2: 'Nada se envía hasta que dices que sí.',
    lead: 'Una carta de recursos humanos, una fecha límite que importa y dos formularios que tienen que salir.',
    steps: [
      {
        title: 'Detecta la fecha límite.',
        body: 'Casi todas las cartas son solo información. Una te necesita, con la fecha.',
      },
      {
        title: 'Hace el trabajo.',
        body: 'Llena los formularios y pone en marcha la parte del médico.',
      },
      {
        title: 'Espera tu sí.',
        body: 'Ves exactamente lo que va a enviar. Tu sí es lo que lo envía.',
      },
      {
        title: 'Listo significa confirmado.',
        body: 'Solo da algo por terminado cuando ellos lo confirman.',
      },
    ],
    stepsLabel: 'Cómo funciona, en orden',
    phone: {
      contact: 'Axolotl',
      meta: 'Hoy',
      metaTime: '4:02 PM',
      who: 'Axolotl: ',
      whoParent: 'Tú: ',
      thread: [
        {
          kind: 'in',
          text: 'Recursos humanos necesita tu formulario de permiso y una nota del médico antes del 15 de oct. por la cirugía de tu mamá.',
        },
        { kind: 'in', text: 'El permiso pagado de California puede cubrir parte de tu sueldo.' },
        { kind: 'out', text: 'No tengo idea de cómo hacer eso. ¿Puedes tú?' },
        {
          kind: 'in',
          text: 'Sí. Llené el formulario de permiso y mandé la parte del médico a la Dra. Lee.',
        },
        {
          kind: 'in',
          text: 'Listo para enviar: Rosa Reyes, permiso del 20 de oct. al 3 de nov., para cuidar a su mamá. También empiezo tu permiso pagado.',
        },
        { kind: 'out', text: 'Sí' },
        {
          kind: 'in',
          text: 'Enviado. Recursos humanos confirmó que lo tiene. Referencia L-2210.',
        },
      ],
      caption: 'Conversación de ejemplo. Familia y empleador ficticios.',
      alt: 'Conversación de texto en un teléfono: Axolotl dice que recursos humanos necesita el formulario de permiso de la trabajadora y una nota del médico antes del 15 de octubre por la cirugía de su mamá, y que el permiso familiar pagado de California puede cubrir parte de su sueldo. Axolotl llena el formulario, manda la parte del médico a la doctora y muestra lo que va a enviar, ofreciendo empezar también el reclamo de permiso pagado. Ella responde Sí, y Axolotl confirma que recursos humanos lo tiene, referencia L-2210.',
    },
    channel: {
      line: 'Escribe a un solo número. Sin app, sin portal. En español o en inglés.',
      label: 'Cosas que mandan las familias',
      items: [
        { kind: 'text', text: 'Fwd: Tu inscripción de beneficios' },
        { kind: 'photo', text: 'Foto de una carta' },
        { kind: 'text', text: '¿Mi mamá puede recibir ayuda en casa?' },
        { kind: 'text', text: 'Leo está enfermo hoy.' },
      ],
    },
  },

  circles: {
    h2: 'Organízate con la gente que ya te ayuda.',
    soon: 'Muy pronto',
    lead: 'Tu círculo es la gente que ya te ayuda: tu hermano, tu hermana, una vecina, la niñera. Muy pronto, Axolotl los reúne en un solo plan para tu mamá y los niños. Pregunta con tus palabras, organiza quién hace qué y solo se compromete cuando todos dicen que sí.',
    chat: {
      alt: 'Chat de grupo de ejemplo en la app Mensajes, con un círculo. La trabajadora dice que su mamá tiene cita con la doctora el martes a las 10 y ella trabaja. Axolotl les pregunta a Luis y a Marisol. Luis responde en español que puede llevarla si alguien le cubre el jueves, y Axolotl lo traduce. Marisol toma el jueves. Axolotl confirma el plan y dice que les recordará esa mañana.',
      group: 'Tú, Luis, Marisol',
      meta: 'Hoy',
      metaTime: '6:31 PM',
      messages: [
        { from: 'Tú', out: true, text: 'Mamá tiene cita con la doctora el martes a las 10 y yo trabajo. ¿Alguien la puede llevar?' },
        { from: 'Axolotl', text: 'Luis, Marisol: ¿alguno de los dos está libre el martes a las 10?' },
        { from: 'Luis', text: 'Yo la llevo, si alguien me cubre el jueves.' },
        { from: 'Marisol', text: 'I’ve got Thursday.' },
        { from: 'Axolotl', text: 'Marisol dice que ella cubre el jueves.' },
        { from: 'Axolotl', text: 'Listo: Luis tiene el martes, Marisol el jueves. Les recuerdo a los dos esa mañana.' },
        { from: 'Tú', out: true, text: 'Son los mejores. Les debo una cena este fin de semana.' },
      ],
    },
    listLabel: 'Cómo funcionan los círculos',
    list: [
      'Nunca necesitas un círculo para recibir toda la ayuda.',
      'Un círculo solo ve el plan, nunca los detalles médicos o de dinero.',
      'Nada se acuerda hasta que todos dicen que sí.',
      'No son solo los viajes: citas médicas, días de enfermedad, la escuela y cubrir un turno.',
      'Cada quien lee y escribe en su propio idioma.',
      'Si un programa le debe ayuda a tu familia, Axolotl se la pide primero al programa.',
      'Axolotl organiza. No maneja a nadie; la familia decide.',
    ],
    form: {
      legend: 'Crea un círculo',
      phoneLabel: 'Tu teléfono',
      familiesLabel: '¿Cuántas personas ayudan?',
      familiesOptions: ['2 a 3', '4 a 6', '7 o más'],
      schoolLabel: 'Ciudad',
      schoolHint: '(opcional)',
      submit: 'Crea un círculo',
      note: 'Te escribiremos cuando abran los círculos.',
      success: 'Ya estás en la lista. Te escribiremos cuando abran los círculos.',
      errors: {
        phone: 'Escribe un número de teléfono de EE. UU. de 10 dígitos.',
        families: 'Elige cuántas personas ayudan.',
        generic: 'No pudimos guardar tu registro. Inténtalo de nuevo.',
      },
    },
  },

  voices: {
    h2: 'De las familias del piloto.',
    quotes: [],
  },

  join: {
    h2: 'Únete al piloto.',
    lead: 'Estamos sumando a un grupo pequeño de familias trabajadoras. Deja tu número y te escribiremos sobre el acceso. Gratis para las familias, en español o en inglés.',
    phoneLabel: 'Tu teléfono',
    submit: 'Únete al piloto',
    note: 'Al unirte, aceptas recibir mensajes de texto sobre el acceso.',
    circleLink: 'Mejor crea un círculo',
    questionLink: '¿Tienes una pregunta primero?',
    success: 'Ya estás en la lista. Te escribiremos al {phone}.',
    error: 'Escribe un número de teléfono de EE. UU. de 10 dígitos.',
    generic: 'No pudimos guardar tu registro. Inténtalo de nuevo.',
  },

  employersBand: {
    h2: 'Para empleadores.',
    body: 'A tu gente le corresponden beneficios que no usa, y el cuidado de la familia te cuesta turnos y renuncias. Dale a cada trabajador un número confidencial. Axolotl les consigue lo que les corresponde y resuelve la crisis familiar antes de que cueste un turno. Tú ves totales, nunca casos.',
    link: 'Cómo trabaja Axolotl con los empleadores',
  },

  contact: {
    h2: 'Preguntas.',
    lead: 'Pregunta sobre el piloto o sobre cómo funciona. Guardamos tu mensaje y te respondemos por correo.',
    emailLabel: 'Correo electrónico',
    messageLabel: '¿Qué te gustaría preguntar?',
    messageHint: '(opcional)',
    submit: 'Enviar',
    note: 'Usaremos estos datos para responderte. Por favor no incluyas información de salud, números de beneficios ni contraseñas.',
    privacyLink: 'Cómo manejamos los datos del sitio',
    success: 'Tu mensaje se guardó. Te responderemos al correo que nos diste.',
    error: 'No pudimos guardar tu mensaje. Inténtalo de nuevo.',
  },

  websitePrivacy: {
    summary: 'Privacidad del sitio',
    h2: 'Lo que compartes aquí.',
    blocks: [
      {
        h3: 'Lo que nos mandas',
        body: 'Recogemos el correo y el mensaje que envías para poder responderte. Las preguntas se guardan en nuestra base de datos. Por favor no mandes información de salud, números de beneficios ni contraseñas.',
      },
      {
        h3: 'La lista del piloto y las solicitudes de empleadores',
        body: 'Un registro de familia nos da tu número de teléfono. Una solicitud de piloto de un empleador nos da tu nombre, puesto, organización y correo. Todo se guarda en nuestra base de datos. Un proveedor de mensajes de texto puede procesar tu número para mandarte un mensaje de confirmación.',
      },
      {
        h3: 'Este sitio no es el servicio',
        body: 'Estos formularios no se conectan con tu empleador, tus beneficios ni ninguna cuenta del gobierno. El sitio carga tipografías de Google Fonts, así que tu navegador hace solicitudes a Google y a nuestro proveedor de hosting cuando lo visitas. Cómo maneja el servicio la información de tu familia está en la política de privacidad.',
      },
      {
        h3: '¿Preguntas sobre tu información?',
        body: 'Usa el formulario de arriba para preguntas de privacidad o una solicitud sobre la información que enviaste.',
      },
    ],
    link: 'Lee la política de privacidad del servicio',
  },

  footer: {
    tagline: 'El agente para las familias que trabajan',
    links: [
      { label: 'Contacto', href: '#contact' },
      { label: 'Privacidad', href: '/privacy' },
      { label: 'Seguridad y confianza', href: '/security' },
    ],
  },

  // ── /es/employers ───────────────────────────────────────────────────────────
  employers: {
    meta: {
      title: 'Axolotl para empleadores',
      description:
        'Axolotl es un número confidencial al que tus trabajadores por hora escriben para conseguir todo lo que les corresponde: los beneficios que no usan, el cuidado de un papá o una mamá, los papeles del permiso y los programas públicos. Menos turnos perdidos, a precio de EAP, y tú ves totales, nunca casos.',
      shareAlt: 'Una carpeta de manila con pendientes de la familia y un sello de Confirmado en la primera línea.',
    },
    hero: {
      eyebrow: 'Para líderes de recursos humanos y beneficios',
      h1Plain: 'A tu gente le corresponde mucho.',
      h1Em: 'Casi todo se queda sin usar.',
      sub: 'Axolotl es un número confidencial al que cada trabajador escribe. Encuentra lo que le corresponde de tus beneficios y de programas públicos, hace los trámites y resuelve la crisis familiar antes de que cueste un turno. Una persona de verdad ayuda cuando se complica. A precio de EAP.',
      primary: 'Habla con nosotros sobre un piloto',
      secondary: 'Mira a dónde se van los turnos',
    },
    office: {
      h2Plain: 'Los turnos que pierdes',
      h2Em: 'por la vida en casa.',
      lead: 'Los empleados que cuidan a un familiar faltan unos 6.6 días de trabajo al año, y más de la mitad ha tenido que llegar tarde o salir temprano. La mayoría cobra por hora. Se nota en faltas, turnos cortos y renuncias, y casi nada de eso le llega a recursos humanos como motivo.',
      head: ['Hoy', 'Con Axolotl', 'Lo que ahorra'],
      rows: [
        {
          pain: 'La cuidadora de un papá o una mamá cancela antes de un turno a las 7',
          does: 'Axolotl encuentra cuidado que el trabajador ya tiene cubierto y, con su sí, le pide un cambio a un compañero. El gerente aprueba.',
          who: 'Una falta',
        },
        {
          pain: 'Beneficios que nadie usa',
          does: 'Le dice a cada trabajador lo que ya tiene, como el EAP, el cuidado de respaldo o el permiso, en el momento en que lo necesita, y lo reserva.',
          who: 'Dinero que ya gastas',
        },
        {
          pain: 'Papeles de permiso atorados por semanas',
          does: 'El formulario de permiso, la parte del médico y el reclamo de permiso pagado del estado llegan completos.',
          who: 'Tiempo de recursos humanos, el sueldo de un trabajador',
        },
        {
          pain: 'La renovación de Medi-Cal o Medicare de un papá o una mamá',
          does: 'Se llena con una foto de la carta y se envía con el sí del trabajador.',
          who: 'Un día perdido en la oficina del condado',
        },
        {
          pain: 'La misma pregunta de beneficios cuarenta veces',
          does: 'Se responde con tu propia guía de beneficios, en español o en inglés. Recursos humanos nunca la ve.',
          who: 'Tiempo de recursos humanos',
        },
        {
          pain: 'Un papá o una mamá que ahora necesita cuidado diario',
          does: 'Revisa si la familia califica para que le paguen por cuidar o para un programa de día para adultos, y hace la solicitud.',
          who: 'Una renuncia',
        },
        {
          pain: 'Trabajadores con miedo de preguntar',
          does: 'Es confidencial. Tú ves totales, nunca nombres ni motivos.',
          who: 'Confianza',
        },
        {
          pain: 'Un portal que nadie abre',
          does: 'Es una conversación de texto. Sin app, sin contraseña.',
          who: 'Uso',
        },
      ],
    },
    door: {
      h2Plain: 'La misma trabajadora, la misma crisis.',
      h2Em: 'Dos mañanas muy distintas.',
      lead: 'La mamá de una asistente de enfermería necesita ayuda en casa. Con una lista de teléfonos, pasa una semana de descansos en espera. Con Axolotl, se resuelve antes de su turno.',
      example: 'Ejemplo',
      before: {
        label: 'Con la lista de teléfonos del EAP',
        to: 'Para: Rosa Reyes, asistente de enfermería',
        subject: 'Tu Programa de Asistencia al Empleado: recursos para el cuidado de mayores',
        body: 'Gracias por comunicarte con tu EAP. Abajo encontrarás una lista de recursos para el cuidado de mayores en tu zona. Comunícate directamente con cada proveedor para confirmar disponibilidad, requisitos y costo. Para preguntas de Medi-Cal, comunícate con la oficina de tu condado. El horario es de lunes a viernes, de 8 AM a 5 PM…',
        foot: ['14 teléfonos', 'Solo en horario de oficina', 'Solo en inglés', 'Ella hace el trabajo'],
      },
      after: {
        label: 'Con Axolotl',
        to: 'Para: Rosa, por texto',
        rows: [
          ['Reservado', 'Una cuidadora para su mamá a las 6:45 AM, cubierta por el cuidado de respaldo'],
          ['Turno', 'Cambiado con Dana con el sí de Rosa, aprobado por su gerente'],
          ['Solicitado', 'Pago por cuidar (IHSS), con el condado'],
          ['Sigue', 'Terapia el martes a las 6 PM, en español'],
          ['Rosa prefiere', 'Texto, en español, después de su turno'],
        ],
        sent: 'Cada paso enviado con el sí de Rosa · 5:52 AM',
        foot: ['Una sola conversación', 'Antes de su turno', 'Resuelto, no referido'],
      },
      tensionTitle: 'Más gente lo va a usar. De eso se trata.',
      tensionBody:
        'Un EAP sale barato porque casi nadie lo usa. Axolotl está hecho para usarse: el software hace los trámites y un equipo pequeño de guías de cuidado atiende lo difícil, así que sigue siendo accesible cuando tu gente de verdad pide ayuda.',
    },
    attendance: {
      h2Plain: 'Menos faltas,',
      h2Em: 'una familia a la vez.',
      lead: 'Un portal de beneficios no arregla las faltas. Conseguir la ayuda correcta a las 5:40 AM, antes del turno, sí puede.',
      items: [
        {
          h: 'El problema de las 5:40 AM.',
          p: 'Una cuidadora cancela o un niño amanece enfermo. Axolotl encuentra cuidado cubierto y, con el sí del trabajador, les pregunta a los compañeros con los que ya cambia turnos.',
        },
        {
          h: 'El día de los trámites.',
          p: 'El día libre para ir al condado o perseguir un formulario se vuelve un texto y un sí.',
        },
        {
          h: 'El deterioro lento.',
          p: 'Un papá o una mamá que empeora significa semanas de turnos cortos. Una guía de cuidado ayuda a la familia a planear antes de que se vuelva una renuncia.',
        },
        {
          h: 'La ayuda que ya tienen.',
          p: 'Cuidado de respaldo, el EAP, permiso pagado: se usan cuando importa, porque alguien les avisa en el momento justo.',
        },
      ],
      research:
        'Los empleados que cuidan a un familiar faltan unos 6.6 días de trabajo al año, y el 53% ha tenido que llegar tarde o salir temprano (Rosalynn Carter Institute, Invisible Overtime, 2022). Axolotl está hecho para recuperar esos días.',
      threadLabel: 'Un trabajador, un domingo en la noche',
      thread: [
        {
          from: 'axolotl',
          text: 'Para saber cómo vas: la renovación de tu mamá ya salió y su cuidadora está lista para la semana. ¿Algo que venga?',
        },
        { from: 'parent', text: 'Trabajo el sábado y nadie puede estar con ella.' },
        {
          from: 'axolotl',
          text: 'Marisol dijo que está libre los sábados. ¿Le pregunto? Tu cuidado de respaldo también cubre una cuidadora si ella no puede.',
        },
        { from: 'parent', text: 'Sí a las dos cosas.' },
      ],
    },
    flywheel: {
      h2Plain: 'Sale más barato',
      h2Em: 'cada semana.',
      lead: 'Cada caso que resuelve una guía de cuidado se vuelve un camino que la IA sigue la próxima vez.',
      steps: [
        { tag: 'Un trabajador escribe lo que necesita', text: 'En su idioma, a las 10 PM, después de un turno.' },
        { tag: 'Axolotl hace lo que ya sabe', text: 'Formularios, reservas y seguimiento, con el sí del trabajador.' },
        { tag: 'Una guía de cuidado atiende el resto', text: 'Las llamadas, el criterio y las conversaciones difíciles.' },
        { tag: 'Lo que funcionó se vuelve un camino', text: 'Qué oficina, qué formulario, cuánto tardó. Nunca datos personales de nadie.' },
        { tag: 'La siguiente familia lo recibe más rápido', text: 'Menos tiempo humano por caso, así que sigue siendo accesible cuando más gente lo usa.' },
        { tag: 'Tu resumen muestra dónde se atora la gente', text: 'Patrones, nunca personas, para que arregles un beneficio confuso desde la raíz.' },
      ],
      example: {
        label: 'Ejemplo · la renovación de Medi-Cal de un papá o una mamá',
        beforeLabel: 'Pasos de la guía la primera vez',
        before: 5,
        afterLabel: 'Cuando ya es un camino',
        after: 1,
      },
      note: 'En toda tu fuerza laboral, los caminos forman un mapa de cómo funcionan de verdad tus beneficios y los programas locales. Tu equipo puede verlo y arreglar lo que confunde.',
    },
    paths: {
      h2Plain: 'Tus beneficios,',
      h2Em: 'por fin usados.',
      lead: 'Conecta tu guía de beneficios y Axolotl sabe exactamente lo que tiene cada trabajador: el EAP, el cuidado de respaldo, el permiso y el plan de salud. Los lleva a ellos, los reserva y les dice lo que no están aprovechando.',
      steps: [
        { tag: 'Aprendido', text: 'Axolotl lee tu guía de beneficios y los contactos de tus proveedores.' },
        { tag: 'Aprobado', text: 'Tu equipo de beneficios revisa cómo se explica cada uno, en palabras sencillas.' },
        { tag: 'Usado', text: 'Cada trabajador se entera del beneficio correcto en el momento que importa, en su idioma.' },
      ],
      card: {
        eyebrow: 'Ejemplo · Valley Medical',
        version: 'Camino v3',
        title: 'Reservar cuidado de respaldo para un papá o una mamá',
        doLabel: 'El trabajador manda',
        doText: '“La cuidadora de mamá canceló.” Nada más.',
        happensLabel: 'Axolotl hace',
        happensText: 'Revisa el beneficio de cuidado de respaldo, reserva la cuidadora más temprana y lo confirma con el trabajador.',
        stats: [
          { v: '48', l: 'trabajadores lo usaron' },
          { v: '22 min', l: 'tiempo típico para reservar' },
          { v: '0', l: 'llamadas a recursos humanos' },
        ],
        neverLabel: 'Nunca comparte:',
        neverText: 'quién lo usó ni por qué. Recursos humanos solo ve totales.',
        stamp: { top: 'Aprobado', name: ['Equipo de', 'beneficios'], date: 'ago. 2026' },
        stampAlt: 'Aprobado por el equipo de beneficios de Valley Medical, agosto de 2026',
      },
    },
    staff: {
      h2Plain: 'Tu equipo de recursos humanos también lo usa,',
      h2Em: 'desde el primer día.',
      lead: 'El personal de beneficios y recursos humanos le escribe a Axolotl igual que los trabajadores. Pregunta en qué se atora la gente, arregla cómo se explica un beneficio o manda un aviso en dos idiomas.',
      threadLabel: 'Una gerente de beneficios, escribiéndole a Axolotl',
      thread: [
        { from: 'staff', text: '¿En qué se atoró la gente esta semana?' },
        { from: 'axolotl', text: 'Permisos: 6 trabajadores no sabían que California paga parte del sueldo mientras cuidan a un papá o una mamá. Todo lo demás se respondió con tu guía de beneficios.' },
        { from: 'staff', text: 'Agrega eso a cómo explicamos el permiso.' },
        { from: 'axolotl', text: 'Listo, el camino de permisos es v4. ¿Les aviso a esos 6 trabajadores?' },
        { from: 'staff', text: 'Sí, por favor.' },
      ],
      brief: {
        eyebrow: 'Resumen del lunes · Valley Medical',
        example: 'Ejemplo',
        rows: [
          { v: '31', l: 'preguntas de beneficios respondidas con tu propia guía', note: 'EAP, permisos, cuidado de respaldo' },
          { v: '14', l: 'trabajadores con ayuda para el cuidado de un papá o una mamá', note: 'Reservado, enviado o solicitado' },
          { v: '6', l: 'trabajadores atorados con el permiso pagado', note: 'Camino actualizado a v4' },
        ],
        foot: 'Patrones, no personas. El resumen nunca muestra quién preguntó ni qué dijo.',
      },
    },
    connect: {
      h2Plain: 'Conecta tus beneficios,',
      h2Em: 'y el agente de cada trabajador los conoce.',
      lead: 'Axolotl funciona para las familias sin ti. Conectado, deja de adivinar: responde con tus beneficios y llega a los trabajadores que más lo necesitan.',
      head: ['Lo que compartes', 'Lo que reciben los trabajadores'],
      rows: [
        ['Guía de beneficios y resúmenes de los planes', 'Respuestas claras, en su idioma, a cualquier hora'],
        ['Proveedores del EAP y del cuidado de respaldo', 'Terapia y cuidado reservados para ellos, no una lista de teléfonos'],
        ['Política de permisos y contactos de recursos humanos', 'Formularios de permiso completos, a la persona correcta'],
        ['Un contacto de horarios', 'Cambios de turno con compañeros, aprobados por los gerentes'],
        ['Lista de personal con teléfonos', 'Una invitación de su propio empleador, en su idioma'],
      ],
      ruleTitle: 'La ayuda va hacia los trabajadores, no sale de ellos.',
      ruleBody:
        'Tu información ayuda a cada trabajador con su propia familia. Sus conversaciones con Axolotl nunca regresan a ti. Ves patrones, nunca personas.',
      start:
        'Empieza con tu guía de beneficios y un archivo con la lista de personal, no con un proyecto de integración.',
    },
    never: {
      h2: 'Lo que Axolotl nunca hará.',
      items: [
        { title: 'Reportar sobre los trabajadores.', body: 'Ves totales y patrones, nunca quién preguntó ni sobre qué.' },
        { title: 'Vender datos.', body: 'Ni a proveedores, ni a anunciantes, ni a nadie.' },
        { title: 'Decidir por una familia.', body: 'Sugiere y prepara. El trabajador decide.' },
        {
          title: 'Inventar una respuesta.',
          body: 'Las respuestas salen de tus propios beneficios y de las reglas oficiales de los programas. Cuando no está seguro, responde una guía de cuidado.',
        },
        {
          title: 'Reemplazar tus beneficios o tus obligaciones.',
          body: 'Ayuda a la gente a usar lo que ya ofreces y lo que le corresponde.',
        },
        {
          title: 'Enviar algo sin el sí del trabajador.',
          body: 'Cada mensaje y formulario espera a que lo apruebe.',
        },
      ],
    },
    equity: {
      h2: 'Acceso y equidad.',
      lead: 'Los trabajadores con menos margen son con quienes esto tiene que funcionar primero.',
      items: [
        'En español y en inglés, escrito en un lenguaje sencillo.',
        'Se adapta a los turnos: una conversación de texto, no un horario de oficina.',
        'Un trabajador que nunca ha llenado un formulario del gobierno recibe la misma solicitud completa que alguien con abogado.',
        'Sin app, sin contraseña, sin portal.',
        'Confidencial por diseño, para que la gente lo use antes de que un problema se vuelva una renuncia.',
      ],
    },
    pilot: {
      h2: 'Un piloto juntos.',
      lead: 'Un sitio, unos cientos de trabajadores por hora y un punto de partida confiable.',
      baselineTitle: 'Empezamos contando.',
      baseline:
        'Antes de lanzar nada, revisamos un trimestre reciente: faltas, turnos cortos, renuncias y cuánta gente usó tu EAP y otros beneficios. Ese es tu punto de partida.',
      measuresLabel: 'Lo que mediríamos',
      measures: [
        'Faltas y turnos cortos, contra el punto de partida.',
        'Renuncias entre quienes usaron Axolotl, comparadas con un sitio parecido.',
        'Cuántos trabajadores lo usaron, contra el uso de tu EAP.',
        'Beneficios y programas que consiguieron los trabajadores, y el dinero que recuperaron.',
      ],
      consent:
        'Siempre confidencial. Los trabajadores eligen usarlo, y tú solo ves totales.',
      integration:
        'Conectar la lista de personal o los horarios requiere primero un acuerdo de datos firmado.',
      guardrail:
        'No habrá cifras de resultados hasta que un piloto las produzca de verdad. Los números de esta página son ejemplos, salvo donde se cita una fuente. Publicaremos lo que midamos, incluidas las partes que no funcionen.',
    },
    form: {
      h2: 'Habla con nosotros sobre un piloto.',
      lead: 'Cuéntanos de tu fuerza laboral y te escribiremos por correo.',
      nameLabel: 'Tu nombre',
      roleLabel: 'Tu puesto',
      schoolLabel: 'Empresa u organización',
      emailLabel: 'Correo del trabajo',
      messageLabel: '¿Cuántos trabajadores por hora, y dónde?',
      messageHint: '(opcional)',
      submit: 'Enviar',
      note: 'Usaremos estos datos para responderte. Por favor no incluyas expedientes de empleados ni información de salud.',
      success: 'Tu mensaje se guardó. Te responderemos al correo que nos diste.',
      error: 'No pudimos guardar tu mensaje. Inténtalo de nuevo.',
      generic: 'Por favor llena todos los campos.',
    },
  },
};
