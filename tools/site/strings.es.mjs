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
    title: 'Axolotl: ayuda con la escuela, por texto, para familias que trabajan.',
    description:
      'Axolotl se encarga de las salidas tempranas, los días de enfermedad y el papeleo de la escuela por texto, y consigue lo que a tu hijo le corresponde. Nada llega a la escuela sin tu sí.',
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
    rights: 'Tus derechos',
    circles: 'Círculos',
    limits: 'Límites',
    join: 'Únete al piloto',
    langSwitch: 'English',
    langSwitchHref: '/',
  },

  exampleCaption:
    'Conversación de ejemplo. Escuela y familia ficticias.',

  hero: {
    h1: 'El asistente de tu familia para la escuela.',
    sub: 'Lee lo que manda la escuela, cubre las salidas tempranas y los días de enfermedad, y consigue lo que a tu hijo le corresponde. Solo mándale un mensaje.',
    primary: 'Únete al piloto',
    secondary: 'Ver cómo funciona',
    trust:
      'Nada llega a tu escuela sin tu sí. Gratis durante el piloto, en inglés o español.',
    // The hero visual is the same five rows as the folder, shown the way a
    // parent actually receives them: a card in the text thread on their phone.
    phone: {
    meta: 'Hoy',
      metaTime: '7:15 AM',
      cardTitle: 'Esta semana',
      alt: 'Conversación de texto en un teléfono. Axolotl manda una tarjeta titulada "Esta semana" con cinco cosas: la salida temprana del miércoles a la 1:20, confirmada con la abuela recogiendo a Leo; el formulario de excursión de Maya, lleno y esperando tu sí; el transporte de Leo a Lincoln, solicitado al distrito bajo McKinney-Vento; la evaluación de lectura de Maya, solicitada el 30 de septiembre; y la recogida del viernes con otra familia, próximamente.',
    },
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

  layers: {
    h2: 'Hecho para tu familia, y para las familias que están cerca.',
    lead: 'Un agente que conoce a tu familia, trabaja con las personas que te ayudan y aprende cómo funciona tu escuela.',
    cols: [
      {
        h3: 'Tu familia',
        label: 'Privado',
        body: 'Tus hijos, sus escuelas, tu horario y todo lo que sigue pendiente. Solo lo ves tú y las personas que agregues.',
      },
      {
        h3: 'Tu gente',
        label: 'La casa ahora, los círculos después',
        body: 'Tu pareja, la abuela y la niñera ven el mismo plan, y cada tarea tiene un nombre. Pronto: las mamás y papás con quienes intercambias recogidas.',
      },
      {
        h3: 'Tu escuela',
        label: 'Compartido',
        body: 'Lo que Axolotl aprende de tu escuela, como el calendario, las salidas tempranas y quién maneja el transporte, ayuda a todas las familias de ahí. No se comparte información personal de nadie.',
      },
    ],
    line: 'Los círculos lo hacen más fácil. Nunca necesitas uno para recibir toda la ayuda.',
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
          'Leyó el calendario del distrito.',
          'Lo comparó con tus turnos.',
          'Encontró quién está libre el miércoles.',
        ],
        turns: [
          { link: true },
          { in: 'Salió el calendario del distrito. Hay una cosa que necesita tu atención.' },
          { in: 'El miércoles la salida es a la 1:20: los niños salen tres horas antes.' },
          { out: 'Ese día tengo reuniones hasta las 3.' },
          { card: true },
          { in: 'La abuela puede recoger a Leo.' },
          { in: '¿Quieres que le pregunte?' },
        ],
        status: 'waiting',
      },
      {
        h3: 'Cambios del mismo día',
        time: '11:48',
        steps: [
          'La escuela escribió: salida a mediodía.',
          'Revisó tu calendario: juntas hasta las 3.',
          'La abuela es la primera en tu lista de respaldo.',
        ],
        turns: [
          { out: 'Fwd: Lincoln Elementary: hoy salen al mediodía' },
          { in: 'Lincoln acaba de escribir.' },
          { in: 'Salen al mediodía, en doce minutos.' },
          { out: 'No puedo salir. Tengo reuniones hasta las 3.' },
          { card: true },
          { in: 'La abuela es la primera en tu lista de respaldo.' },
          { in: '¿Quieres que le pregunte?' },
        ],
        status: 'waiting',
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
          { link: true },
          { in: 'Tres cosas esta semana.' },
          { in: 'El jueves es el día de pijama, el formulario de la excursión vence el viernes, y Leo necesita una nota de ausencia.' },
          { out: 'El lunes tiene dentista en la mañana.' },
          { card: true },
          { in: 'La nota de ausencia está lista y el formulario está lleno. Responde SÍ para enviar los dos.' },
        ],
        status: 'waiting',
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
          { link: true },
          { in: 'Así va la semana.' },
          { card: true },
          { out: '¿Le puedes recordar a Sam lo del jueves?' },
          { in: 'Sam ve la misma lista.' },
          { in: 'Le recordaré a quien le toque.' },
        ],
        status: 'reminder',
      },
    ],
  },

  year: {
    h2: 'Algunas de estas cosas no son un favor. Son la ley.',
    lead: 'Describe tu situación con tus propias palabras. Axolotl averigua qué norma aplica, pone la solicitud por escrito y sigue el rastro de la respuesta.',
    head: ['Cuando dices', 'La norma', 'Lo que hace Axolotl'],
    rows: [
      {
        say: '"Perdimos el departamento y estamos con mi hermana al otro lado de la ciudad. ¿Puede seguir en su escuela?"',
        rule: 'Ley McKinney-Vento: estabilidad escolar para niños sin vivienda estable',
        does: 'Busca el contacto de transporte del distrito, pide el transporte por escrito y da seguimiento hasta que confirmen la ruta.',
      },
      {
        say: '"Su maestra dice que va atrasado en lectura. No sé qué tengo que pedir."',
        rule: 'IDEA: evaluaciones para educación especial',
        does: 'Redacta tu solicitud de evaluación por escrito, la envía con tu sí y anota la fecha en que empezó el reloj del distrito.',
      },
      {
        say: '"La junta fue toda en inglés y no entendí casi nada."',
        rule: 'Título VI, Ley de Derechos Civiles: comunicación en un idioma que entiendas',
        does: 'Pide por escrito a la escuela un intérprete y los documentos traducidos antes de la próxima junta.',
      },
      {
        say: '"Estamos pagando el almuerzo completo y creo que calificamos para ayuda."',
        rule: 'Programa Nacional de Almuerzos Escolares: comidas gratis o a precio reducido',
        does: 'Llena la solicitud, te muestra exactamente lo que enviará y la entrega con tu sí.',
      },
      {
        say: '"En la junta acordamos que ella tiene más tiempo. No está pasando en el salón."',
        rule: 'Su IEP o su plan 504: los apoyos que la escuela aceptó',
        does: 'Escribe a la escuela citando lo que dice el plan y sigue insistiendo hasta que confirmen que ya está en marcha.',
      },
    ],
    line: 'Axolotl no es abogado. Te ayuda a usar las normas que ya protegen a tu hijo.',
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
          text: 'La escuela de Leo mandó una nota. Algo necesita tu atención: kínder pide examen físico y dental antes del 15 de octubre. A Leo le faltan los dos.',
        },
        {
          kind: 'in',
          text: 'Su físico está cubierto en la red, y hay lugar el jueves a las 4:10. Llené los dos formularios.',
        },
        {
          kind: 'form',
          label: 'Formulario de salud',
          rows: [
            ['Estudiante', 'Leo Howard'],
            ['Grado', 'Kínder'],
            ['Examen', 'Físico y dental'],
          ],
          caption: 'Responde SÍ para agendar y enviar.',
        },
        { kind: 'out', text: 'Sí' },
        {
          kind: 'in',
          text: 'Enviado. La Primaria Lincoln lo confirmó. Referencia K-1042.',
        },
      ],
      stampTop: 'Confirmado por la Primaria Lincoln',
      stampBottom: 'Referencia K-1042, 3 de octubre',
      note: 'lo único que escribes es sí',
      caption: 'Conversación de ejemplo. Escuela y familia ficticias.',
      alt: 'Conversación de texto en un teléfono: Axolotl dice que Leo necesita un examen físico y uno dental antes del 15 de octubre y que los dos formularios ya están llenos. La familia responde Sí, y Axolotl confirma que la Primaria Lincoln lo aceptó, referencia K-1042.',
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
    h2: 'Turnarse para recoger a los niños, con familias de confianza.',
    soon: 'Próximamente',
    lead: 'Ya se turnan para recoger a los niños por mensaje. Pronto, Axolotl puede hacer las preguntas: calcula la parte de cada familia y solo lo planea cuando todas dicen que sí.',
    chat: {
      alt: 'Ejemplo de chat grupal en Mensajes. Tú, Dana y Sam organizan la salida temprana del miércoles: Dana lleva a los cuatro niños y Sam cubre su recogida del viernes. Todas las familias dijeron sí.',
      group: 'Tú, Dana, Sam',
      meta: 'Hoy',
      metaTime: '8:02',
      messages: [
        { from: 'Tú', out: true, text: 'Fwd: Boletín semanal de Lincoln' },
        {
          from: 'Axolotl',
          text: 'El miércoles la salida es a la 1:20. Dana está libre, y tú y Sam trabajan hasta las 5. Dana puede llevar a los cuatro niños si alguien cubre su recogida del viernes. ¿Les parece bien?',
        },
        { from: 'Dana', text: 'Por mí, sí.' },
        { from: 'Sam', text: 'Yo me encargo del viernes.' },
        { from: 'Axolotl', text: 'Ya respondieron todas. Dana tiene el miércoles, Sam el viernes.' },
      ],
    },
    listLabel: 'Cómo funcionan los círculos',
    list: [
      'Nunca necesitas un círculo para recibir toda la ayuda.',
      'Un círculo solo ve el plan, nunca por qué una familia necesita ayuda.',
      'Nada se acuerda hasta que todas las familias digan sí.',
      'Ayudar no es solo manejar, y nadie lleva la cuenta.',
      'Cada quien lee y escribe en su propio idioma.',
      'Si el distrito le debe transporte a tu familia, Axolotl le pregunta primero al distrito.',
      'Axolotl coordina. No da transporte; las familias deciden quién maneja.',
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

  limits: {
    h2: 'Los límites, antes de que los descubras tú.',
    lead: 'La lista honesta. El resto de esta página solo significa algo si esta parte es cierta.',
    items: [
      {
        title: 'No va a enviar nada sin tu sí.',
        body: 'Cada correo, formulario y envío espera un sí explícito de tu parte. Una sugerencia no es permiso.',
      },
      {
        title: 'Te dice qué no puede abrir.',
        body: 'Una pantalla que pide contraseña, un formulario que solo existe en papel, un distrito que quiere una llamada. Nombra el muro en vez de adivinar.',
      },
      {
        title: 'No te va a decir que un formulario se envió si la escuela no lo confirmó.',
        body: 'Hecho quiere decir que llegó la confirmación de la escuela. Si no puede confirmarlo, te lo dice y te da el enlace.',
      },
      {
        title: 'No puede ver el portal de tu escuela.',
        body: 'Nunca te pide tu contraseña. Si el portal importa, tú inicias sesión y él solo lee.',
      },
      {
        title: 'Es más fuerte leyendo e investigando.',
        body: 'Un formulario limpio que ya ha hecho es confiable. Un formulario nuevo y complicado del distrito puede regresar a ti como un enlace.',
      },
      {
        title: 'No es médico, ni abogado, ni la escuela.',
        body: 'Te ayuda con el proceso. Las decisiones sobre tu hijo siguen siendo tuyas, de tu escuela y de tus médicos.',
      },
    ],
    privacy:
      'La información de tu familia es tuya. Nunca se vende. El único sistema que lee tus mensajes es la IA que escribe las respuestas.',
    privacyLinks: [
      { label: 'Cómo manejamos la información', href: '/privacy' },
      { label: 'Seguridad y límites', href: '/security' },
    ],
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
