# Bitácora de uso de IA y diario de decisiones: ReserYa

| Dato | Detalle |
|---|---|
| Proyecto | ReserYa, plataforma de reservas para negocios locales de Ensenada. Proyecto final de Aplicaciones Web, UABC, Facultad de Ingeniería, Arquitectura y Diseño. |
| Autor | Ahhmed Affif Jalife Burgueño (376285) |
| Herramienta de IA | Claude, usado en la terminal (Claude Code) y en la app de escritorio, con conectores a Google Drive y Docs, y a Figma. Los agentes paralelos del 16 de noviembre corrieron en el modelo claude-opus-5-5; el resto del trabajo, con la versión Sonnet 5.5. |
| Periodo cubierto | Del 12 al 21 de noviembre de 2026 |
| Repositorio | https://github.com/AHHMED-J/ReserYa |
| Fuente de esta bitácora | Los mensajes del estudiante en las dos sesiones de trabajo con la IA, las respuestas de la IA, el historial de commits y los resultados de pruebas. Las fechas son hora de Tijuana. |

## 1. Resumen

La IA participó en todas las etapas: definir la idea, escribir los requerimientos, dibujar los wireframes y las pantallas de alta fidelidad, diseñar la base de datos, escribir casi todo el código y probar las integraciones. El estudiante decidió el producto: respondió una por una las preguntas de la IA, aprobó o rechazó cada propuesta y puso las reglas de trabajo de la sección 2. La IA propuso opciones, redactó documentos y programó.

Lo que se puede comprobar en el repositorio: 107 pruebas automáticas de la API que pasan, un pago real de Stripe en modo de prueba que se cobró y otro que se canceló, y calendarios reales de Google Calendar que crearon, leyeron y borraron eventos. Los errores más importantes de la IA aparecieron al probar contra servicios reales y no en las pruebas automáticas; están en la sección 5.

## 2. Reglas que puso el estudiante para trabajar con la IA

- No escribir código hasta que la idea estuviera completa. El 12 de noviembre la IA empezó a crear la página antes de tiempo y el estudiante lo corrigió (ver sección 5).
- Avisar cuando surja un requerimiento nuevo o cambie uno existente, y no tocar los documentos hasta recibir la instrucción de actualizarlos.
- Hacer un commit por cada logro, con mensaje significativo en español, a nombre del estudiante y sin línea de coautor de la IA.
- Colores sólidos en la interfaz: el degradado solo vive en el logo.
- Las cuentas externas (Google Cloud, Stripe, correo) las crea el estudiante. Las llaves se guardan en un archivo .env que no se sube al repositorio y no se pegan en el chat.
- Datos de demostración ficticios y credenciales de prueba únicamente.

## 3. Bitácora cronológica

### 12 de noviembre: idea, tecnología y documentos

| Qué pidió el estudiante | Qué propuso o hizo la IA | Resultado |
|---|---|---|
| Partir del PDF de la idea y hacerlo más grande: inteligencia artificial, Google Calendar y Apple Calendar. | Leyó el PDF y propuso un asistente de reservas en lenguaje natural, un agente de WhatsApp para el negocio y otras funciones con IA. | El estudiante eligió solo Google Calendar. Dejó la IA fuera del proyecto, para probar más adelante si su modelo local alcanza para cambiar horarios o resumir ventas. |
| Saber si Google Calendar se puede ver dentro de la web. | Explicó que un iframe no es buena opción (depende de cookies de terceros y Safari las bloquea) y recomendó usar la API de Calendar con componentes propios. | Se usó la API de Google Calendar. |
| Usar lo visto en clase (Vite, React) si conviene. | Revisó los trabajos de las semanas 1 a 11 y propuso el mismo stack de clase: Vite, React, Tailwind, shadcn y pnpm, más Express y PostgreSQL. | Stack aprobado. El estudiante respondió TypeScript y enseguida corrigió: "usamos javascript". Se usó JavaScript, con zod y ESLint en lugar de tipos. |
| Elegir entre nube y local. | Recomendó local por velocidad, costo y porque la demo corre desde su Mac. | "Todo local de momento". Postgres 17 quedó instalado en la Mac. |
| Primero la idea, no la página. | Había empezado a crear el proyecto de Vite. Lo borró todo, dejó solo la conexión con el repositorio y guardó la regla en su memoria. | El estudiante: "si ya empezaste con la pagina estas mal". Regla 1 de la sección 2. |
| Portada del Google Doc con el formato de sus portadas UABC. | Copió el formato de las portadas de sus laboratorios de Redes: logos UABC y FIAD, texto centrado, fecha. | Documento de la idea con portada. |
| Definir las funciones del producto. | Hizo varias rondas de preguntas, 27 en la primera. Propuso el concepto de recurso (persona o espacio) para cubrir tanto una barbería como una cancha. | El estudiante respondió cada pregunta. Quedaron 9 categorías, clases solo uno a uno, sin tatuajes, y una sola cuenta por negocio con PIN para el dueño. |
| Una forma sencilla de que los empleados vean el horario sin tener cuenta. | Propuso un enlace en vivo de solo lectura y un modo pantalla para una tablet en el local, mostrando solo nombre corto, servicio y hora. | Aprobado. Se implementó como la agenda en vivo. |
| Videos recomendados de cada tecnología, lista de pantallas y de funciones. | Buscó videos revisando canal y vistas de cada uno. | Lista entregada. |
| Requerimientos funcionales y no funcionales, en un Doc enlazado al original. | Los escribió con identificadores RF y RNF y prioridades. Creó el Doc de requerimientos con la misma portada. | Doc creado. Desde entonces se actualiza cada vez que aparece un requerimiento nuevo. |
| Diseñar primero las pantallas del cliente, en celular y luego computadora. | Recomendó celular primero (RNF-01). Dibujó los wireframes de baja fidelidad en Figma con una nota por pantalla que cita los RF. | El estudiante pidió ajustes: filtro de categorías compacto, quitar el botón "Disponible hoy" y agregar las pantallas para un cliente sin reservas. La IA los aplicó y actualizó los requerimientos (RF-58 a RF-63). |
| Continuar cuando Figma se interrumpía. | Varias llamadas fallaron por cortes de conexión y por el límite de llamadas del plan de Figma. La IA retomó cada vez desde donde quedó. | Wireframes de cliente en celular (360 por 800) y computadora (1280 por 800). |
| Pensar la base de datos y escribirla en un .md antes de crear nada. | Escribió docs/base-de-datos.md con 20 tablas y preguntas abiertas. Antes de dibujar el diagrama avisó que faltaban las pantallas del negocio y del administrador. | El estudiante respondió las preguntas y pidió esas pantallas. La IA dibujó los wireframes de negocio y administrador. |
| Decidir hacia dónde va el dinero y qué pasa con las citas por teléfono. | Propuso dos opciones para el dinero (A: cuenta de ReserYa; B: Stripe Connect por negocio). Propuso opciones de sincronización con Google. | "2 A", citas por teléfono fuera de ReserYa, y "Confirmo opción A" para revisar Google cada 30 a 60 segundos. Nacieron RF-69 a RF-74. |

### 13 de noviembre: diagrama, logo y alta fidelidad

| Qué pidió el estudiante | Qué propuso o hizo la IA | Resultado |
|---|---|---|
| Revisar las pantallas y verificar los requerimientos. | Corrigió 21 notas de los wireframes que citaban requerimientos equivocados. | El estudiante dio el visto bueno, con una excepción: en el wireframe del dueño se veía información delicada detrás del PIN. |
| Corregir esa pantalla. | Dejó cuatro cuadros grises vacíos detrás del PIN y quitó el subtítulo. | Corregido. |
| Crear el diagrama de clases y abrirlo en OpenUML. | Generó el archivo .mdj con las 21 tablas y 9 enums. | El estudiante preguntó por varias clases sin conexión. La IA explicó que son los enums y la tabla stripe_events, y que así es correcto en UML. |
| Otro Doc con capturas del diagrama y su explicación. | Creó el Doc "Diagrama de clases" con 5 capturas y 8 secciones. | Doc creado. |
| Cerrar el historial de pagos del dueño (RF-52) y subir lo hecho a git. | Propuso que el historial salga de la tabla payments. Hizo el primer commit con docs/ y lo subió. | El estudiante: "1, me parece bien". Primer commit publicado. |
| Un Doc con todas las pantallas. | Creó el Doc "Wireframes y flujos" con 99 pantallas y 11 tablas. | Doc creado y enlazado al de requerimientos. |
| Usar el logo que dio el estudiante y hacer propuestas de alta fidelidad en Figma. | El límite mensual de llamadas a Figma se agotó, así que generó dos propuestas (A y B) como archivos SVG editables. | El estudiante eligió la opción A. |
| Guía de estilo y pantallas de alta fidelidad. | Creó la guía de estilo (colores, tipografía Plus Jakarta Sans, componentes) y 13 pantallas con un generador. Quitó los degradados de la opción A. | Subido en 4 commits pequeños. |

### 16 de noviembre: implementación

| Qué pidió el estudiante | Qué propuso o hizo la IA | Resultado |
|---|---|---|
| Saber si faltaba algo para empezar a programar y qué modelo usar. | Dijo que faltaban cuentas externas, la fecha de entrega y el visto bueno. Recomendó Opus para las decisiones difíciles (esquema, sesiones, pagos, Google) y Sonnet para lo repetitivo. | El estudiante: "ya sabes que hacer puedes empezar la implementacion, utiliza los agentes que consideres necesarios". |
| Un commit por cada logro, con nombre en español y a su nombre. | Configuró el autor y quitó el coautor de IA de los commits. | Regla 3 de la sección 2. |
| Construir la aplicación. | Armó primero la base (monorepo, base de datos con restricción contra reservas empalmadas, sesiones, PIN del dueño) y repartió el resto entre cuatro agentes en paralelo, cada uno en su propia copia del repositorio y con su base de datos. | Dos agentes se detuvieron por el límite de uso de la API. La IA los reanudó cuando se restableció. Las pruebas pasaron de 26 a 48, 70 y 106 al juntar las ramas. |
| Fotos para la demostración. | Calculó 54 fotos (3 por negocio). Usó las 7 fotos del estudiante que servían y consiguió 47 en Pexels, revisándolas una por una en hojas de contacto. | 5 fotos del estudiante se descartaron por tener marcas, una captura de video o un letrero con nombre. En el repositorio solo se subieron las de Pexels, porque la licencia de las otras no se conoce. |
| Ver los commits y subirlos. | Explicó cómo ver el historial. Ante un "oks" ambiguo, preguntó antes de subir. | Subidos 43 commits a GitHub tras confirmar el estudiante. |
| Aplicar los cambios de un archivo propio, Cambios ReserYa.md. | Aplicó 4 cambios en el inicio y el menú del cliente. Agregó por su cuenta un botón de iniciar sesión en el celular, y lo dijo. | Commit f5c7baf. |

### 19 y 20 de noviembre: pulido y documentación

| Qué pidió el estudiante | Qué propuso o hizo la IA | Resultado |
|---|---|---|
| Avanzar un poco, con un commit por función completa, sin terminar todo. | Detectó que todas las pestañas se llamaban "ReserYa" y agregó un título por pantalla, la descripción de la página y el enlace "Saltar al contenido" (accesibilidad, RNF-04). | Commits 43bf6c2 y 2ad1a84. |
| Pasar a lo siguiente y recibir la lista de pendientes. | Actualizó los documentos con los cambios hechos al implementar: RF-75 (90 minutos de anticipación en solicitudes manuales), el Doc del diagrama y una sección nueva en docs/base-de-datos.md. Entregó la lista de pendientes. | Commit 4d51ed3. El estudiante pidió subir los commits. |

### 20 y 21 de noviembre: integraciones reales

| Qué pidió el estudiante | Qué propuso o hizo la IA | Resultado |
|---|---|---|
| Saber dónde configurar Google OAuth. | Guió el proceso en Google Cloud. Recomendó modo de prueba con usuarios de prueba y el permiso mínimo calendar.app.created. | El estudiante se perdió en Google Maps Platform; la IA le dio enlaces directos y le dijo que no activara facturación. |
| Preguntó si la IA podía controlar su computadora. | Recomendó que no: se vería el secreto de cliente de Google y ganaba muy poco, porque faltaban cuatro clics. | El estudiante llenó el formulario y guardó las credenciales en el .env. La IA verificó que estuvieran sin mostrar sus valores. |
| Error de acceso bloqueado de Google. | Explicó que el correo no estaba en la lista de usuarios de prueba. | El estudiante lo agregó. Inicio de sesión con Google y conexión de Calendar funcionando. |
| Mandó una captura con calendarios repetidos. | Encontró la causa (dos procesos creaban calendarios a la vez), la corrigió y escribió una prueba que falla sin el arreglo. | Commit b1f8839. El estudiante borró los sobrantes. |
| Probar la sincronización en los dos sentidos. | Guió tres pruebas y verificó cada resultado en la base de datos. | Una reserva aceptada creó su evento en Google. Un evento personal bloqueó el horario de la persona. Borrar el evento en Google canceló la reserva con reembolso. Mover un evento no se probó a mano. |
| Configurar Stripe en modo de prueba. | Dio los pasos, indicó que "Custom payment flow" era la opción correcta y corrigió el comando del webhook. | Llaves y webhook configurados por el estudiante, y comprobados por la IA sin mostrar los valores. |
| El pago mostraba "Ocurrió un error inesperado". | Reprodujo la llamada a Stripe, encontró que el parámetro payment_method_types ya no se acepta y lo cambió. | Commit d272fd0. Un pago de 200 pesos se cobró al aceptar (succeeded) y otro se canceló al rechazar (canceled). |
| Subir a GitHub y correos con su Gmail. | Subió 2 commits. Guió la contraseña de aplicación de Gmail. | Gmail rechazó las credenciales (error 535). El estudiante decidió dejar los correos en la consola y la IA vació el SMTP_URL del .env. |
| Arreglar los dos huecos de casos límite encontrados en la revisión. | Agregó una pantalla de error general (Algo salió mal, con Reintentar e Ir al inicio) y mensajes claros cuando la API no responde o no hay conexión. Comprobó la pantalla y los mensajes con pruebas de código. | Commit 7128ab6. |
| Revisar si se cumple lo que pide el profesor para la entrega. | Comparó el repositorio con el aviso: faltaban la bitácora y el diario de decisiones. Creó una guía en HTML con el mapa del proyecto. | Commit 33c4eb7 y esta bitácora. |

## 4. Diario de decisiones

Quién decidió: E es el estudiante, IA es una propuesta de la IA que el estudiante aprobó.

| Decisión | Alternativas | Quién | Motivo |
|---|---|---|---|
| Solo Google Calendar, sin Apple Calendar. | Google, Apple, ambos. | E | Apple Calendar "es mucho problema". |
| La IA no entra en el producto por ahora. | Asistente de reservas, agente de WhatsApp, resúmenes. | E | "Se extiende mucho el proyecto". Quedó como prueba futura con un modelo local. |
| JavaScript y no TypeScript. | TypeScript. | E | Es lo que se usó en clase. Los errores de tipos se cubren con zod y ESLint. |
| Todo local por ahora. | Nube o local. | IA | Más rápido, gratis y la demo corre desde la Mac del estudiante. |
| El negocio acepta la solicitud a mano, con opción de aceptación automática. | Confirmación inmediata para todos. | E | "Depende del negocio". |
| Se aparta el horario 10 minutos mientras se paga. La solicitud vence a las 12 horas o 1 hora antes de la cita. | Otros tiempos. | E | Valores dados por el estudiante. |
| El recurso (persona o espacio) como concepto único. | Un modelo por tipo de negocio. | IA | Funciona igual para una barbería y para una cancha. |
| Una cuenta por negocio, con PIN para el modo dueño. | Una cuenta por empleado. | E | Los empleados no necesitan cuenta. |
| Agenda en vivo por enlace y modo pantalla. | Cuentas de empleados. | IA | Forma sencilla de ver el horario sin cuentas. |
| Nueve categorías, clases solo uno a uno, sin tatuajes. | Más categorías, clases en grupo. | E | Evitar procesos largos que alarguen el proyecto. |
| Cancelación y anticipación de reserva configurables por negocio. | Reglas fijas. | E | "Elige el negocio". |
| Diseño para celular primero. | Computadora primero. | IA | La mayoría de los clientes usaría el teléfono. |
| El dinero entra a la cuenta de ReserYa en Stripe. | Stripe Connect por negocio. | E | Más simple y suficiente en modo de prueba (opción A). |
| Las citas por llamada o en persona quedan fuera de ReserYa. | Que la recepción las cree en la app. | E | No extender el proyecto. La recepción las agrega en Google Calendar. |
| Google Calendar se revisa cada 30 a 60 segundos, sin URL pública. | Notificaciones push de Google. | IA | No requiere URL pública, y sirve en local. |
| Una sucursal por negocio, reseñas sin respuesta del negocio, fotos con una llave de almacenamiento. | Varias sucursales, respuestas a reseñas, URL en la base. | E | Simplificar el modelo. La llave permite cambiar a la nube sin tocar la base. |
| El historial de pagos del dueño sale de la tabla payments. | Una tabla nueva. | IA | Ya guarda las fechas de cada estado del pago. |
| Estilo visual A, limpio y moderno, con colores sólidos. | Estilo B. | E | Elegido entre dos propuestas. |
| Implementar con agentes en paralelo, Opus para lo delicado y Sonnet para lo repetitivo. | Un solo agente. | IA | Tiempo corto: lo difícil debía salir bien a la primera. |
| Fotos de demostración de Pexels más las del estudiante que no tuvieran marcas. | Solo las del estudiante. | IA | Licencia libre y mejor aspecto. |
| Solicitudes manuales con al menos 90 minutos de anticipación (RF-75). | Usar la anticipación del negocio. | IA | La solicitud vence 1 hora antes: con menos de 90 minutos el negocio no alcanza a responder. Se informó al estudiante y se documentó. |
| Google Cloud en modo de prueba con permiso mínimo. | Publicar la app. | IA | No requiere verificación de Google. El permiso solo toca calendarios creados por ReserYa. |
| La IA no controla la computadora del estudiante en pasos con secretos. | Dejar que la IA llene el formulario. | IA | Se expondría el secreto de cliente de Google y la ganancia era mínima. |
| Correos en la consola, sin SMTP real. | Gmail con contraseña de aplicación. | E | Gmail rechazó las credenciales y los correos reales no son necesarios para la entrega. |

## 5. Errores de la IA y cómo se detectaron

| Fecha | Qué falló | Cómo se detectó | Corrección |
|---|---|---|---|
| 12 nov | La IA empezó a crear la página antes de que la idea estuviera completa. | El estudiante lo notó. | Borró todo, dejó solo la conexión con el repositorio y guardó la regla. |
| 12 nov | Dijo que los wireframes no traían requerimientos nuevos. | Al revisar de nuevo, la IA encontró funciones dibujadas sin requerimiento. | Se agregaron RF-64 a RF-68. |
| 12 nov | 21 notas de los wireframes citaban requerimientos que no correspondían. | Revisión cruzada contra el Doc de requerimientos. | Se corrigieron las 21 notas. |
| 13 nov | El wireframe del dueño mostraba información delicada detrás de la pantalla del PIN. | El estudiante lo vio al revisar las pantallas. | Se dejaron cuadros grises vacíos. |
| 13 nov | En RF-37, la IA interpretó que el pago ya cobrado de un "no asistió" no se reembolsa, sin que el estudiante lo hubiera dicho. | La propia IA lo marcó como interpretación suya. | Quedó señalado al estudiante para su revisión. |
| 16 nov | Dos agentes paralelos se cortaron por el límite de uso de la API. | Avisos de error de los agentes. | Su trabajo estaba guardado; se reanudaron cuando se restableció el límite. |
| 16 nov | Al iniciar sesión, la respuesta no traía los datos del negocio. | La IA lo vio al probar el proxy y el login por la API. | Corregido antes de repartir el trabajo. |
| 16 nov | Los agentes no habían visto la aplicación en un navegador. | La IA lo declaró: no tenía navegador en esa sesión. | Quedó como pendiente del estudiante recorrer la app. |
| 20 nov | Dos calendarios por recurso en Google: la conexión y la tarea periódica creaban calendarios a la vez. | El estudiante mandó una captura con 6 calendarios en lugar de 3. | Se pusieron en fila las dos acciones y se agregó una prueba que falla sin el arreglo (b1f8839). |
| 20 nov | Las pruebas leían las credenciales reales de Google del .env. | La IA lo notó antes de correr la suite. | Se corren con esas variables vacías. |
| 21 nov | La IA dijo que el evento de prueba sería "mañana" cuando ya era 21 de noviembre. | Al comprobar la base de datos. | No afectó la prueba; se aclaró. |
| 21 nov | La prueba de mover una cita desde Google estaba mal planteada: la cita ya estaba completada y esa regla solo atiende reservas confirmadas. | La IA revisó la base de datos. | Se pidió repetirla con una reserva futura. |
| 21 nov | El pago con Stripe real fallaba: el código usaba un parámetro que Stripe ya no acepta. Las pruebas automáticas pasaban porque usan el pago simulado. | El estudiante vio "Ocurrió un error inesperado" al pagar. La IA reprodujo la llamada a Stripe. | Se usan métodos de pago automáticos (d272fd0). |
| 21 nov | Se hizo el commit del arreglo de Stripe antes de revisar una falla de las pruebas, que luego resultó ser intermitente. | La suite falló una vez y pasó en la siguiente corrida. | Se midió (1 falla en 6 corridas) y se corrigió una diferencia de precisión de reloj entre la base y Node (1068ee4). Después, 14 corridas sin fallos. |
| 21 nov | Gmail rechazó la contraseña de aplicación (error 535). | La IA probó el inicio de sesión contra Gmail. | El estudiante decidió dejar los correos en la consola. |

## 6. Verificación

- Pruebas automáticas de la API: 11 archivos de pruebas y 107 pruebas con node:test y supertest. Evolución durante la implementación: 26, 48, 70, 106 y 107.
- Stripe en modo de prueba con llaves reales: autorización al enviar la solicitud, aviso por webhook con respuesta 200, cobro al aceptar y cancelación sin cobro al rechazar, comprobados contra Stripe.
- Google real: inicio de sesión, conexión de Calendar, tres calendarios (uno por persona), evento creado al aceptar, horario bloqueado por un evento personal y cancelación con reembolso al borrar el evento.
- Lo que se probó solo con pruebas automáticas y no a mano: mover una reserva desde Google Calendar.
- La web no tiene pruebas automáticas.

## 7. Pendientes y límites conocidos

- No hay versión desplegada: la demostración corre en local.
- Los correos se imprimen en la consola de la API porque no hay SMTP configurado.
- No se ha recorrido a mano toda la lista de casos límite en el navegador (campos vacíos, doble clic, recargar a mitad del pago).
- La pantalla de error general y los mensajes de red caída se comprobaron con pruebas de código, no apagando la API en el navegador.
- Las fotos del estudiante que no se subieron al repositorio siguen solo en su computadora.

## 8. Enlaces y commits

| Recurso | Enlace |
|---|---|
| Repositorio | https://github.com/AHHMED-J/ReserYa |
| Idea del proyecto | https://docs.google.com/document/d/1Ict1LzZsaFcUHqX3SAewJ-h6ZLIoY5GV-SnVrLUX1qk/edit |
| Requerimientos | https://docs.google.com/document/d/1sVQjgROe-PpVyUZo8RpXvWsD48Ap8enAWa7ZGCXBfOs/edit |
| Diagrama de clases | https://docs.google.com/document/d/1tcAODGlil4GxMmSTHB7FCPa-akYMLFI4oXkEa7rkaQM/edit |
| Wireframes y flujos | https://docs.google.com/document/d/19ksariMqBYC_vpC4OVyNrO14R30hSRS0GcawDpwR7xo/edit |
| Wireframes en Figma | https://www.figma.com/design/CD1U1LKSNQ7z9lr9wpTtDv |

| Etapa | Commits |
|---|---|
| 13 nov: documentación y diseño | 5c3ccc6, e13a20e, 7bce3a2, 85b2ff0, 6a5acf4 |
| 16 nov: base de la API y la web, cuatro agentes en paralelo y su integración (41 commits) | de 8fabde9 a 4ddcefb |
| 16 nov: fotos de demostración | 9724c09, cb7131b |
| 16 nov: cambios de Cambios ReserYa.md | f5c7baf |
| 19 nov: títulos de pestaña y salto al contenido | 43bf6c2, 2ad1a84 |
| 20 nov: documentación del modelo y arreglo de calendarios repetidos | 4d51ed3, b1f8839 |
| 21 nov: Stripe real, prueba intermitente, guía del proyecto y pantalla de error | d272fd0, 1068ee4, 33c4eb7, 7128ab6 |
