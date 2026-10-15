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
      'Muchos jubilados con reembolso de la Parte B califican para el Programa de Ahorros de Medicare de Nueva York, que paga la prima completa. La mayoría nunca lo solicita. Mycelium los encuentra en los archivos del fondo, los inscribe por texto con su sí y lo renueva cada año. Los jubilados reciben más cada mes. El fondo deja de pagar. Se paga con los ahorros.',
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
    sub: 'Muchos jubilados con su reembolso de la Parte B califican para el Programa de Ahorros de Medicare de Nueva York, que paga la prima completa. La mayoría nunca lo solicita. Mycelium los encuentra en sus archivos, los inscribe por texto con su sí y lo renueva cada año. Ellos reciben unos $100 más al mes. Su fondo deja de pagar. Usted paga una parte de lo que ahorra.',
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
    estimate: 'Para un fondo con 50,000 jubilados, reembolso del 50% de la Parte B y pensiones mayormente menores de $500, el cálculo de arriba da unos $3 millones al año en primas que pagaría el estado (rango de $0.8 a $6.2 millones). La revisión lo reemplaza con su cifra.',
  },

  // Calculadora para fondos (/es#estimate). Borrador: revisar con un hablante nativo.
  fundCalc: {
    h2Plain: 'Su número,',
    h2Em: 'basado en los datos.',
    lead: 'Tres cosas que usted ya sabe. Lo demás viene de las reglas de Nueva York de 2026, datos del Censo sobre jubilados de Nueva York e investigaciones publicadas sobre inscripción. Cada supuesto aparece abajo, y el análisis gratuito lo reemplaza con sus propios archivos.',
    retireesLabel: 'Jubilados a quienes les reembolsa la Parte B',
    shareLabel: 'Cuánto de la prima les devuelve',
    shareOptions: [['0.5', 'La mitad'], ['1', 'Toda'], ['0.25', 'Una cuarta parte'], ['0.75', 'Tres cuartas partes']],
    pensionLabel: 'Pensión mensual típica de sus jubilados',
    pensionOptions: [
      ['with_pension', 'No sé'],
      ['under_500', 'Menos de $500'],
      ['500_999', 'De $500 a $999'],
      ['1000_1499', 'De $1,000 a $1,499'],
      ['1500_1999', 'De $1,500 a $1,999'],
      ['2000_plus', '$2,000 o más'],
    ],
    pensionHint: 'El tamaño de la pensión es lo que más pesa. Entre los neoyorquinos de 65 años o más con Medicare y pensión, cerca de la mitad de quienes reciben menos de $500 al mes están bajo el límite de Nueva York, y casi nadie por encima de $2,000.',
    resultsTitle: 'Lo que puede esperar en un año',
    range: '{low} a {high}',
    out: {
      pool: 'Jubilados que probablemente califican y no están inscritos',
      enrolled: 'Probablemente se inscriben tras su carta y nuestra ayuda',
      saved: 'Primas que Nueva York paga en lugar de usted, al año',
      fee: 'Nuestra tarifa, el 20% de eso',
      net: 'Lo que su fondo se ahorra, al año',
      retirees: 'Lo que vuelve a los cheques de los jubilados, al año',
    },
    ceiling: 'Si los {count} se inscribieran: {amount} al año.',
    perRetiree: 'Cada jubilado inscrito le ahorra a su fondo {amount} al año, cada año que siga inscrito.',
    timing: 'El ahorro empieza unos {months} meses después de que el jubilado dice que sí, y cerca del {retained} sigue inscrito cada año. Nosotros hacemos las renovaciones.',
    methodsTitle: 'Cómo lo calculamos',
    methods: [
      'Quién califica: Oficina del Censo, Encuesta sobre la Comunidad Estadounidense 2024, microdatos de Nueva York. Aplicamos las reglas de ingresos del MSP de Nueva York a los neoyorquinos de 65 años o más con Medicare y los agrupamos por ingreso total de pensiones (todas sumadas, así que un poco más que la de su fondo sola). Los rangos incluyen el margen de error de la encuesta.',
      'Dos cosas que la encuesta no capta empujan en direcciones opuestas. Las encuestas reportan las pensiones un poco por debajo, lo que hace nuestro porcentaje demasiado alto. Nueva York además resta las primas de seguro médico que paga el jubilado, incluidas las del fondo sindical, lo que lo hace demasiado bajo.',
      'Ya inscritos: cerca del 55% de quienes califican ya están inscritos (rango de 40% a 65%), según las estimaciones nacionales 2021–23 del Urban Institute y la estimación anterior de MACPAC para Nueva York. Quienes ya están inscritos normalmente ya no reciben su reembolso.',
      'Inscritos gracias al contacto: el 15% de las personas que contactamos (rango de 5% a 25%). Es el número más débil. Ningún estudio publicado lo mide para el MSP. Las cartas masivas del Seguro Social sumaron menos del 1% (GAO, 2004). Las cartas con ayuda para solicitar llegaron al 18% en un estudio aleatorio con adultos mayores y SNAP (Finkelstein y Notowidigdo, 2019).',
      'Tiempos y renovaciones: decisión en 45 días y unos 3 meses para que se actualicen los registros de Medicare (GAO); entre 11% y 17% de los nuevos inscritos pierden la cobertura en un año (KFF).',
    ],
    scanTitle: 'Lo que reemplaza el análisis gratuito',
    scanItems: [
      'El cálculo por pensión, con la pensión y el hogar reales de cada jubilado según sus archivos',
      'El cálculo de inscritos, con quiénes ya están inscritos',
      'Y luego una lista, para que una sola carta llegue a los jubilados correctos',
    ],
    cta: 'Obtenga su número real',
    noScript: 'Active JavaScript para cambiar los números. Las cifras corresponden al ejemplo.',
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
    calc: {
      h2: '¿Podría Nueva York pagar su prima de la Parte B?',
      lead: 'Un cálculo rápido con las reglas de Nueva York de 2026. Nada de lo que escriba aquí sale de esta página.',
      householdLabel: '¿Quiénes viven en su hogar?',
      householdOptions: [['1', 'Solo yo'], ['2', 'Yo y mi cónyuge']],
      medicareLabel: 'Si está casado: ¿cuántos tienen Medicare?',
      medicareOptions: [['1', 'Uno de los dos'], ['2', 'Los dos']],
      incomeLabel: 'Dinero que le llega cada mes',
      incomeHint: 'Seguro Social antes de descontar Medicare, pensiones y otros ingresos. Incluya los de su cónyuge.',
      wagesLabel: 'Sueldo del trabajo cada mes',
      wagesHint: 'Antes de impuestos. Déjelo en 0 si nadie trabaja.',
      premiumsLabel: 'Otras primas de seguro médico que paga cada mes',
      premiumsHint: 'Su plan sindical o de jubilado, Medigap, plan de medicinas, dental o de cuidado a largo plazo. No la Parte B. Nueva York las resta de sus ingresos.',
      fundLabel: '¿Su fondo le devuelve la prima de la Parte B?',
      fundOptions: [['0', 'No'], ['0.5', 'La mitad'], ['1', 'Toda']],
      partALabel: '¿Tiene la Parte A de Medicare (hospital)?',
      medicaidLabel: '¿Tiene Medicaid?',
      yesNo: [['yes', 'Sí'], ['no', 'No']],
      noYes: [['no', 'No'], ['yes', 'Sí']],
      resultsTitle: 'Su cálculo',
      premiumOne: '{premium} al mes',
      premiumEach: '{premium} al mes cada uno',
      QMB: 'Probablemente califica para QMB, la ayuda más completa. Nueva York pagaría su prima de la Parte B, {premiumText}, y sus deducibles y coseguros de Medicare.',
      QI: 'Probablemente califica para QI. Nueva York pagaría su prima de la Parte B, {premiumText}.',
      over: 'Parece estar unos {over} al mes por encima del límite de Nueva York. Si sus ingresos bajan, vuelva a calcular, o escríbanos y lo revisamos con más cuidado.',
      needs_part_a: 'Primero necesita la Parte A de Medicare. Si tiene 65 años o más y no la tiene, la compra de la Parte A de Nueva York le puede dar la Parte A y QMB juntas. Escríbanos y le ayudamos.',
      medicaid: 'Sus ingresos están en el rango de QI y usted tiene Medicaid. En Nueva York no puede tener los dos, así que tendría que escoger uno. Le podemos ayudar a comparar.',
      gain: 'Su cheque subiría unos {month} al mes, {year} al año.',
      gainNone: 'Su fondo ya paga su prima, así que su cheque se queda igual.',
      extraHelp: 'También recibiría Ayuda Adicional con las recetas, automáticamente.',
      note: 'Un cálculo, no una aprobación. Contamos los ingresos como lo hace Nueva York: se descuentan $20, $65 más la mitad del resto del sueldo, y las primas de seguro médico que usted paga. Los ahorros y su casa no cuentan. Si paga manutención ordenada por un tribunal, díganoslo; puede cambiar la respuesta. Nueva York toma la decisión.',
      cta: 'Recibir un mensaje',
      noScript: 'Active JavaScript para cambiar las respuestas. El cálculo corresponde a las respuestas de ejemplo.',
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
      { label: 'Para escuelas', href: '/es/schools' },
      { label: 'Para miembros', href: '/es/members' },
      { label: 'Privacidad', href: '/privacy' },
      { label: 'Seguridad y confianza', href: '/security' },
    ],
  },

  // ── la página principal: para distritos escolares ─────────────────────────────
  // Misma forma y mismas fuentes que strings.en.mjs.
  schools: {
    meta: {
      title: 'Mycelium: los niños reciben la ayuda, los distritos reciben los fondos',
      description:
        'Medicaid para estudiantes con IEP, el conteo de bajos ingresos que usa su fórmula de financiamiento, la asistencia: cada uno depende de que una familia firme un formulario, se inscriba o llegue a la escuela. Mycelium trabaja con cada familia por mensaje de texto, en inglés o español, con su sí. Los distritos pagan una tarifa fija por resultado.',
      shareAlt:
        'El registro mensual de un distrito de ejemplo en Mycelium: consentimientos de Medicaid devueltos, familias contadas por primera vez, estudiantes de vuelta en clase.',
    },

    nav: {
      outcomes: 'En qué trabajamos',
      how: 'Cómo funciona',
      funds: 'Para fondos sindicales',
      join: 'Revisión gratis',
    },

    hero: {
      eyebrow: 'Para distritos escolares y redes de escuelas chárter',
      h1Plain: 'Los niños reciben la ayuda.',
      h1Em: 'Su distrito recibe los fondos.',
      h1: 'Los niños reciben la ayuda. Su distrito recibe los fondos.',
      sub: 'Medicaid para estudiantes con IEP, el conteo de bajos ingresos que usa su fórmula de financiamiento, la asistencia: cada uno depende de que una familia firme un formulario, se inscriba en un programa o llegue a la escuela. Ninguna oficina tiene las horas para hacerlo con cada familia. Mycelium sí, por mensaje de texto, en inglés o español, y nada se envía sin el sí de la madre o el padre. Usted paga una tarifa fija solo por los resultados que se logran.',
      primary: 'Pedir una revisión gratis',
      secondary: 'Ver en qué trabajamos',
      trust: 'Para distritos y redes chárter en California, Nueva York e Illinois. Nada si nada cambia.',
      ledger: {
        eyebrow: 'Registro mensual',
        example: 'Distrito de ejemplo',
        rows: [
          { v: '212', l: 'Consentimientos de Medicaid devueltos', note: 'Estudiantes con IEP. Terapias que el distrito ya da, ahora facturables.' },
          { v: '87', l: 'Familias contadas por primera vez', note: 'Inscritas en CalFresh o Medi-Cal y luego reconocidas en el conteo de bajos ingresos.' },
          { v: '64', l: 'Estudiantes de vuelta a más del 90% de asistencia', note: 'Después de resolver un transporte, una receta o un formulario.' },
          { v: '130', l: 'Familias decidiendo', note: 'Respondieron y lo están pensando. Nada avanza sin un sí.' },
        ],
        foot: 'Un ejemplo, no un cliente.',
      },
      folder: {
        label: 'Registro mensual · Distrito de ejemplo',
        statuses: { done: 'Listo', waiting: 'Esperando un sí' },
        rows: [
          { label: '212 consentimientos', detail: 'Medicaid para los servicios del IEP.', status: 'done' },
          { label: '87 familias contadas', detail: 'Inscritas en CalFresh o Medi-Cal y reconocidas.', status: 'done' },
          { label: '64 estudiantes en clase', detail: 'Más del 90% de asistencia en el periodo.', status: 'done' },
          { label: '130 familias decidiendo', detail: 'Respondieron. Nada avanza sin un sí.', status: 'waiting' },
        ],
      },
    },

    outcomes: {
      h2Plain: 'El dinero existe.',
      h2Em: 'El papeleo se interpone.',
      lead: 'A los distritos se les deben fondos por estudiantes que ya atienden. Llegan solo cuando una familia firma, se inscribe o se presenta, y el trabajo para lograrlo es un formulario, una llamada o un transporte a la vez. Su personal sabe hacer cada uno. Nadie tiene las horas para hacerlo con cada familia. Estos son los resultados en los que trabajamos.',
      stats: {
        eyebrow: 'Datos públicos',
        example: 'Fuentes públicas',
        rows: [
          { v: '$431.6M', l: 'En Medicaid que las escuelas de la ciudad de Nueva York no cobraron, 2023–25', note: 'Contralor de NYC, 2026. Cerca de la mitad de las sesiones de terapia elegibles nunca se facturaron.' },
          { v: '26–50%', l: 'De los formularios de consentimiento de Medicaid incompletos, en un tercio de los distritos encuestados', note: 'AASA, AESA y NAME, 2022.' },
          { v: '22.6%', l: 'De los estudiantes de EE. UU. con ausentismo crónico en 2025', note: 'AEI, 45 estados. Era 15.4% en 2019.' },
          { v: '$14.66B', l: 'En subvenciones suplementarias y de concentración de LCFF en California, 2025–26', note: 'CDE. Siguen a cada estudiante contado como de bajos ingresos, aprendiz de inglés o en cuidado temporal.' },
        ],
      },
      caption: 'Los resultados en los que trabaja Mycelium, qué los detiene y quién gana',
      head: ['Resultado', 'Qué lo detiene', 'Qué recibe el distrito', 'Qué recibe la familia'],
      rows: [
        {
          outcome: 'Medicaid para estudiantes con IEP',
          blocked: 'El consentimiento único de la madre o el padre, un número de Medicaid en el expediente',
          district: 'Reembolso por terapias y servicios que ya ofrece',
          family: 'Los mismos servicios. El consentimiento no cambia nada de lo que recibe el niño y se puede retirar.',
        },
        {
          outcome: 'El conteo de bajos ingresos',
          blocked: 'Familias elegibles para SNAP o Medicaid (CalFresh o Medi-Cal en California) que nunca se inscribieron o nunca fueron reconocidas',
          district: 'Fondos de la fórmula por cada estudiante contado: LCFF en California, Foundation Aid en Nueva York, Evidence-Based Funding en Illinois',
          family: 'Ayuda para comida, cobertura médica y comidas escolares gratis',
        },
        {
          outcome: 'Asistencia',
          blocked: 'Un transporte, un formulario médico, una cobertura vencida, una mudanza',
          district: 'Días de aprendizaje, y fondos basados en asistencia en California y Texas',
          family: 'Un niño de vuelta en clase',
        },
        {
          outcome: 'Estudiantes sin vivienda estable',
          blocked: 'Familias que no saben que vivir con parientes puede contar bajo la ley McKinney-Vento',
          district: 'Los estudiantes correctos identificados, y el apoyo que exige la ley llegando a ellos',
          family: 'Transporte a la misma escuela, comidas gratis e inscripción sin los papeles de siempre',
        },
      ],
      note: 'Medicaid: auditoría de seguimiento del Contralor de NYC, julio de 2026. Consentimiento: encuesta de distritos de AASA, AESA y NAME, publicada por K-12 Dive, 2023. Bajo IDEA, un distrito necesita el consentimiento escrito, una sola vez, de la madre o el padre antes de facturar a Medicaid por primera vez los servicios de un niño (34 CFR 300.154). Ausentismo crónico: AEI, publicado por K-12 Dive, 2025. LCFF: Departamento de Educación de California, 2025–26.',
    },

    example: {
      h2Plain: 'Una familia,',
      h2Em: 'bien contada.',
      lead: 'En un distrito de California donde más del 55% de los estudiantes son de bajos ingresos, una familia que se inscribe en CalFresh o Medi-Cal es reconocida por el estado, y su estudiante cuenta para LCFF. La familia recibe ayuda con la comida y la cobertura médica. El distrito recibe fondos que ya debía tener.',
      brief: {
        eyebrow: 'Lo que vale un reconocimiento',
        example: 'California, estimación',
        rows: [
          { v: '~$9,750', l: 'Al año para el distrito, cuando se completa', note: 'Subvenciones suplementaria (20%) y de concentración (65%) sobre una base promedio de $11,465. El conteo promedia tres años, así que crece poco a poco.' },
          { v: 'Anual', l: 'El estudiante se reconoce de nuevo', note: 'Mientras la familia siga inscrita. Sin formulario de comidas que perseguir.' },
          { v: '$0', l: 'Lo que la familia nos paga', note: 'Pagan los distritos. Las familias nunca.' },
          { v: 'Fija', l: 'Nuestra tarifa por el resultado, acordada de antemano', note: 'Nada si la familia no se inscribe.' },
        ],
        foot: 'Estimaciones con tarifas públicas. La revisión gratis las reemplaza con los números de su distrito.',
      },
    },

    steps: {
      h2Plain: 'Cada familia, hasta el final.',
      h2Em: 'Nada avanza sin un sí.',
      lead: 'Mycelium lleva un registro al día de dónde está cada familia en cada resultado: probablemente elegible, contactada, de acuerdo, solicitud enviada, confirmada. Avanza a una familia solo cuando está seguro. Cuando no lo está, decide una persona de su equipo o del nuestro.',
      items: [
        { tag: 'Mapa', text: 'Leemos cómo se financia su distrito y dónde se atoran los resultados: la fórmula de su estado, su facturación a Medicaid, sus datos de inscripción y asistencia.' },
        { tag: 'Encontrar', text: 'Entran nombres: los estudiantes cuyas familias probablemente son elegibles, les falta un consentimiento o están faltando a clases.' },
        { tag: 'Contactar', text: 'Su distrito envía un mensaje con nuestro número. Las familias responden por texto en inglés o español, a cualquier hora.' },
        { tag: 'Sí', text: 'Nada se firma ni se envía hasta que la madre o el padre responde SÍ a exactamente lo que va a pasar.' },
        { tag: 'Confirmar', text: 'Seguimos cada caso hasta el resultado: el consentimiento en el expediente, la aprobación, el reconocimiento, el estudiante de vuelta en clase.' },
        { tag: 'Informar', text: 'Salen resultados: un registro mensual por escuela de lo que cambió y cuánto vale, con los casos difíciles en manos de su personal.' },
      ],
    },

    different: {
      h2Plain: 'Por qué esto no se hace',
      h2Em: 'ya.',
      items: [
        { title: 'Cada caso es pequeño. Hay miles.', body: 'Un formulario, una llamada, un transporte. Su personal sabe hacer cada uno. Nadie tiene las horas para hacerlo con cada familia, cada mes.' },
        { title: 'El trabajo está fuera de la escuela', body: 'La ayuda para comida, la cobertura médica y el transporte pasan por oficinas del condado y del estado. Trabajamos con las familias en todas ellas.' },
        { title: 'Solo la familia puede firmar', body: 'Ningún cruce de datos puede inscribir a nadie ni dar consentimiento. Lo hacemos con la madre o el padre, a partir de un mensaje en el que confían porque vino de su escuela.' },
        { title: 'Usted paga por resultados', body: 'Una tarifa fija por resultado, acordada de antemano. Nada por el contacto, nada por las familias que dicen que no.' },
      ],
    },

    never: {
      h2: 'Lo que nunca hacemos',
      items: [
        { title: 'Actuar sin un sí', body: 'Nada se envía, firma o presenta hasta que la madre o el padre responde SÍ a exactamente lo que va a pasar.' },
        { title: 'Compartir el caso de una familia', body: 'El distrito ve resultados y totales. Sabe más solo cuando la familia está de acuerdo, y solo lo que necesita.' },
        { title: 'Tocar la educación de un estudiante', body: 'Nunca cambiamos un IEP, una asignación, una calificación ni un servicio.' },
        { title: 'Cobrar a las familias', body: 'Las familias nunca nos pagan. Firmamos el acuerdo de privacidad de datos estudiantiles de su estado antes de ver un solo registro.' },
      ],
    },

    scan: {
      h2Plain: 'Empiece con una revisión gratis',
      h2Em: 'de sus propios datos.',
      lead: 'En 30 días le mostramos, en dólares, lo que está esperando a las familias de su distrito, resultado por resultado, y cuántos estudiantes hay detrás de cada número.',
      cards: [
        { title: 'Lo que recibe', body: 'Para cada resultado: cuántos estudiantes probablemente están afectados, cuánto vale al año y qué escuelas tienen más. Ningún nombre sale del distrito a menos que usted lo pida.' },
        { title: 'Lo que da', body: 'Un archivo de estudiantes sin identificar, bajo su acuerdo de privacidad de datos, y un contacto en la oficina del distrito.' },
        { title: 'Lo que cuesta', body: 'Nada. Si quiere que contactemos a las familias, usted envía un mensaje y paga solo por resultados.' },
      ],
      dataLabel: 'Lo que pedimos',
      data: [
        'Grado, escuela e idioma del hogar',
        'Si tiene IEP y los servicios de cada IEP',
        'Situación de Medicaid y de comidas gratis, y cómo se determinó',
        'Días inscrito y días ausente',
      ],
      neverLabel: 'Lo que nunca necesitamos',
      never: ['Números de Seguro Social', 'Expedientes médicos', 'Calificaciones o expedientes disciplinarios'],
      estimate: 'Para un distrito de California por encima del 55%, cada 100 estudiantes contados por primera vez valen cerca de $975,000 al año cuando se completa. La revisión lo reemplaza con su número.',
    },

    pilot: {
      h2: 'Empiece con un resultado en algunas escuelas',
      lead: 'Elija el resultado que más le importa y algunas escuelas. Usted envía un mensaje. Nosotros contactamos a las familias, seguimos cada caso y le informamos cada mes.',
      feesHead: ['Qué', 'Nuestra tarifa'],
      fees: [
        ['Un consentimiento de Medicaid devuelto para un estudiante con IEP', 'Una tarifa fija, acordada de antemano'],
        ['Una familia inscrita y contada por primera vez', 'Una tarifa fija, acordada de antemano'],
        ['Un estudiante con ausentismo crónico de vuelta a más del 90% durante un periodo completo', 'Una tarifa fija, acordada de antemano'],
        ['Una familia que no responde, no es elegible o dice que no', 'Nada'],
      ],
      measuresLabel: 'Lo que informamos cada mes',
      measures: [
        'Familias contactadas, en qué idioma, y cuántas respondieron',
        'Consentimientos devueltos, inscripciones aprobadas y estudiantes reconocidos',
        'Asistencia de los estudiantes con quienes trabajamos',
        'Fondos estimados ganados, por escuela',
      ],
      guardrail: 'Si nada cambia, el piloto no le cuesta nada al distrito.',
    },

    form: {
      h2: 'Pida una revisión gratis',
      lead: 'Cuéntenos sobre su distrito. Le respondemos en dos días hábiles con el acuerdo de datos y la lista de datos.',
      nameLabel: 'Su nombre',
      roleLabel: 'Su cargo',
      fundLabel: 'Distrito o red',
      emailLabel: 'Correo del trabajo',
      messageLabel: '¿Cuántos estudiantes, en qué estado y qué resultado le importa más?',
      messageHint: '(opcional)',
      submit: 'Enviar',
      note: 'Usaremos estos datos para responderle. Por favor no incluya expedientes de estudiantes.',
      success: 'Guardamos su solicitud. Le responderemos al correo que nos dio.',
      error: 'No pudimos guardar su solicitud. Inténtelo de nuevo.',
      generic: 'Por favor llene todos los campos.',
    },

    fundsBand: {
      h2: '¿Administra un fondo sindical?',
      body: 'Mycelium también ayuda a los fondos a dejar de pagar primas de la Parte B de Medicare que pagaría Nueva York, con el sí de cada jubilado.',
      link: 'Para fondos sindicales',
    },

    footer: {
      tagline: 'Ayuda para las familias, fondos para las escuelas que las atienden',
      links: [
        { label: 'Para fondos sindicales', href: '/es/funds' },
        { label: 'Privacidad', href: '/privacy' },
        { label: 'Seguridad y confianza', href: '/security' },
      ],
    },
  },

  // ── la página principal: un día de escuela, del amanecer a la noche ───────────
  // Misma forma y mismas fuentes que strings.en.mjs.
  home: {
    meta: {
      title: 'Mycelium: cuando a las familias les va mejor, a las escuelas también',
      description:
        'Cada día que un estudiante falta, la escuela pierde fondos. Cada familia que nunca se inscribe en ayuda para comida o Medicaid es un estudiante por el que a la escuela no le pagan. Mycelium le da a cada familia un ayudante patrocinado por su escuela: un agente de IA que trabaja para ella, por mensaje de texto, en su idioma. Las familias reciben lo que les corresponde. Las escuelas cobran cuando se logra el resultado.',
      shareAlt: 'Mycelium: cuando a las familias les va mejor, a las escuelas también.',
    },

    nav: {
      why: 'Por qué se atora',
      how: 'Cómo funciona',
      schools: 'Escuelas',
      funds: 'Fondos sindicales',
      join: 'Hablemos',
    },

    hero: {
      chip: { time: '7:15 AM', label: 'Un día de escuela' },
      agents: [
        'Los equipos de ventas tienen agentes.',
        'Los fondos de inversión tienen agentes.',
        'Los abogados tienen agentes.',
        'Los reclutadores tienen agentes.',
        'Los centros de soporte tienen agentes.',
        'Las startups tienen agentes.',
      ],
      agentsLast: 'Las familias tienen',
      agentsStrike: 'una pila de formularios.',
      h1Plain: 'Cuando a las familias les va mejor,',
      h1Em: 'a las escuelas también.',
      h1: 'Cuando a las familias les va mejor, a las escuelas también.',
      sub: 'Cada día que un estudiante falta, la escuela pierde fondos. Cada familia que nunca se inscribe en ayuda para comida o Medicaid es un estudiante por el que a la escuela no le pagan. Mycelium le da a cada familia un ayudante patrocinado por su escuela: un agente de IA que trabaja para ella, por mensaje de texto, en su idioma. Las familias reciben lo que les corresponde. Las escuelas cobran cuando se logra el resultado.',
      primary: 'Hablemos',
      secondary: 'Seguir un día de escuela',
      trust: 'Nada sale sin el sí de la familia. En inglés o español.',
      folder: {
        label: 'Primaria Lincoln, hoy · Ejemplo',
        statuses: { done: 'Listo', waiting: 'Esperando un sí' },
        rows: [
          { label: 'Medi-Cal de Maya renovado', detail: 'La renovación llegó a una dirección vieja.', status: 'done' },
          { label: 'Un pase de transporte', detail: 'Para las mañanas en que no llega el autobús.', status: 'done' },
          { label: 'Consentimiento de Leo', detail: 'Terapia del habla que la escuela ya puede facturar.', status: 'done' },
          { label: 'Solicitud de CalFresh', detail: 'Enviada. El condado decide en 30 días.', status: 'waiting' },
        ],
      },
    },

    phoneAltPrefix: 'Conversación de ejemplo con Mycelium, el ayudante de una familia.',
    phoneYou: 'Mamá',
    caption: 'Conversaciones de ejemplo. Escuela y familia ficticias.',

    phones: [
      {
        meta: 'Hoy',
        time: '7:15 AM',
        turns: [
          { in: 'Hola, soy Mycelium, el ayudante para familias de la Primaria Lincoln. Maya ha faltado algunas mañanas. ¿Algo le complica ir a la escuela? Transporte, formularios, seguro médico.' },
          { out: 'Se le acabó el inhalador y en la farmacia dicen que su Medi-Cal no está activo' },
          { in: 'Eso pasa cuando la renovación llega a una dirección vieja. ¿Cuál es su dirección ahora?' },
          { out: '88 Pine Ave apt 3. Nos mudamos' },
          { in: 'Gracias. La renovación está lista. Responda SÍ y la envío al condado.' },
          { out: 'SÍ' },
          { in: 'Enviada. Le escribo el día que esté activa.' },
          { out: 'Muchas gracias' },
        ],
      },
      {
        meta: 'Martes',
        time: '7:02 AM',
        turns: [
          { out: 'Otra vez no pasó el autobús. Maya va a llegar tarde' },
          { in: 'Lo siento. La ruta 12 ha llegado tarde toda la semana. Su familia califica para un pase de transporte estudiantil gratis, válido en el autobús de las 7:10 desde Pine y 3rd.' },
          { in: 'Llené la solicitud del pase. Responda SÍ y la envío al distrito.' },
          { out: 'SÍ' },
          { in: 'Enviada. El pase llega por correo esta semana.' },
          { in: '¿Quiere que avise a la oficina que Maya va en camino?' },
          { out: 'Sí por favor' },
          { in: 'Listo. La marcaron como retrasada, no ausente.' },
          { out: 'Gracias' },
          { in: 'Con gusto. El viernes reviso que haya llegado el pase.' },
        ],
      },
      {
        meta: 'Jueves',
        time: '9:10 AM',
        turns: [
          { in: 'Buenas noticias: el condado renovó el Medi-Cal de Maya. Está activo otra vez desde hoy.' },
          { out: 'Por fin' },
          { in: 'La farmacia de la 3rd puede surtir su inhalador esta tarde. ¿Quiere que llame para que lo tengan listo?' },
          { out: 'Sí por favor' },
          { in: 'Listo. Estará después de las 2.' },
          { in: 'Medi-Cal se renueva cada año. Le escribo antes de la próxima para que no se venza otra vez.' },
          { out: 'Me salvó la vida' },
          { in: 'Si el asma la deja en casa otra vez, avíseme. Puedo avisar a la escuela y conseguirle una nota del doctor.' },
          { out: 'Ok, así lo haré' },
          { in: 'El lunes le pregunto cómo sigue.' },
        ],
      },
      {
        meta: 'Jueves',
        time: '12:10 PM',
        turns: [
          { in: 'Una cosa más. Con su nueva renta, su familia probablemente califica para CalFresh: dinero para comida cada mes. Además Maya y Leo tendrían comidas escolares gratis, sin formulario.' },
          { out: 'Cuánto tiempo toma' },
          { in: 'Unos ocho minutos, por texto. Ya tengo su dirección y sus ingresos de la renovación.' },
          { out: 'ok hagámoslo' },
          { in: 'Tres preguntas. ¿Cuántas personas viven con usted, contándola a usted?' },
          { out: '4. yo, mi mamá, Maya y Leo' },
          { in: 'Gracias. Llené la solicitud. Responda SÍ y la envío al condado.' },
          { out: 'SÍ' },
          { in: 'Enviada. El condado tiene 30 días para decidir, y yo le doy seguimiento.' },
        ],
      },
      {
        meta: 'Viernes',
        time: '3:20 PM',
        turns: [
          { in: 'La escuela de Leo puede facturar a Medi-Cal la terapia del habla que ya recibe. Necesitan su autorización una sola vez.' },
          { in: 'No cambia su terapia, nunca le cuesta nada y la puede retirar cuando quiera.' },
          { out: '¿Se gastan sus beneficios?' },
          { in: 'No. Por ley no puede reducir su cobertura ni subir lo que usted paga.' },
          { out: 'ok entonces sí' },
          { in: 'Aquí está el consentimiento, lleno con los datos de Leo. Responda SÍ para firmarlo y lo envío a la escuela.' },
          { out: 'SÍ' },
          { in: 'Firmado y enviado. La escuela confirmó que lo tiene.' },
          { out: 'Qué fácil' },
          { in: 'Esa es la idea.' },
        ],
      },
      {
        meta: 'Hoy',
        time: '6:30 PM',
        turns: [
          { out: 'Pregunta. Mi casero dice que la renta sube $200 en enero. ¿Hay alguna ayuda para eso?' },
          { in: 'Puede que sí. Su condado tiene un programa de ayuda para la renta, y con cuatro personas y sus ingresos probablemente está por debajo del límite.' },
          { in: 'Puedo revisar los detalles y llenar la solicitud con usted este fin de semana. ¿Quiere?' },
          { out: 'Sí. ¿La escuela ve esto?' },
          { in: 'No. La escuela solo ve lo que preguntó, como si Maya está llegando a clases. Esto queda entre nosotros a menos que usted diga otra cosa.' },
          { out: 'ok qué bueno' },
          { in: 'Entonces el sábado en la mañana. Tenga a la mano su contrato de renta.' },
          { out: 'Va. Buenas noches' },
        ],
      },
    ],

    depend: {
      chip: { time: '8:30 AM', label: 'Primera campana' },
      h2Plain: 'Cada asiento vacío',
      h2Em: 'es dinero.',
      lead: 'Se toma asistencia, y en California y Texas a las escuelas les pagan por día. Una familia que nunca se inscribe en los programas que le corresponden es un estudiante por el que a la escuela no le pagan. Lo que a una escuela le financian llega muy dentro de la vida familiar. Lo que su personal puede hacer termina en la puerta del salón.',
      caption: 'Cómo el resultado de una familia cambia el dinero de una escuela, y dónde se atora',
      head: ['Cuando esto pasa para una familia', 'Qué significa para el presupuesto de la escuela', 'Dónde se atora'],
      rows: [
        { life: 'Un niño llega a la escuela', money: 'En California y Texas a las escuelas las financian por asistencia diaria. Oakland perdió cerca de $90 por cada estudiante ausente, cada día.', stuck: 'Un transporte que no llegó, un inhalador que se acabó' },
        { life: 'Una familia se inscribe en ayuda para comida o Medicaid', money: 'El estudiante cuenta como de bajos ingresos, y la escuela recibe más por estudiante. En un distrito de California con mucha pobreza, hasta cerca de $9,750 al año.', stuck: 'Un formulario que nadie explicó, en un idioma que nadie hablaba' },
        { life: 'Una madre o un padre firma el consentimiento de Medicaid para la terapia de su hijo', money: 'La escuela puede facturar a Medicaid servicios que ya da. La ciudad de Nueva York dejó sin cobrar $431.6 millones en tres años.', stuck: 'Un formulario que se fue a casa en una mochila' },
      ],
      note: 'Oakland: EdSource, 2025. Subvenciones suplementarias y de concentración de LCFF en California, CDE 2025–26; el conteo promedia tres años, así que crece poco a poco. Nueva York: auditoría de seguimiento del Contralor de NYC, 2026.',
    },

    why: {
      chip: { time: '10:15 AM', label: 'La oficina' },
      h2Plain: 'Todos quieren al niño en la escuela.',
      h2Em: 'No es trabajo de nadie.',
      lead: 'La mamá lo quiere. La maestra lo quiere. A la escuela le pagan por eso. Lo llamamos alineación varada: resultados que una escuela y sus familias quieren por igual, pero que nunca pasan porque alcanzarlos cuesta más de lo que cualquiera puede gastar. Cada caso es pequeño y queda entre oficinas. Un administrador de casos escolar típico lleva de 110 a 125 estudiantes.',
      cards: [
        { title: 'Cartas a casa', body: 'Les dicen a las familias qué hacer. Llegan a todos y cambian poco, porque la información sola rara vez mueve a alguien.' },
        { title: 'Coordinadores y administradores de casos', body: 'Hacen el trabajo con las familias, y funciona. Pero una persona solo puede llevar a cierto número.' },
        { title: 'Un ayudante para cada familia', body: 'Hace el trabajo con cada familia, las veces que haga falta, para cada estudiante. Eso es nuevo.' },
      ],
      changed: 'Qué cambió: en un experimento, ocho minutos de ayuda para llenar la solicitud federal de ayuda estudiantil subieron la inscripción universitaria de 34% a 42%. La información sola no cambió nada. Un agente de IA ahora puede pasar esos ocho minutos con cada familia.',
      note: 'Carga de los administradores de casos: un estudio financiado por el National Institute of Justice. Solicitud de ayuda estudiantil: el experimento de H&R Block de Bettinger, Long, Oreopoulos y Sanbonmatsu, resumido por J-PAL.',
    },

    week: {
      chip: { time: '12:10 PM', label: 'Mediodía' },
      h2Plain: 'Trabaja con cada familia.',
      h2Em: 'Toda la semana.',
      lead: 'Transporte, renovaciones, solicitudes, consentimientos. Cada uno es pequeño. Cada uno es algo que la familia necesitaba, y algo por lo que a la escuela le pagan.',
      prev: 'Anterior',
      next: 'Siguiente',
      trackLabel: 'La semana de una familia, una conversación a la vez',
      cards: [
        { title: 'Cómo llegar a la escuela', money: 'Un día de asistencia en lugar de un día perdido.' },
        { title: 'Cobertura renovada', money: 'Un inhalador surtido, y menos días enfermo.' },
        { title: 'Ayuda para comida, en ocho minutos', money: 'Comida para la familia. Un estudiante que la escuela ahora cuenta.' },
        { title: 'Un consentimiento, firmado una vez', money: 'Terapia que la escuela ya da, ahora facturable.' },
      ],
    },

    school: {
      chip: { time: '3:40 PM', label: 'Después de la campana' },
      h2Plain: 'Entran nombres.',
      h2Em: 'Salen resultados.',
      lead: 'Mycelium también trabaja dentro de la escuela. Aprende sus metas, reglas y fondos de su personal, y se conecta a los sistemas que ya usa. Sus registros muestran quién podría necesitar ayuda. Usted ve los resultados por los que paga, nunca el aviso de desalojo ni la abuela enferma.',
      steps: [
        { tag: '01 · Aprender', text: 'Sus metas, reglas y fondos, de su personal' },
        { tag: '02 · Ofrecer', text: 'Un mensaje de la escuela: aquí hay un ayudante para su familia' },
        { tag: '03 · Ayudar', text: 'Por texto, en su idioma, con cada oficina a su alrededor' },
        { tag: '04 · Informar', text: 'Qué cambió y cuánto vale. Los casos difíciles van a su personal' },
      ],
      ledger: {
        eyebrow: 'Primaria Lincoln, este mes',
        example: 'Un ejemplo',
        rows: [
          { v: '212', l: 'Consentimientos de Medicaid devueltos', note: 'Terapias que la escuela ya da, ahora facturables.' },
          { v: '87', l: 'Familias contadas por primera vez', note: 'Inscritas en CalFresh o Medi-Cal y luego reconocidas.' },
          { v: '64', l: 'Estudiantes de vuelta a más del 90% de asistencia', note: 'Días por los que la escuela vuelve a recibir fondos.' },
          { v: '40', l: 'Familias perdieron la misma parada de autobús', note: 'El problema de una familia es un caso. Cuarenta son una decisión de política.' },
        ],
        foot: 'Usted paga una tarifa fija por cada resultado, acordada de antemano. Nada por las familias que dicen que no.',
      },
    },

    helper: {
      chip: { time: '6:30 PM', label: 'La cena' },
      h2Plain: 'El ayudante le pertenece a la familia.',
      h2Em: 'La escuela lo patrocina.',
      lead: 'Trabaja para la familia, en lo que le esté complicando la vida, y en las metas de la escuela solo donde la familia esté de acuerdo. De otro modo, la IA personal les llegaría a las familias como les llegaron los asesores financieros: a las que más trabas tienen, al último. Las escuelas tienen lo necesario para cambiar eso.',
      items: [
        { title: 'Una razón para pagar', body: 'La escuela pierde dinero cuando estos resultados no pasan' },
        { title: 'Los registros', body: 'Puede ver quién necesita ayuda antes de que lo pida' },
        { title: 'Confianza', body: 'Las familias ya leen lo que la escuela envía' },
        { title: 'Permiso', body: 'Las oficinas rechazan a los agentes que llegan sin invitación. El que la escuela patrocina entra' },
      ],
      closer: 'Cuando el plan de salud o el condado sirven a la misma familia, pueden patrocinar el mismo ayudante. Un ayudante en lugar de siete portales.',
    },

    night: {
      chip: { time: '9:40 PM', label: 'Los niños duermen' },
      h2Plain: 'Todo',
      h2Em: 'resuelto.',
      lead: 'En lugar de una pila de cartas a casa y una lista de familias a las que nadie llegó, un resumen: qué se hizo, por qué le pagan a la escuela y qué sigue esperando un sí.',
      sumLabel: 'Primaria Lincoln, hoy',
      doneLabel: 'Listo',
      waitingLabel: 'Esperando',
      summary: [
        { done: true, title: 'Medi-Cal de Maya renovado', detail: 'El condado aprobó · inhalador surtido' },
        { done: true, title: 'Un pase de transporte para Maya', detail: 'Marcada como retrasada, no ausente' },
        { done: true, title: 'Consentimiento de Medicaid de Leo', detail: 'Firmado · la escuela puede facturar su terapia' },
        { done: false, title: 'CalFresh para la familia', detail: 'Enviado · el condado decide en 30 días' },
      ],
      securityLink: 'Lea cada límite, en palabras sencillas',
      privacyLink: 'Cómo manejamos la información',
      joinPlain: 'Mañana,',
      joinEm: 'empiece con un resultado.',
      joinLead: 'Cuéntenos qué le miden. Revisamos sus datos gratis, le mostramos lo que está varado, y empezamos con un resultado en algunas escuelas. Usted paga cuando se mueve.',
    },

    rules: [
      { title: 'Su sí lo envía.', body: 'Nada se presenta, firma ni comparte hasta que la familia dice que sí a exactamente lo que va a pasar.' },
      { title: 'Solo resultados buenos para ambos.', body: 'La escuela elige el resultado. Lo tomamos solo si también es bueno para la familia.' },
      { title: 'Entran nombres, salen resultados.', body: 'La escuela ve resultados, no vidas. Sabe más solo cuando la familia está de acuerdo.' },
    ],

    where: {
      h2: 'Dónde trabajamos',
      lead: 'Escuelas primero. La misma brecha aparece donde el dinero de una institución depende de la vida de su gente.',
      cards: [
        { title: 'Escuelas', body: 'Asistencia, consentimiento de Medicaid para estudiantes con IEP, inscripción en ayuda para comida y salud que cuenta para sus fondos, estudiantes sin vivienda estable.', link: 'Para escuelas', href: '/schools' },
        { title: 'Fondos sindicales de beneficios', body: 'Primas de la Parte B de Medicare que pagaría Nueva York, con el sí de cada jubilado y renovadas cada año.', link: 'Para fondos sindicales', href: '/funds' },
        { title: 'Su resultado', body: 'Si su dinero depende de las personas a quienes sirve, díganos qué resultado.', link: 'Hablemos', href: '#school-contact' },
      ],
    },

    form: {
      h2: 'Hablemos',
      lead: 'Cuéntenos a quién sirve y qué le miden. Le respondemos en dos días hábiles.',
      nameLabel: 'Su nombre',
      roleLabel: 'Su cargo',
      fundLabel: 'Escuela, distrito u organización',
      emailLabel: 'Correo del trabajo',
      messageLabel: '¿Qué resultado le importa más?',
      messageHint: '(opcional)',
      submit: 'Enviar',
      note: 'Usaremos estos datos para responderle. Por favor no incluya registros personales de nadie.',
      success: 'Gracias. Le responderemos al correo que nos dio.',
      error: 'No pudimos guardar su mensaje. Inténtelo de nuevo.',
      generic: 'Por favor llene todos los campos.',
    },

    footer: {
      tagline: 'Cuando a las familias les va mejor, a las escuelas también',
      links: [
        { label: 'Para escuelas', href: '/es/schools' },
        { label: 'Para fondos sindicales', href: '/es/funds' },
        { label: 'Privacidad', href: '/privacy' },
        { label: 'Seguridad y confianza', href: '/security' },
      ],
    },
  },
};
