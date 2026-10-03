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
    title: 'Axolotl: que pague quien debe pagar, para fondos de beneficios sindicales',
    description:
      'Axolotl encuentra a los miembros a quienes Medicare, el Seguro Social o el estado les deben ayuda, y los inscribe desde su lado, por texto, con su sí. Los miembros reciben primas más bajas, medicinas más baratas y ayuda con sus reclamos por discapacidad. El fondo deja de ser el primero en pagar. Se paga por aprobación.',
    shareAlt:
      'El reporte mensual de Axolotl para un fondo: primas de la Parte B que ahora paga el estado, solicitudes por discapacidad presentadas, miembros que cumplen 65 inscritos a tiempo.',
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
    eyebrow: 'Para fondos de beneficios sindicales',
    h1Plain: 'Su fondo paga cuentas',
    h1Em: 'que cubrirían Medicare y el estado.',
    h1: 'Su fondo paga cuentas que cubrirían Medicare y el estado.',
    sub: 'Axolotl encuentra a los miembros a quienes Medicare, el Seguro Social o el estado les deben ayuda, y los inscribe desde su lado, por texto, con su sí. Los miembros reciben primas más bajas, medicinas más baratas y ayuda con sus reclamos por discapacidad. El fondo deja de ser el primero en pagar. Usted paga solo por aprobaciones.',
    primary: 'Pedir una revisión gratis',
    secondary: 'Ver a dónde va el dinero',
    trust: 'Para fondos de salud y bienestar sindicales. Se paga por aprobación.',
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
        { label: 'Primas de la Parte B, 41 jubilados', detail: 'Aprobados en un Programa de Ahorros de Medicare. $49,900 al año menos para el fondo.', status: 'confirmed' },
        { label: 'Discapacidad, 3 miembros', detail: 'Solicitudes presentadas al Seguro Social.', status: 'requested' },
        { label: 'Cumplen 65, 12 miembros', detail: 'La Parte B empieza a tiempo.', status: 'confirmed' },
        { label: 'Casos nuevos, 8 miembros', detail: 'Solicitudes llenas.', status: 'waiting' },
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
    h2Plain: 'El fondo paga primero',
    h2Em: 'más seguido de lo que debería.',
    lead: 'Algunas de las cuentas más grandes de un fondo le corresponden a Medicare, al Seguro Social o al estado una vez que el miembro está inscrito en el programa correcto. La mayoría nunca lo está. Los formularios son difíciles, las reglas cambian a los 65 y al mes 24, y nadie los acompaña.',
    stats: {
      eyebrow: 'Fondos de salud sindicales',
      example: 'Nacional',
      rows: [
        { v: '1,478', l: 'Fondos de salud de varios empleadores', note: 'Cubren a 5.3 millones de participantes, sin contar familias. IFEBP.' },
        { v: '$13,121', l: 'Gasto medio por participante al año', note: 'IFEBP, 2022.' },
        { v: '44%', l: 'De los fondos cubren a jubilados después de los 65', note: 'Donde Medicare debería pagar primero. IFEBP, 2026.' },
        { v: '4 de 10', l: 'Personas elegibles sin un Programa de Ahorros de Medicare', note: 'MACPAC y NCOA, 2021–23.' },
      ],
    },
    head: ['Cuándo', 'Quién paga hoy', 'Quién debería pagar', 'Lo que recibe el miembro'],
    rows: [
      {
        when: 'Un jubilado por debajo del límite de ingresos del estado',
        now: 'El fondo, que reembolsa la prima de la Parte B',
        should: 'El estado, con un Programa de Ahorros de Medicare',
        member: 'Su parte de la prima de vuelta, y Ayuda Adicional con las recetas',
      },
      {
        when: 'Una prima de la Parte B que ya paga otro, o después de una muerte',
        now: 'El fondo, que la reembolsa de todos modos',
        should: 'Nadie. Ya está pagada, o nadie la debe',
        member: 'Nada cambia para el miembro',
      },
      {
        when: 'Un miembro con discapacidad que conserva la cobertura del fondo',
        now: 'El fondo, todo',
        should: 'Medicare primero, 24 meses después de una aprobación del Seguro Social por discapacidad',
        member: 'Un cheque por discapacidad, unos $1,483 al mes en promedio, y sin huecos en la cobertura',
      },
      {
        when: 'Un jubilado que califica para Ayuda Adicional',
        now: 'El plan de medicinas para jubilados del fondo',
        should: 'Medicare subsidia el plan por ese miembro',
        member: 'Medicinas más baratas',
      },
      {
        when: 'Un cónyuge con cobertura de su propio trabajo',
        now: 'El fondo, primero',
        should: 'El plan del cónyuge, primero',
        member: 'La misma atención, con los dos planes detrás',
      },
    ],
    note: 'Cheque por discapacidad: promedio del Seguro Social, 2024. Prima: Parte B estándar de 2026. El ahorro por discapacidad es mayor donde los jubilados por discapacidad conservan la cobertura del fondo por años. La diálisis después del mes 30 y cumplir 65 son distintos: los planes ya dejan de pagar primero, así que el hueco lo sufre el miembro. También nos encargamos de eso, como protección del miembro, no como ahorro del fondo.',
  },

  example: {
    h2Plain: 'Una jubilada,',
    h2Em: 'una carta, siete mensajes.',
    lead: 'El teléfono de arriba, en Nueva York, donde un Programa de Ahorros de Medicare cubre a una persona sola con ingresos de hasta unos $2,494 al mes antes de descuentos, y los ahorros no cuentan. El fondo envía una carta con el número. Lo demás pasa por texto.',
    brief: {
      eyebrow: 'Lo que vale una aprobación',
      example: 'Cifras de 2026',
      rows: [
        { v: '$202.90', l: 'Prima de la Parte B, cada mes', note: 'La prima estándar de 2026. El estado la paga una vez aprobada.' },
        { v: '$1,217', l: 'Al año que el fondo deja de pagar', note: 'Para un fondo que reembolsa la mitad de la prima.' },
        { v: '$1,217', l: 'Al año de vuelta en su cheque', note: 'Su mitad, más Ayuda Adicional con las recetas.' },
        { v: '$300', l: 'Nuestra tarifa, una vez', note: 'Se paga al aprobarse. Nada si la niegan.' },
      ],
      foot: 'El fondo recupera la tarifa en unos tres meses, y ahorra cada año que ella siga inscrita.',
    },
  },

  how: {
    phone: {
      contact: 'Axolotl',
      meta: 'Hoy',
      metaTime: '2:30 PM',
      thread: [
        { kind: 'in', text: 'Su fondo necesita una aprobación del Seguro Social por discapacidad para pagarle su pensión.' },
        { kind: 'out', text: 'Nunca solicité eso. No sabría ni por dónde empezar.' },
        { kind: 'in', text: 'Lo hacemos juntos. Solo necesito sus médicos y su último día de trabajo.' },
        { kind: 'out', text: 'El Dr. Okafor me operó la espalda. Mi último día fue el 14 de marzo.' },
        { kind: 'in', text: 'Lista: discapacidad del Seguro Social, último día 14 de marzo, Dr. Okafor. Responda SÍ para presentarla.' },
        { kind: 'out', text: 'SÍ' },
        { kind: 'in', text: 'Presentada. Confirmación 4417. Tarda unos seis meses. Le escribo en cada paso y envío la aprobación a su fondo.' },
      ],
      caption: 'Conversación de ejemplo. Miembro y fondo ficticios.',
      alt: 'Conversación de texto en un teléfono. Axolotl le dice a un miembro que su fondo necesita una aprobación del Seguro Social por discapacidad para pagarle su pensión por discapacidad. Nunca la ha solicitado. Axolotl le pide sus médicos y su último día de trabajo: el Dr. Okafor, 14 de marzo. Axolotl muestra la solicitud lista y le pide su sí; él responde SÍ y queda presentada, confirmación 4417.',
    },
  },

  disability: {
    h2Plain: 'Una pensión por discapacidad,',
    h2Em: 'y la aprobación que le faltaba.',
    lead: 'Solo cerca del 36% de las primeras solicitudes de discapacidad del Seguro Social se aprueban, y la decisión tarda seis meses o más. Los miembros la presentan solos, en papel, mientras están lastimados. Nosotros la presentamos con ellos, desde el primer mensaje.',
    brief: {
      eyebrow: 'Lo que vale una aprobación',
      example: 'Ejemplo',
      rows: [
        { v: '$1,483', l: 'Al mes para él', note: 'El cheque promedio de discapacidad del Seguro Social, 2024.' },
        { v: '24 meses', l: 'Hasta que Medicare pague primero', note: 'Después, el fondo paga en segundo lugar.' },
        { v: '1', l: 'Aprobación que inicia su pensión', note: 'Muchos fondos de pensiones la piden primero.' },
        { v: 'Una vez', l: 'Nuestra tarifa, al aprobarse', note: 'Nada si la niegan. Nunca de su pago atrasado.' },
      ],
      foot: 'Vale más donde los jubilados por discapacidad conservan la cobertura del fondo por años. Donde la cobertura termina en el mes 30, la aprobación evita que él quede sin cobertura.',
    },
  },

  steps: {
    h2Plain: 'Sus archivos encuentran el momento.',
    h2Em: 'El miembro dice que sí.',
    lead: 'El fondo ya sabe quién cumple 65, quién solicitó una pensión por discapacidad, a quién le reembolsa la Parte B y más o menos cuánto paga la pensión de cada jubilado. Eso basta para saber a quién escribir, y cuándo.',
    items: [
      { tag: 'Encontrar', text: 'Sus archivos de elegibilidad, reclamos y pensiones marcan el momento: un jubilado por debajo del límite del estado, un reembolso de la Parte B sin un miembro vivo que la pague, una solicitud de pensión por discapacidad, un miembro a nueve meses de cumplir 65.' },
      { tag: 'Contactar', text: 'El fondo envía una carta o un mensaje con el número. Los miembros responden desde su propio teléfono, en inglés o en español.' },
      { tag: 'Llenar', text: 'Axolotl hace unas pocas preguntas y llena la solicitud con lo que dice el miembro y lo que el fondo ya tiene.' },
      { tag: 'Sí', text: 'No se presenta nada hasta que el miembro responde SÍ a exactamente lo que va a pasar.' },
      { tag: 'Seguir', text: 'Seguimos cada caso hasta la aprobación. Una guía de cuidado, una persona real, se encarga de los difíciles.' },
      { tag: 'Contar', text: 'Usted recibe un reporte mensual: aprobaciones, y los dólares al año que pasaron a quien debe pagar.' },
    ],
  },

  different: {
    h2Plain: 'Por qué esto no se hace',
    h2Em: 'ya.',
    items: [
      { h: 'Cada pieza se vende por separado', p: 'Las empresas de discapacidad y de Medicare manejan un programa cada una, por teléfono y en papel. Las auditorías de dependientes llegan desde la oficina del fondo, años tarde. Nadie lo cubre todo para un fondo, desde una sola línea de texto.' },
      { h: 'Funciona desde el lado del miembro', p: 'El miembro recibe el cheque, la cobertura, la prima más baja. Por eso responde, y por eso el sindicato puede respaldar la carta.' },
      { h: 'Usted paga por aprobaciones', p: 'Sin cuota por miembro. Nada por verificar, nada por negaciones.' },
    ],
  },

  never: {
    h2: 'Lo que nunca hacemos',
    items: [
      { title: 'Actuar sin un sí', body: 'No se presenta, envía ni firma nada hasta que el miembro responde SÍ a exactamente lo que va a pasar.' },
      { title: 'Mostrarle un caso al fondo', body: 'El fondo ve totales. Sabe el nombre de un miembro solo si ese miembro está de acuerdo, y solo lo que necesita, como un reembolso que debe parar.' },
      { title: 'Empujar a nadie antes de tiempo', body: 'Durante los 30 meses en que la ley dice que el fondo paga primero por insuficiencia renal, no empujamos a nadie hacia Medicare. Nos aseguramos de que la Parte B empiece a tiempo después.' },
      { title: 'Cobrarles a los miembros', body: 'Los miembros nunca nos pagan, y nunca tomamos parte de su pago atrasado. Firmamos un acuerdo de socio comercial de HIPAA antes de ver un solo archivo.' },
    ],
  },

  scan: {
    h2Plain: 'Empiece con una revisión gratis',
    h2Em: 'de sus propios datos.',
    lead: 'En 30 días le mostramos, en dólares, dónde su fondo paga cuando deberían pagar Medicare, el Seguro Social, el estado u otra aseguradora, y cuántos miembros hay detrás de cada cifra.',
    cards: [
      { title: 'Lo que recibe', body: 'Un reporte de los dólares al año que paga el pagador equivocado, por fuga: Parte B reembolsada a jubilados que debería cubrir el estado, Parte B pagada dos veces o después de una muerte, miembros con discapacidad que aún esperan el Seguro Social y Medicare, otra cobertura. Lo más grande primero. Ningún nombre sale del fondo a menos que usted lo pida.' },
      { title: 'Lo que nos da', body: 'Sus archivos de elegibilidad, el resumen de reclamos y el archivo de reembolsos de la Parte B, bajo un acuerdo de socio comercial de HIPAA, y un contacto en la oficina del fondo.' },
      { title: 'Lo que cuesta', body: 'Nada. Si quiere que se arreglen los casos, contactamos a cada miembro por texto con su carta, y usted paga solo por aprobación.' },
    ],
    dataLabel: 'Lo que pedimos',
    data: [
      'Elegibilidad: fecha de nacimiento, parentesco, tipo de cobertura y fechas',
      'El estado de Medicare que ya tiene en sus archivos',
      'Un resumen de reclamos: códigos de diagnóstico y de procedimiento, montos pagados, cruce con Medicare',
      'Su archivo de reembolsos de la Parte B, si los da',
      'Si los tiene: montos de pensión y solicitudes de pensión por discapacidad',
    ],
    neverLabel: 'Lo que nunca necesitamos',
    never: ['Expedientes médicos completos', 'Números de Seguro Social', 'Datos bancarios'],
    estimate: 'Nuestro cálculo para un fondo con 50,000 jubilados, reembolso del 50% de la Parte B y pensiones modestas: entre $3 y $9 millones al año en primas que debería pagar el estado. La revisión lo reemplaza con su cifra.',
  },

  pilot: {
    h2: 'Empiece con un grupo',
    lead: 'Elija a los jubilados con el reembolso de la Parte B, o a los miembros que solicitan una pensión por discapacidad. Usted envía una carta. Nosotros verificamos, presentamos y seguimos cada caso hasta la aprobación.',
    feesHead: ['Aprobación', 'Nuestra tarifa'],
    fees: [
      ['Programa de Ahorros de Medicare', '$300, una vez'],
      ['Aprobación de discapacidad del Seguro Social', 'Una tarifa fija por aprobación, acordada con usted'],
      ['Parte B pagada dos veces o después de una muerte', 'Una parte de lo recuperado, acordada con usted'],
    ],
    measuresLabel: 'Lo que reportamos cada mes',
    measures: [
      'Miembros que escribieron, y cuántos califican',
      'Solicitudes presentadas, aprobadas y pendientes',
      'Dólares al año que ya no paga el fondo, por programa',
      'Días desde el primer mensaje hasta la aprobación',
    ],
    guardrail: 'Si no se aprueba a nadie, el piloto no le cuesta nada al fondo.',
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
      description: 'Su fondo de beneficios trabaja con Axolotl para ayudar a los miembros a recibir lo que les corresponde de Medicare, del Seguro Social y del estado. Usted escribe, nosotros llenamos los formularios, y nada se envía sin su sí. Gratis para usted.',
      shareAlt: 'El reporte mensual de Axolotl para un fondo.',
    },
    hero: {
      eyebrow: 'Para miembros y jubilados sindicales',
      h1Plain: 'Su fondo lo envió aquí.',
      h1Em: 'Esto es lo que somos.',
      sub: 'Axolotl trabaja con su fondo de beneficios para ayudar a los miembros a recibir lo que les corresponde de Medicare, del Seguro Social y del estado: primas más bajas, ayuda con las recetas, ayuda con reclamos por discapacidad. Usted escribe. Nosotros llenamos los formularios. Nada se envía sin su sí. Es gratis para usted.',
      primary: 'Recibir un mensaje',
    },
    help: {
      h2: 'Con qué le podemos ayudar',
      items: [
        { title: 'Su prima de Medicare', body: 'Si sus ingresos están por debajo del límite de su estado, el estado puede pagar su prima de la Parte B: $202.90 al mes en 2026. Si hoy su fondo le devuelve una parte, eso se acaba, y usted igual sale ganando.' },
        { title: 'Recetas', body: 'La Ayuda Adicional baja lo que paga por sus medicinas. Quien está en un Programa de Ahorros de Medicare la recibe automáticamente.' },
        { title: 'Discapacidad', body: 'Si no puede trabajar, le ayudamos a solicitar la discapacidad del Seguro Social y le enviamos la aprobación a su fondo.' },
        { title: 'Al cumplir 65', body: 'Le ayudamos a inscribirse en Medicare a tiempo, sin huecos y sin multa.' },
      ],
    },
    rules: {
      h2: 'Cómo trabajamos',
      items: [
        { title: 'Nada se envía sin su sí', body: 'Le mostramos exactamente lo que se va a enviar. Usted responde SÍ, o no se envía.' },
        { title: 'Su fondo no ve su caso', body: 'Su fondo ve totales. Sabe su nombre solo si usted está de acuerdo, y solo lo que necesita.' },
        { title: 'Gratis para usted', body: 'Su fondo nos paga. Usted nunca paga, y nunca tomamos parte de su pago atrasado.' },
        { title: 'Una persona real cuando es difícil', body: 'Cuando un caso se complica, una guía de cuidado se encarga.' },
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
