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
    title: 'Axolotl: primas de la Parte B que pagaría el estado',
    description:
      'Muchos jubilados con reembolso de la Parte B califican para el Programa de Ahorros de Medicare de Nueva York, que paga la prima completa. La mayoría nunca lo solicita. Axolotl los encuentra en los archivos del fondo, los inscribe por texto con su sí y lo renueva cada año. Los jubilados reciben más cada mes. El fondo deja de pagar. Se paga con los ahorros.',
    shareAlt:
      'El reporte mensual de Axolotl para un fondo: jubilados aprobados para un Programa de Ahorros de Medicare, renovaciones enviadas, solicitudes esperando al estado.',
  },

  a11y: {
    skip: 'Saltar al contenido',
    home: 'Inicio de Axolotl',
    menu: 'Menú',
    mainNav: 'Navegación principal',
    footerNav: 'Pie de página',
  },

  nav: {
    money: 'A dónde va el dinero',
    how: 'Cómo funciona',
    members: 'Para miembros',
    join: 'Revisión gratis',
    joinMembers: 'Recibir un mensaje',
    langSwitch: 'English',
  },

  hero: {
    eyebrow: 'Para fondos que reembolsan la Parte B',
    h1Plain: 'Su fondo reembolsa primas de la Parte B',
    h1Em: 'que pagaría el estado.',
    h1: 'Su fondo reembolsa primas de la Parte B que pagaría el estado.',
    sub: 'Muchos jubilados con su reembolso de la Parte B califican para el Programa de Ahorros de Medicare de Nueva York, que paga la prima completa. La mayoría nunca lo solicita. Axolotl los encuentra en sus archivos, los inscribe por texto con su sí y lo renueva cada año. Ellos reciben unos $100 más al mes. Su fondo deja de pagar. Usted paga una parte de lo que ahorra.',
    primary: 'Pedir una revisión gratis',
    secondary: 'Ver las cifras',
    trust: 'Para fondos sindicales y planes públicos de jubilados que reembolsan la Parte B. Nada si nadie es aprobado.',
    phone: {
      meta: 'Hoy',
      metaTime: '10:12 AM',
      thread: [
        { out: 'Me llegó la carta del fondo sobre la Parte B. ¿Es real?' },
        { in: 'Es real. Nueva York paga toda la Parte B si recibe menos de $2,494 al mes, y los ahorros no cuentan. ¿Solo usted o con cónyuge? ¿Cuánto recibe antes del descuento de Medicare?' },
        { out: 'Solo yo. 1,640 del seguro social, 410 de pensión' },
        { in: 'Son $2,050, así que califica. El estado pagaría los $202.90 completos. La mitad del fondo se acaba, así que le quedan unos $101 más al mes, y Ayuda Adicional con sus recetas.' },
        { in: 'Ya llené la solicitud. Responda SÍ y la envío. También me encargo de renovarla cada año.' },
        { out: 'SÍ' },
        { in: 'Enviada. Le escribo en cuanto el estado la confirme.' },
      ],
      alt: 'Conversación de texto en un teléfono. Una jubilada pregunta si la carta del fondo sobre la Parte B es real. Axolotl le dice que Nueva York paga toda la prima de la Parte B con ingresos de menos de $2,494 al mes y le pregunta si es solo ella y cuánto recibe antes del descuento de Medicare. Recibe $2,050 sola, así que califica: el estado pagaría los $202.90 completos, la mitad del fondo se acaba y le quedan unos $101 más al mes, más Ayuda Adicional con sus recetas. Axolotl ya llenó la solicitud y se encargará de la renovación anual; ella responde SÍ, se envía, y Axolotl le escribirá cuando el estado la confirme.',
    },
    folder: {
      label: 'Reporte mensual · Fondo de ejemplo',
      rows: [
        { label: 'Aprobados, 41 jubilados', detail: 'Programa de Ahorros de Medicare. $49,900 al año menos para el fondo.', status: 'confirmed' },
        { label: 'Renovaciones, 126 jubilados', detail: 'Enviadas antes de la fecha límite.', status: 'requested' },
        { label: 'Presentadas, 18 jubilados', detail: 'Esperando al estado.', status: 'requested' },
        { label: 'Nuevos este mes, 9 jubilados', detail: 'Solicitudes llenadas.', status: 'waiting' },
      ],
    },
  },

  statuses: {
    confirmed: 'Aprobado',
    waiting: 'Esperando un sí',
    requested: 'Presentado, esperando a la agencia',
    reminder: 'Recordatorio listo',
    soon: 'Muy pronto',
  },

  money: {
    h2Plain: 'Cuatro de cada diez',
    h2Em: 'nunca lo solicitan.',
    lead: 'El Programa de Ahorros de Medicare de Nueva York paga toda la prima de la Parte B a un jubilado que recibe hasta unos $2,494 al mes antes de descuentos, o $3,375 una pareja, y los ahorros no cuentan. Cerca de 4 de cada 10 personas que califican no están inscritas. Cuando una de ellas está en su reembolso, su fondo paga una prima que cubriría el estado.',
    stats: {
      eyebrow: 'La regla',
      example: 'Nueva York, 2026',
      rows: [
        { v: '$202.90', l: 'Prima de la Parte B, cada mes', note: 'La prima estándar de 2026. CMS.' },
        { v: '~$2,494', l: 'Al mes, una persona, antes de descuentos', note: 'El límite de Nueva York con la exclusión de $20. Unos $3,375 para una pareja.' },
        { v: 'Ninguna', l: 'Prueba de bienes en Nueva York', note: 'Los ahorros y la casa no cuentan.' },
        { v: '4 de 10', l: 'Personas elegibles sin inscribirse', note: 'MACPAC, 2021–23.' },
      ],
    },
    head: ['Quién', 'Quién paga la prima hoy', 'Quién pagaría', 'Qué recibe el jubilado'],
    rows: [
      {
        when: 'Un jubilado bajo el límite, con reembolso del 50%',
        now: 'La mitad el fondo, la mitad el jubilado',
        should: 'El estado, todo',
        member: 'Unos $101 más al mes, y Ayuda Adicional con sus recetas',
      },
      {
        when: 'Un jubilado bajo el límite, con reembolso del 100%',
        now: 'El plan, todo',
        should: 'El estado, todo',
        member: 'Ayuda Adicional con sus recetas. La prima sigue cubierta.',
      },
      {
        when: 'Un jubilado al que el estado ya cubre',
        now: 'El estado, y otra vez el fondo',
        should: 'Solo el estado',
        member: 'Nada cambia',
      },
      {
        when: 'Un jubilado cuyos ingresos acaban de bajar, por la muerte del cónyuge o un cheque menor',
        now: 'El fondo',
        should: 'El estado',
        member: 'Lo mismo que la primera fila, desde ahora',
      },
    ],
    note: 'Prima: Parte B estándar de 2026. Límites: QI-1 de Nueva York, 2026, ingreso bruto con la exclusión de $20. Inscripción: MACPAC. La Ayuda Adicional llega automáticamente con un Programa de Ahorros de Medicare.',
  },

  example: {
    h2Plain: 'Una jubilada,',
    h2Em: 'una carta, siete mensajes.',
    lead: 'El teléfono al principio de esta página. El fondo envía una carta con nuestro número. Ella escribe, responde dos preguntas y dice que sí. Lo demás pasa sin ella.',
    brief: {
      eyebrow: 'Lo que vale una aprobación',
      example: 'Cifras de 2026',
      rows: [
        { v: '$202.90', l: 'Prima de la Parte B, cada mes', note: 'El estado la paga cuando ella es aprobada.' },
        { v: '$1,217', l: 'Al año que el fondo deja de pagar', note: 'Para un fondo que reembolsa la mitad de la prima.' },
        { v: '$1,217', l: 'Al año de vuelta en su cheque', note: 'Su mitad, más Ayuda Adicional con sus recetas.' },
        { v: '20%', l: 'Nuestra parte de lo que ahorra el fondo', note: 'Por cada año que siga inscrita. Nada si se niega.' },
      ],
      foot: 'El fondo se queda con el 80% del ahorro, cada año que ella siga inscrita.',
    },
  },

  how: {
    phone: {
      contact: 'Axolotl',
      meta: 'Seis semanas después',
      metaTime: '11:04 AM',
      thread: [
        { kind: 'in', text: 'Buenas noticias: Nueva York la aprobó. Desde mayo, el Seguro Social deja de descontarle $202.90.' },
        { kind: 'out', text: '¿Entonces mi cheque sube?' },
        { kind: 'in', text: 'Sí. La mitad del fondo se acaba el mismo mes, así que le quedan unos $101 más al mes.' },
        { kind: 'out', text: 'Muchas gracias' },
        { kind: 'in', text: 'También recibe Ayuda Adicional, así que sus recetas cuestan menos. No tiene que hacer nada.' },
        { kind: 'in', text: 'Una cosa más: esto se renueva cada año. Le escribo en el otoño. Responda SÍ y la envío.' },
        { kind: 'out', text: 'SÍ cuando sea el momento' },
        { kind: 'in', text: 'Trato hecho. Si cambian sus ingresos o su dirección, escríbame aquí.' },
      ],
      caption: 'Conversación de ejemplo. Miembro y fondo ficticios.',
      alt: 'Conversación de texto en un teléfono, seis semanas después de solicitar. Axolotl le dice a una jubilada que Nueva York la aprobó y que el Seguro Social deja de descontarle $202.90 desde mayo. Ella pregunta si su cheque sube; sí, y la mitad del fondo se acaba el mismo mes, así que le quedan unos $101 más al mes, y recibe Ayuda Adicional con sus recetas. Axolotl le dice que se renueva cada año y que le escribirá en el otoño; ella acepta, y Axolotl le pide que escriba si cambian sus ingresos o su dirección.',
    },
  },

  after: {
    h2Plain: 'Después del sí,',
    h2Em: 'lo mantenemos funcionando.',
    lead: 'La aprobación es el comienzo. El Seguro Social deja de descontar la prima, su reembolso se detiene el mismo mes y el estado pide una renovación cada año. Nos encargamos de cada paso, para que el jubilado nunca pague dos veces ni se quede fuera.',
    brief: {
      eyebrow: 'De qué nos encargamos',
      example: 'Cada año',
      rows: [
        { v: 'Día 1', l: 'La solicitud, presentada con su sí', note: 'En inglés o en español.' },
        { v: 'Semanas', l: 'El estado decide', note: 'Respondemos cualquier pedido de papeles.' },
        { v: 'Mismo mes', l: 'Su reembolso se detiene', note: 'Solo cuando su cheque deja de tener el descuento, para que nunca pague dos veces.' },
        { v: 'Cada año', l: 'La renovación, enviada con su sí', note: 'Antes de la fecha límite, para que el fondo no vuelva a pagar.' },
      ],
      foot: 'Si se muda, cambian sus ingresos o fallece su cónyuge, nos escribe y lo actualizamos.',
    },
  },

  steps: {
    h2Plain: 'Cada jubilado, revisado cada mes.',
    h2Em: 'Nada avanza sin un sí.',
    lead: 'Axolotl lleva un registro vivo de dónde está cada jubilado de su reembolso: en observación, probablemente elegible, contactado, de acuerdo, solicitud presentada, aprobado, por renovar. Lee lo que cambió en sus archivos y en las reglas, y solo hace avanzar a un jubilado cuando está seguro. Cuando no lo está, decide una persona.',
    items: [
      { tag: 'Observar', text: 'Cada mes: sus archivos de elegibilidad y de reembolso de la Parte B. Cada año: la nueva prima, el aumento por costo de vida y los nuevos límites de Nueva York, que hacen elegibles a más jubilados cada enero.' },
      { tag: 'Decidir', text: 'El cálculo de elegibilidad es código simple, que se puede rastrear hasta la regla y la cifra. Un modelo de decisiones calibrado lee lo que cambió y dice qué tan seguro está. Por debajo del umbral, revisa una persona de nuestro equipo.' },
      { tag: 'Contactar', text: 'Usted envía una carta con nuestro número. Los jubilados escriben o llaman, en inglés o en español, y confirman sus ingresos en dos preguntas.' },
      { tag: 'Sí', text: 'No se presenta nada hasta que el jubilado responde SÍ a exactamente lo que va a pasar.' },
      { tag: 'Confirmar', text: 'Presentamos la solicitud al estado, la seguimos hasta la aprobación por escrito y la renovamos cada año.' },
      { tag: 'Conciliar', text: 'Con el permiso del jubilado, usted recibe la lista de reembolsos que debe suspender, al mismo tiempo que el Seguro Social deja de descontar, y un reporte mensual de lo ahorrado.' },
    ],
  },

  different: {
    h2Plain: 'Por qué esto no se hace',
    h2Em: 'ya.',
    items: [
      { h: 'Sus reglas ya lo piden', p: 'Los planes reembolsan la Parte B cuando la paga el jubilado, no cuando la paga otro. Los auditores siguen encontrando planes que pagan primas que ya cubre el estado u otro empleador. Hacemos que esa regla funcione para cada jubilado, cada mes.' },
      { h: 'Solo el jubilado puede solicitarlo', p: 'Ningún sistema de reclamos puede inscribir a nadie. El jubilado tiene que confirmar sus ingresos, aceptar y firmar. Lo hacemos con él, a partir de una carta en la que confía.' },
      { h: 'Cada decisión queda registrada', p: 'Cada paso de un jubilado queda registrado con lo que cambió, lo que concluyó el sistema y qué tan seguro estaba. Su abogado puede revisar cualquiera.' },
      { h: 'Usted paga con los ahorros', p: 'Una parte de lo que ahorra, por cada año que un jubilado siga inscrito. Nada por verificar, nada por negaciones.' },
    ],
  },

  never: {
    h2: 'Lo que nunca hacemos',
    items: [
      { title: 'Actuar sin un sí', body: 'No se presenta, envía ni firma nada hasta que el jubilado responde SÍ a exactamente lo que va a pasar.' },
      { title: 'Mostrarle un caso al fondo', body: 'El fondo ve totales. Sabe el nombre de un jubilado solo cuando él está de acuerdo, y solo lo que necesita, como un reembolso que debe suspender.' },
      { title: 'Tocar la cobertura de nadie', body: 'Los jubilados se quedan con el plan que tienen. Solo cambia quién paga la prima. Nunca vendemos ni recomendamos un plan de Medicare.' },
      { title: 'Cobrarles a los jubilados', body: 'Los jubilados nunca nos pagan. Firmamos un acuerdo de socio comercial de HIPAA antes de ver un solo archivo.' },
    ],
  },

  scan: {
    h2Plain: 'Empiece con una revisión gratis',
    h2Em: 'de sus propios datos.',
    lead: 'En 30 días le mostramos, en dólares, cuánto de su reembolso de la Parte B pagaría Nueva York, y cuántos jubilados hay detrás de esa cifra.',
    cards: [
      { title: 'Lo que recibe', body: 'Cuántos jubilados de su reembolso probablemente califican, cuánto paga por ellos cada año, y las primas que reembolsa que ya paga otro. Ningún nombre sale del fondo a menos que usted lo pida.' },
      { title: 'Lo que entrega', body: 'Su archivo de reembolso de la Parte B y unos pocos datos de elegibilidad, sin identificar, bajo un acuerdo de socio comercial de HIPAA, y un contacto en la oficina del fondo.' },
      { title: 'Lo que cuesta', body: 'Nada. Si quiere que contactemos a los jubilados, usted envía una carta y paga solo una parte de lo que ahorra.' },
    ],
    dataLabel: 'Lo que pedimos',
    data: [
      'Rango de edad, condado, y si hay un cónyuge cubierto',
      'A quién le reembolsa la Parte B, y cuánto',
      'El monto o rango de la pensión, si lo tiene',
      'Si guarda las cartas del Seguro Social que los jubilados envían con sus reclamos',
    ],
    neverLabel: 'Lo que nunca necesitamos',
    never: ['Expedientes médicos', 'Números de Seguro Social', 'Datos bancarios'],
    estimate: 'Nuestro cálculo para un fondo con 50,000 jubilados, reembolso del 50% de la Parte B y pensiones modestas: unos $3–9 millones al año en primas que pagaría el estado. La revisión lo reemplaza con su cifra.',
  },

  pilot: {
    h2: 'Empiece con un envío',
    lead: 'Elija a los jubilados de su reembolso de la Parte B que probablemente califican. Usted envía una carta. Nosotros verificamos, presentamos, seguimos cada caso hasta la aprobación y lo renovamos cada año.',
    feesHead: ['Qué', 'Nuestra tarifa'],
    fees: [
      ['Un jubilado aprobado para un Programa de Ahorros de Medicare', 'El 20% de la prima que ya no paga, cada año que siga inscrito'],
      ['La renovación de cada año', 'Incluida'],
      ['Una negación, o sin respuesta', 'Nada'],
    ],
    measuresLabel: 'Lo que reportamos cada mes',
    measures: [
      'Jubilados que respondieron, y cuántos califican',
      'Solicitudes presentadas, aprobadas y pendientes',
      'Dólares de prima al año que deja de pagar el fondo',
      'Renovaciones enviadas a tiempo',
    ],
    guardrail: 'Si nadie es aprobado, el piloto no le cuesta nada al fondo.',
  },

  form: {
    h2: 'Pedir una revisión gratis',
    lead: 'Cuéntenos sobre su fondo. Le respondemos en dos días hábiles con el acuerdo y la lista de datos.',
    nameLabel: 'Su nombre',
    roleLabel: 'Su cargo',
    fundLabel: 'Fondo',
    emailLabel: 'Correo del trabajo',
    messageLabel: '¿Cuántos participantes y jubilados con Medicare, en qué estados, y el fondo se administra solo o con un administrador externo (TPA)?',
    messageHint: '(opcional)',
    submit: 'Enviar',
    note: 'Usaremos estos datos para responderle. Por favor no incluya expedientes de miembros ni información de salud.',
    success: 'Su solicitud quedó guardada. Le responderemos al correo que nos dio.',
    error: 'No pudimos guardar su solicitud. Por favor intente de nuevo.',
    generic: 'Por favor llene todos los campos.',
  },

  membersBand: {
    h2: '¿Le llegó una carta de su fondo?',
    body: 'Si su fondo le dio nuestro número, aquí está lo que hacemos, y lo que nunca hacemos.',
    link: 'Para miembros',
  },

  members: {
    meta: {
      title: 'Axolotl para miembros',
      description: 'Su fondo de beneficios trabaja con Axolotl para ayudar a los jubilados a que Nueva York pague su prima de la Parte B de Medicare. Usted escribe, nosotros llenamos los formularios, y nada se envía sin su sí. Gratis para usted.',
      shareAlt: 'El reporte mensual de Axolotl para un fondo.',
    },
    hero: {
      eyebrow: 'Para jubilados sindicales',
      h1Plain: 'Su fondo lo envió aquí.',
      h1Em: 'Esto es lo que somos.',
      sub: 'Axolotl trabaja con su fondo de beneficios para ayudar a los jubilados a que el estado de Nueva York pague su prima de la Parte B de Medicare, $202.90 al mes en 2026. Usted escribe. Nosotros llenamos los formularios. Nada se envía sin su sí. Es gratis para usted.',
      primary: 'Recibir un mensaje',
    },
    help: {
      h2: 'Con qué le podemos ayudar',
      items: [
        { title: 'Su prima de Medicare', body: 'Si sus ingresos están por debajo del límite de Nueva York, el estado puede pagar toda su prima de la Parte B. Si hoy su fondo le devuelve la mitad, eso se acaba, y usted igual queda unos $100 al mes por delante.' },
        { title: 'Recetas', body: 'La Ayuda Adicional baja lo que paga por sus medicinas. Quien está en un Programa de Ahorros de Medicare la recibe automáticamente.' },
        { title: 'La renovación de cada año', body: 'El estado pide una renovación cada año. Le escribimos antes de la fecha y la enviamos con su sí.' },
        { title: 'Cuando algo cambia', body: 'Si se muda, cambian sus ingresos o fallece su cónyuge, escríbanos. Le explicamos qué significa y lo actualizamos.' },
      ],
    },
    rules: {
      h2: 'Cómo trabajamos',
      items: [
        { title: 'Nada se envía sin su sí', body: 'Le mostramos exactamente lo que se va a enviar. Usted responde SÍ, o no se envía.' },
        { title: 'Su fondo no ve su caso', body: 'Su fondo ve totales. Sabe su nombre solo si usted está de acuerdo, y solo lo que necesita.' },
        { title: 'Gratis para usted', body: 'Su fondo nos paga. Usted nunca paga, y nunca tomamos parte de su pago atrasado.' },
        { title: 'Una persona real cuando es difícil', body: 'Cuando un caso se complica, una persona de nuestro equipo se encarga.' },
      ],
    },
    join: {
      h2: 'Reciba un mensaje de nosotros',
      lead: 'Deje su número y le escribimos. En inglés o en español.',
    },
  },

  join: {
    phoneLabel: 'Su número de teléfono',
    placeholder: 'Su número de teléfono',
    submit: 'Escríbanme',
    note: 'Al enviar, acepta recibir mensajes de texto de Axolotl.',
    success: 'Gracias. Le escribiremos al {phone}.',
    error: 'Escriba un número de EE. UU. de 10 dígitos.',
    generic: 'No pudimos guardar su número. Por favor intente de nuevo.',
  },

  footer: {
    tagline: 'Que pague quien debe pagar, para fondos sindicales y sus miembros',
    links: [
      { label: 'Para miembros', href: '/es/members' },
      { label: 'Para empleadores', href: '/es/employers' },
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
