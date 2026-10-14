# El caso Dorothy Evans

Experiencia detectivesca formativa para trabajar conceptos de gamificación. Versión 2.0.0.

## Usar en clase

1. Compartir el enlace de GitHub Pages del repositorio.
2. Cada participante elige **Individual**. Para parejas o grupos, compartir una misma partida y pantalla, elegir **Pareja o equipo** y registrar sus alias.
3. Resolver los cuatro desafíos, abrir sus informes y comparar las pistas con los seis sospechosos.
4. Resolver el acertijo del informante, explorar los casilleros virtuales y descifrar su carta.
5. Presentar persona, lugar, arma y una justificación. El cierre permite descargar un informe y registrar una reflexión pedagógica.

La modalidad de equipo comparte una partida en un dispositivo o pantalla. No utiliza sincronización entre navegadores.

## Progreso y compatibilidad

- Guardado automático en el navegador, con copia JSON descargable e importación validada.
- Notas y motivos de descarte conservados en el expediente.
- Sonido ambiental opcional, activado mediante una acción del participante.
- Pantalla completa cuando la plataforma la admite y vista ampliada como alternativa, incluyendo móviles e iframes.
- HTML, CSS y JavaScript estáticos; sin backend, registro de cuentas ni envío de respuestas.
- Ilustraciones locales WebP; retratos tomados de la tabla de sospechosos suministrada.
- Tipografías con alternativas locales si Google Fonts no está disponible.
- Teclado, etiquetas accesibles, contraste y preferencia de movimiento reducido.

## Contenido

Las preguntas, las cuatro evidencias y el cifrado se reconstruyeron desde el PDF del formulario original facilitado por el autor. La búsqueda física de la carta se adaptó a un pasillo virtual para la clase online. La frase del cifrado y el alfabeto de símbolos se conservan; los símbolos se dibujan con SVG para mantener nitidez.

El indicio de estatura se presenta explícitamente como una condición del caso ficticio, sin convertirlo en una afirmación forense general.

Las comprobaciones finales validan persona, lugar y arma. La calidad de la justificación escrita se analiza en el cierre; la aplicación no asigna una calificación automática.

## Verificación

`node tests/logic.cjs` y `node tests/state.cjs` comprueban candados, códigos, normalización y reducción lógica de sospechosos.

`node tests/flow.cjs` usa Playwright para comprobar una partida completa, errores, navegación, guardado, recuperación, copias, cifrado, resolución, teclado y vistas de escritorio y móvil. Ejecutar con un servidor local o la URL publicada en `TEST_URL`.
