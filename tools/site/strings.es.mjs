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
    title: 'Mycelium: primas de la Parte B que pagaría el estado',
    description:
      'Algunos jubilados con reembolso de la Parte B califican para el Programa de Ahorros de Medicare de Nueva York, que paga la prima completa, y muchos no están inscritos. Mycelium los encuentra en los archivos del fondo, los inscribe por texto con su sí y lo renueva cada año. El fondo deja de pagar una prima que cubriría el estado. Se paga con los ahorros.',
    shareAlt:
      'El reporte mensual de Mycelium para un fondo: jubilados aprobados para un Programa de Ahorros de Medicare, renovaciones enviadas, solicitudes esperando al estado.',
  },

  a11y: {
    skip: 'Saltar al contenido',
    home: 'Inicio de Mycelium',
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
    sub: 'Algunos de los jubilados con su reembolso de la Parte B califican para el Programa de Ahorros de Medicare de Nueva York, que paga la prima completa, y muchos no están inscritos. Una revisión gratis de su archivo le dice cuántos. Mycelium los inscribe por texto con su sí y lo renueva cada año. Con un reembolso de la mitad, reciben unos $100 más al mes. Su fondo deja de pagar. Usted paga una parte de lo que ahorra.',
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
      alt: 'Conversación de texto en un teléfono. Una jubilada pregunta si la carta del fondo sobre la Parte B es real. Mycelium le dice que Nueva York paga toda la prima de la Parte B con ingresos de menos de $2,494 al mes y le pregunta si es solo ella y cuánto recibe antes del descuento de Medicare. Recibe $2,050 sola, así que califica: el estado pagaría los $202.90 completos, la mitad del fondo se acaba y le quedan unos $101 más al mes, más Ayuda Adicional con sus recetas. Mycelium ya llenó la solicitud y se encargará de la renovación anual; ella responde SÍ, se envía, y Mycelium le escribirá cuando el estado la confirme.',
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
    h2Em: 'no están inscritos.',
    lead: 'El Programa de Ahorros de Medicare de Nueva York paga toda la prima de la Parte B a un jubilado que recibe hasta unos $2,494 al mes antes de descuentos, o $3,375 una pareja, y los ahorros no cuentan. Cerca de 4 de cada 10 personas que califican para QI, el nivel en que cae la mayoría de los jubilados con reembolso, no están inscritas. Cuando una de ellas está en su reembolso, su fondo paga una prima que cubriría el estado.',
    stats: {
      eyebrow: 'La regla',
      example: 'Nueva York, 2026',
      rows: [
        { v: '$202.90', l: 'Prima de la Parte B, cada mes', note: 'La prima estándar de 2026. CMS.' },
        { v: '~$2,494', l: 'Al mes, una persona, antes de descuentos', note: 'El límite de Nueva York con la exclusión de $20. Unos $3,375 para una pareja.' },
        { v: 'Ninguna', l: 'Prueba de bienes en Nueva York', note: 'Los ahorros y la casa no cuentan.' },
        { v: '4 de 10', l: 'Elegibles para QI, sin inscribirse', note: 'Urban Institute y West Health, datos de 2021–23.' },
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
        member: 'Ya no paga la prima por adelantado para esperar el reembolso, y recibe Ayuda Adicional con sus recetas.',
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
    note: 'Prima: Parte B estándar de 2026. Límites: QI-1 de Nueva York, 2026, ingreso bruto con la exclusión de $20. Inscripción: Urban Institute y West Health (2026), datos de 2021–23. La Ayuda Adicional llega automáticamente con un Programa de Ahorros de Medicare.',
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
      contact: 'Mycelium',
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
      alt: 'Conversación de texto en un teléfono, seis semanas después de solicitar. Mycelium le dice a una jubilada que Nueva York la aprobó y que el Seguro Social deja de descontarle $202.90 desde mayo. Ella pregunta si su cheque sube; sí, y la mitad del fondo se acaba el mismo mes, así que le quedan unos $101 más al mes, y recibe Ayuda Adicional con sus recetas. Mycelium le dice que se renueva cada año y que le escribirá en el otoño; ella acepta, y Mycelium le pide que escriba si cambian sus ingresos o su dirección.',
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
    lead: 'Mycelium lleva un registro vivo de dónde está cada jubilado de su reembolso: en observación, probablemente elegible, contactado, de acuerdo, solicitud presentada, aprobado, por renovar. Lee lo que cambió en sus archivos y en las reglas, y solo hace avanzar a un jubilado cuando está seguro. Cuando no lo está, decide una persona.',
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

  about: {
    h2: 'Quiénes somos',
    body: [
      'El Congreso creó el Programa de Ahorros de Medicare justamente para estos jubilados, y más de un tercio de las personas que califican no están inscritas. Mycelium existe para cerrar esa brecha. Solo cobramos cuando un jubilado es aprobado y sigue cubierto.',
      'Mycelium lo construye Mitchell Howard, que trabajó en el equipo de alianzas con fondos de capital privado de Clay y estudió en Brown. Fideicomisarios, abogados de fondos e inversionistas pueden escribirnos con el formulario de abajo.',
    ],
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
      title: 'Mycelium para miembros',
      description: 'Su fondo de beneficios trabaja con Mycelium para ayudar a los jubilados a que Nueva York pague su prima de la Parte B de Medicare. Usted escribe, nosotros llenamos los formularios, y nada se envía sin su sí. Gratis para usted.',
      shareAlt: 'El reporte mensual de Mycelium para un fondo.',
    },
    hero: {
      eyebrow: 'Para jubilados sindicales',
      h1Plain: 'Su fondo lo envió aquí.',
      h1Em: 'Esto es lo que somos.',
      sub: 'Mycelium trabaja con su fondo de beneficios para ayudar a los jubilados a que el estado de Nueva York pague su prima de la Parte B de Medicare, $202.90 al mes en 2026. Usted escribe. Nosotros llenamos los formularios. Nada se envía sin su sí. Es gratis para usted.',
      primary: 'Recibir un mensaje',
    },
    help: {
      h2: 'Con qué le podemos ayudar',
      items: [
        { title: 'Su prima de Medicare', body: 'Si sus ingresos están por debajo del límite de Nueva York, el estado puede pagar toda su prima de la Parte B. Si hoy su fondo le devuelve la mitad, eso se acaba, y usted igual queda unos $100 al mes por delante. Si le devuelve todo, la prima deja de salir de su cheque, así que ya no espera el reembolso.' },
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
    note: 'Al enviar, acepta recibir mensajes de texto de Mycelium.',
    success: 'Gracias. Le escribiremos al {phone}.',
    error: 'Escriba un número de EE. UU. de 10 dígitos.',
    generic: 'No pudimos guardar su número. Por favor intente de nuevo.',
  },

  footer: {
    tagline: 'Que pague quien debe pagar, para fondos sindicales y sus miembros',
    links: [
      { label: 'Para miembros', href: '/es/members' },
      { label: 'Privacidad', href: '/privacy' },
      { label: 'Seguridad y confianza', href: '/security' },
    ],
  },
};
