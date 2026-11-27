# MotoLedger — Reconocimientos NFT con Metaplex Core

**Registro de ventas y fidelización por compras mediante colecciones y Assets NFT de Metaplex Core en Solana Devnet.** Token-2022 complementa la experiencia con puntos y canjes, pero el foco de esta entrega es la emisión de reconocimientos NFT por hitos.

<p align="center">
  <img src="assets/moto-ledger-preview-.gif" alt="Dashboard de MotoLedger" width="100%">
</p>

> **Red:** Solana Devnet  
> **Programa:** `64dHKqRTBciEidqLJqCvTWEGWkR1QqyYDZgomMt9AWCj`  
> **Aplicación:** [moto-ledger-token-2022.vercel.app](https://moto-ledger-token-2022.vercel.app/)

## Objetivo: reconocimientos NFT por hitos

MotoLedger incorpora un módulo **Reconocimientos NFT** independiente de **Fidelización Token-2022**. Los NFT son certificados por compras confirmadas: el cliente recibe un reconocimiento al alcanzar 1, 3 y 5 ventas en un mismo concesionario. No son puntos, no se canjean por servicios y no se queman al realizar un canje.

### Cómo se calcula el progreso

El contador `Cliente.total_motos_cliente` es global para la identidad del cliente y no se utiliza para los hitos. MotoLedger permite asociar un mismo cliente a varios concesionarios, así que el progreso se calcula consultando las cuentas `Venta` que coinciden con la PDA del concesionario seleccionado y la PDA del cliente. Cada concesionario mantiene su propio progreso y su propia colección.

### Configurar la colección

1. Conecta la wallet owner y selecciona el concesionario.
2. Abre **Reconocimientos NFT**. En **Metadata de la colección**, elige:
   - **Automática:** MotoLedger consulta el nombre y el ID on-chain del concesionario, genera una portada propia y prepara nombre, símbolo y descripción únicos.
   - **Personalizada:** carga una imagen e introduce el nombre, símbolo y descripción que quieras.
3. Pulsa **Generar y subir metadata**. La wallet owner firma una autorización de carga; el servidor verifica esa firma y que la wallet sea propietaria de la cuenta `Concesionario`, y después sube la imagen y el JSON a Pinata.
4. Cuando aparezca la URL HTTPS de IPFS, pulsa **Crear colección** y aprueba la transacción. La colección queda bajo la autoridad de la wallet owner.

Se crea una sola colección por concesionario. Su metadata e imagen son independientes de las imágenes de los hitos. La dirección de la colección y la configuración de sus URI se registran en Solana en la PDA `ReconocimientoColeccion`, derivada con `reconocimiento_coleccion` + PDA del concesionario. El navegador no es la fuente de verdad y no se utiliza `localStorage` para recuperar esta asociación. Al cambiar de navegador o dispositivo, el frontend consulta la PDA y reconstruye el estado desde la blockchain. La wallet owner debe firmar la creación y el registro on-chain de la colección.

### Persistencia on-chain de la colección

La cuenta Anchor `ReconocimientoColeccion` es la fuente de verdad para cada concesionario:

- **PDA:** semillas `[b"reconocimiento_coleccion", concesionario_pubkey]`.
- **Campos:** owner, PDA del concesionario, dirección de la colección Core, URI de metadata de la colección, URI de metadata para hitos 1/3/5 y bump.
- **Registro:** `registrar_coleccion_reconocimientos` crea la PDA una sola vez y asocia la colección existente al concesionario. La colección se crea primero con Metaplex Core desde el frontend; la wallet owner firma después el registro Anchor.
- **Actualización:** `actualizar_metadata_reconocimientos` actualiza la URI de metadata de la colección y las URI de los hitos sin permitir reemplazar la dirección de colección registrada.
- **Permisos:** ambas instrucciones requieren la wallet owner del concesionario. No se modifica el layout de la cuenta `Concesionario`, por lo que no hace falta migrar las cuentas existentes.
- **Validación de Core:** Anchor guarda la dirección y comprueba que la cuenta exista; el frontend debe verificar que la dirección corresponde a una colección Metaplex Core antes de registrarla. Anchor no deserializa el estado interno de Core en esta versión.

La creación Core y el registro Anchor no son una única transacción: si falla el registro después de crear la colección, se debe reintentar la instrucción de registro con la misma dirección ya creada. No se debe crear una segunda colección como mecanismo de reintento.

### Metadata de los hitos

Después de crear o vincular la colección, carga las tres imágenes en **Imágenes de los hitos**:

- **Hito 1:** PRIMERA COMPRA.
- **Hito 3:** CLIENTE FRECUENTE.
- **Hito 5:** CLIENTE DESTACADO.

Estas son las imágenes JPG incluidas en el repositorio y utilizadas como muestra visual de la colección:

<table>
  <tr>
    <td align="center">
      <img src="assets/recognitions/milestone-1.jpg" alt="NFT de reconocimiento: Primera compra" width="220">
      <br><strong>Hito 1 · Primera compra</strong>
    </td>
    <td align="center">
      <img src="assets/recognitions/milestone-3.jpg" alt="NFT de reconocimiento: Cliente frecuente" width="220">
      <br><strong>Hito 3 · Cliente frecuente</strong>
    </td>
    <td align="center">
      <img src="assets/recognitions/milestone-5.jpg" alt="NFT de reconocimiento: Cliente destacado" width="220">
      <br><strong>Hito 5 · Cliente destacado</strong>
    </td>
  </tr>
</table>

Las tres imágenes JPG incluidas en el repositorio se cargan por defecto desde `assets/recognitions/milestone-1.jpg`, `assets/recognitions/milestone-3.jpg` y `assets/recognitions/milestone-5.jpg`. No necesitas seleccionarlas manualmente; el selector permite reemplazar cualquiera por otra imagen JPG. Pulsa **Subir los tres hitos** para cargar las pendientes en una sola operación, o sube cada una por separado. Cada carga crea su propio archivo de imagen y JSON público en Pinata. La URI de metadata de la colección y las URI de los hitos se escriben en la PDA `ReconocimientoColeccion` mediante `actualizar_metadata_reconocimientos`; reemplazar una imagen o metadata actualiza su URI on-chain. La wallet owner debe firmar cada actualización. La wallet owner autoriza cada carga mediante firma de mensaje; `PINATA_JWT` permanece exclusivamente en el servidor.

El JSON incluye `name`, `symbol`, `description`, `image`, `properties.files` y atributos de plataforma/hito. Los datos de cliente, venta y concesionario no se incorporan a la metadata pública: los atributos específicos de la emisión se guardan en el Asset Metaplex Core.

Para almacenamiento IPFS se utilizan `PINATA_JWT` y `NEXT_PUBLIC_GATEWAY_URL`. La URL generada debe ser HTTPS y apuntar al JSON del gateway público, no a una página HTML de GitHub ni a una URI `ipfs://`.

### Flujo de emisión

- **Venta con wallet vinculada:** si la colección está configurada y la venta alcanza exactamente el siguiente hito (1, 3 o 5), la aplicación añade la instrucción Metaplex Core a la misma transacción que registra la venta. Si también corresponde emitir puntos Token-2022, las instrucciones de venta, puntos y NFT se envían juntas.
- **Venta sin wallet vinculada o sin colección:** la venta se registra normalmente. El hito aparece como pendiente y puede emitirse después.
- **Pendientes:** abre **Reconocimientos NFT**, revisa el hito alcanzado y emite cuando el cliente tenga su wallet vinculada en el módulo **Clientes**. La interfaz muestra el costo aproximado en SOL.
- **Emitidos:** el historial muestra el hito, el cliente, el owner del Asset y el enlace a Explorer.

El cliente debe tener su wallet vinculada mediante la cuenta on-chain `WalletCliente`; no se introduce una wallet manual en cada venta. El owner del concesionario paga la renta del Asset y el owner del NFT es la wallet vinculada del cliente.

Los Attributes on-chain del Asset enlazan `hito`, `cliente` (PDA), `concesionario` (PDA) y `venta` (PDA). No se publica nombre, cédula, teléfono, correo ni serial VIN del comprador.

### Dependencias y ejecución local

Las dependencias Metaplex Core/Umi y el adaptador Umi-Kit se incluyen en `package.json`. Después de actualizar el repositorio, ejecuta:

```bash
npm install
npm run typecheck
npm run build
```

### Qué queda on-chain y qué valida cada capa

| Capa | Datos y responsabilidades |
| --- | --- |
| **Registro Anchor** | Mantiene las cuentas `Venta` y la PDA `ReconocimientoColeccion`. En `registrar_venta` valida el contexto de la venta, la asociación activa del cliente, la moto disponible y registra la venta. `registrar_coleccion_reconocimientos` registra la colección para el concesionario y `actualizar_metadata_reconocimientos` persiste las URI de los hitos. Anchor valida el owner y la relación con el concesionario, pero no deserializa la cuenta Core ni valida hitos o duplicados de Assets. |
| **Metaplex Core Collection** | Guarda la colección del concesionario, su nombre, URI de metadata y update authority. Hay una colección por concesionario. |
| **Metaplex Core Asset** | Cada reconocimiento es un Asset con owner = wallet vinculada del cliente, nombre, URI y plugins. El plugin `Attributes` guarda `hito`, PDA de `cliente`, PDA de `concesionario` y PDA de `venta` que alcanzó ese hito. |
| **Metadata IPFS** | El JSON público y la imagen viven fuera de la cadena en Pinata/IPFS. Se usa una URI independiente por hito; los atributos relacionales se guardan en el Asset, no en el JSON público. |
| **Aplicación** | Consulta la PDA `ReconocimientoColeccion` para recuperar la dirección de colección y las URI persistidas; cuenta las ventas del par concesionario/cliente, comprueba si corresponde 1, 3 o 5, consulta los Assets Core para evitar duplicados, prepara las instrucciones Core y coordina las transacciones. El almacenamiento local, si se utiliza como caché, nunca sustituye el estado on-chain. |

**Autoridad de congelamiento:** el Asset se crea con `PermanentFreezeDelegate`, `frozen: true` y autoridad `UpdateAuthority`. Esa autoridad corresponde a la wallet owner del concesionario, que también es update authority de la colección. El cliente conserva la propiedad (owner) del Asset, pero no la autoridad de congelamiento. No debe describirse como una validación de hitos hecha por Anchor.

### Alcance y limitaciones

La integración utiliza Metaplex Core/Umi desde el frontend y ahora requiere una nueva versión del programa Anchor para persistir la asociación y metadata de la colección. Después de compilar y desplegar el programa, regenera el IDL y los clientes Codama; el frontend debe consultar la PDA `ReconocimientoColeccion` en cada carga y enviar las instrucciones `registrar_coleccion_reconocimientos` y `actualizar_metadata_reconocimientos` con la firma del owner. La creación de la colección Core y su registro Anchor son operaciones separadas: si la colección se crea pero falla el registro, el frontend debe permitir reintentar el registro de esa misma dirección, sin crear otra colección.

La atomicidad aplica cuando la app incluye el Asset: la venta, la emisión de puntos Token-2022 (si corresponde) y el NFT se confirman o revierten juntos. Si no se cumple un hito, ya existe ese reconocimiento, falta la colección, falta la metadata del hito o el cliente no tiene wallet vinculada, la app registra la venta sin NFT. El reconocimiento elegible queda pendiente cuando faltaba la wallet o la configuración necesaria y puede emitirse después desde **Pendientes**.

La regla de hitos y la prevención de duplicados no son restricciones on-chain. La app cuenta las cuentas `Venta` de ese concesionario y cliente y consulta los Attributes de la colección antes de emitir. La wallet owner, como update authority, puede crear Assets directamente fuera del dashboard y omitir esas comprobaciones. Una garantía anti-fraude requeriría incorporar validación y recibos únicos en Anchor, regenerar IDL/Codama y desplegar una nueva versión.

### Evidencia Devnet requerida para la entrega

El código y la interfaz implementan el flujo, pero el README todavía necesita enlazar las transacciones y direcciones concretas de la demostración NFT. No se deben reutilizar como evidencia NFT las firmas de Token-2022 de otras operaciones.

| Evidencia | Qué debe enlazarse | Estado en este repositorio |
| --- | --- | --- |
| Colección Core | Dirección de la colección por concesionario y su página de Solana Explorer (Devnet). | **Pendiente de añadir la dirección real.** |
| Asset emitido | Dirección de al menos un Asset y su página de Explorer, mostrando owner, colección y Attributes. | **Pendiente de añadir la dirección real.** |
| Venta + emisión automática | Firma de una transacción de venta que incluya `registrar_venta` y `create` de Core en la misma transacción. | **Pendiente de añadir la firma real.** |
| Venta sin emisión | Firma de una venta que no alcance un hito (por ejemplo, la segunda compra) y que solo registre la venta. | **Pendiente de añadir la firma real.** |
| Emisión pendiente | Firma de la emisión manual desde **Pendientes**, dirección del Asset y costo medido en SOL. | **Pendiente de añadir firma, Asset y costo observados.** |

Para medir la emisión pendiente, la interfaz consulta el saldo de la wallet owner inmediatamente antes y después de la transacción y muestra la diferencia en SOL. Es un **costo aproximado total** de esa operación (renta de la cuenta del Asset más comisión de red), no una medición aislada de la renta.

**Diseño y decisiones técnicas:** [docs/metaplex-core-recognition-design.md](docs/metaplex-core-recognition-design.md).


## Prueba rápida en la aplicación desplegada (recomendada)

Para evaluar el proyecto **no necesitas clonar el repositorio ni configurar Node.js, Redis/Upstash o variables de entorno**. La aplicación ya está desplegada y esos servicios están configurados en el entorno de Vercel.

1. Abre **[MotoLedger – aplicación en vivo](https://moto-ledger-token-2022.vercel.app/)**.
2. Asegúrate de utilizar **Solana Devnet** en tu wallet y en la aplicación.
3. Conecta la wallet owner de un concesionario de prueba. Para probar como comprador, utiliza una segunda wallet distinta.
4. Sigue el [flujo de prueba de extremo a extremo](#flujo-de-prueba-de-extremo-a-extremo) descrito abajo.

**Qué necesitas:** un navegador compatible con una wallet Solana (por ejemplo, Solflare o Phantom), dos wallets (owner y comprador), y SOL de Devnet para las transacciones que deban pagar comisiones. Es recomendable tener el dashboard abierto en un equipo y utilizar el teléfono para abrir los QR como comprador. No compartas claves privadas ni frases semilla.

> [!IMPORTANT]
> **Las wallets owner y comprador tienen funciones distintas.** El dashboard carga los concesionarios registrados por la wallet conectada. Para explorar y administrar el concesionario de demostración, conecta la **misma wallet owner** con la que fue creado. Si conectas una wallet nueva que no haya registrado concesionarios, verás **“No encontramos concesionarios para esta wallet”**. Esto es esperado: los datos siguen en Devnet, pero esa wallet no es la autoridad de esos concesionarios.
>
> | Wallet | Dónde se utiliza | Qué hace |
> | --- | --- | --- |
> | **Owner** | Dashboard de MotoLedger | Administra el concesionario, registra ventas y genera los QR. Debe permanecer conectada durante el proceso. |
> | **Comprador** | Ventana, pestaña o dispositivo aparte al abrir el QR | Conecta su wallet para firmar la vinculación y el canje. No necesita concesionarios ni registros propios en el dashboard. |
>
> **No necesitas desconectar la wallet owner para utilizar la wallet del comprador.** Al generar un QR desde el dashboard, abre su enlace en el móvil o en otra ventana/pestaña del navegador y conecta allí la wallet del comprador. La sesión del dashboard permanece abierta con el owner conectado.


## Organización del dashboard

El dashboard comienza en **Configuración**, que concentra el registro y la selección de concesionarios, junto con la política de garantía de cada uno. Una vez preparado el concesionario, el trabajo operativo se distribuye en este orden:

1. **Configuración:** registrar o seleccionar el concesionario y establecer la duración y el kilometraje máximo de garantía.
2. **Inventario:** registrar motos o precargar el catálogo de demostración.
3. **Clientes:** registrar o precargar clientes y administrar sus asociaciones con el concesionario.
4. **Ventas:** registrar las ventas utilizando motos disponibles y clientes registrados.
5. **Fidelización:** configurar el programa Token-2022, consultar recompensas y gestionar canjes.
6. **Reconocimientos NFT:** administrar la colección Metaplex Core y los certificados por hitos de compras.
7. **Servicios:** administrar el catálogo y los trabajos de posventa.

El registro de concesionarios solo se realiza desde **Configuración**. Los demás módulos conservan el selector del concesionario; si la wallet conectada no tiene uno registrado, muestran un acceso a Configuración en lugar de repetir el formulario. Si la garantía todavía no está configurada, el estado on-chain lo indica y ofrece ir directamente a su configuración antes de registrar motos.


## Preparar datos de demostración

La aplicación incluye herramientas opcionales para configurar la cobertura de posventa y acelerar las pruebas desde el dashboard. Los cambios de configuración y los registros se guardan en **Solana Devnet**; no son datos ficticios guardados en el navegador.

### Configurar la garantía de cada concesionario

Cada concesionario mantiene su propia política de garantía. La wallet owner puede consultar y actualizar estos parámetros desde el módulo **Configuración**:

1. Conecta la wallet owner y selecciona el concesionario que deseas administrar.
2. Abre **Configuración** en el menú del dashboard.
3. En la sección **Configuración de garantía**, define:
   - **Duración de garantía:** cantidad de días de cobertura (entero entre 1 y 65.535).
   - **Kilometraje máximo cubierto:** límite de kilometraje (entero positivo, sin decimales).
4. Pulsa **Guardar configuración** y aprueba la transacción con la wallet owner.
5. Espera la confirmación en Solana. El dashboard actualizará los valores que muestra para ese concesionario.

La configuración se almacena on-chain en la cuenta del concesionario y requiere la firma de su owner. Si administras varios concesionarios, selecciona cada uno y configura sus parámetros por separado. Los valores actuales se muestran en **Estado on-chain**.

> [!IMPORTANT]
> **La política se aplica a las próximas motos que registres.** Cambiar los días o el kilometraje no modifica retroactivamente las cuentas de garantía de las motos que ya estaban registradas; esas garantías conservan los parámetros con los que fueron creadas. Configura la cobertura antes de registrar o precargar el inventario de demostración.

La garantía de posventa es independiente del programa de puntos Token-2022: el vencimiento de la garantía no elimina ni invalida los puntos que el cliente haya acumulado. Las reglas de canje de puntos se validan por separado.

### Kilometraje compartido por moto

El kilometraje ya no se administra como un dato independiente en cada módulo. Cada moto tiene una PDA `KilometrajeMoto`, derivada con las semillas `kilometraje_moto` y la dirección de la cuenta `Moto`. Esta cuenta almacena el último kilometraje conocido y la fecha de su actualización, sin modificar el layout de las cuentas `Moto` existentes.

- **Inventario:** las motos nuevas crean su registro de kilometraje en la misma transacción de registro, con un valor inicial de 0 km.
- **Servicios:** al seleccionar una moto vendida, se consulta el último kilometraje on-chain y se precarga el formulario. El nuevo registro puede conservarlo o aumentarlo.
- **Fidelización:** al seleccionar la venta y su moto, el canje muestra y precarga el mismo kilometraje compartido.
- **Garantía:** los servicios y reclamaciones de garantía utilizan ese mismo registro y siguen validando los límites de días y kilómetros definidos para la moto.
- **Validación:** el programa rechaza cualquier operación que intente registrar un kilometraje inferior al último valor guardado. El historial de servicios, reclamaciones y canjes conserva el kilometraje que tenía cada operación.

Las motos registradas antes de esta actualización no necesitan migrar ni recrear sus cuentas. Como su PDA de kilometraje todavía puede no existir, la aplicación calcula el mayor kilometraje presente en el historial on-chain de servicios, reclamaciones y canjes. Ese valor sirve como referencia para inicializar el registro durante la primera operación posterior a la actualización. A partir de ahí, la cuenta compartida se convierte en la referencia principal.

### Precargar motocicletas

1. Conecta la wallet owner y selecciona el concesionario que vas a utilizar.
2. Abre el módulo **Motos**.
3. Comprueba que el concesionario tenga configurada su garantía.
4. Pulsa **Precargar 3 motos** y aprueba las transacciones que solicite la wallet.
5. Espera a que finalice la operación y revisa el inventario del concesionario.

La precarga dispone de cuatro grupos de demostración (12 modelos en total), con tres motos distintas por grupo. La aplicación asigna automáticamente el primer grupo libre entre los concesionarios de una misma wallet owner; así, los primeros cuatro concesionarios reciben grupos diferentes. Los registros de otros usuarios de Devnet no afectan esta asignación. Si vuelves a precargar en el mismo concesionario, se conserva su grupo y las unidades ya creadas se omiten, por lo que puedes reintentar una precarga parcial. Cuando los cuatro grupos ya estén asignados a concesionarios de esa wallet, registra las motos adicionales manualmente. Cada moto y su garantía se crean mediante una transacción independiente que debe firmar el owner.

### Precargar clientes

1. Mantén seleccionado el concesionario correspondiente y abre el módulo **Clientes**.
2. En la sección **Registrar cliente**, pulsa **Precargar 3 clientes**.
3. Aprueba las transacciones que solicite la wallet.
4. Al finalizar, actualiza el directorio y comprueba que los clientes aparecen asociados al concesionario seleccionado.

Hay cuatro grupos de demostración (12 perfiles en total), con tres clientes distintos por grupo. La aplicación asigna automáticamente el primer grupo libre entre los concesionarios de una misma wallet owner, de modo que los primeros cuatro concesionarios reciben grupos diferentes. Los registros de otros usuarios de Devnet no afectan la asignación. Cada grupo utiliza nombres distintos y cédulas sintéticas derivadas del concesionario. Al reintentar en el mismo concesionario, se conserva el grupo identificado por sus asociaciones on-chain y se omiten los clientes ya registrados. La identidad Cliente es global para la wallet owner y la cédula; la asociación con cada concesionario es independiente. La precarga no reutiliza automáticamente identidades globales existentes ni asocia clientes de otros concesionarios. Cada cliente nuevo se registra en su propia transacción.

> [!IMPORTANT]
> **Identidad de clientes:** la cuenta Cliente es global para la wallet owner y la cédula, mientras que la asociación con un concesionario es independiente. La precarga no reutiliza automáticamente una identidad que ya exista en otro concesionario. Si una misma persona debe estar registrada en varios concesionarios, búscala por cédula y realiza manualmente su asociación desde cada concesionario. Para datos reales, utiliza siempre el formulario de registro manual y la cédula correcta.

## Integración de recompensas con Token-2022

MotoLedger es un proyecto propio al que incorporé un sistema de fidelización conectado con las ventas reales de cada concesionario. Cada concesionario configura su propio mint de puntos bajo **Token-2022**. Los puntos son unidades enteras (0 decimales) y el mint utiliza la extensión **NonTransferable**, por lo que no se pueden transferir entre wallets.

### Flujo de prueba de extremo a extremo

> [!TIP]
> **Preparación de wallets:** conecta en el dashboard la misma wallet owner que registró el concesionario y mantenla conectada durante toda la prueba. Utiliza una segunda wallet como comprador, pero ábrela únicamente desde el enlace QR en otra pestaña, ventana o dispositivo (por ejemplo, un teléfono). Así puedes completar las firmas del comprador **sin desconectar ni cambiar la wallet owner del dashboard**.
>
> Si conectas una wallet distinta directamente al dashboard y no tiene concesionarios registrados, el selector aparecerá vacío. Vuelve a conectar la wallet owner para administrar los registros. La wallet del comprador no necesita concesionarios ni datos propios en el dashboard.
>
> **Antes de comenzar:** confirma que hay al menos **dos motos disponibles** en el mismo concesionario. Cada moto solo puede venderse una vez.

1. **Conectar y seleccionar el concesionario.** Abre la aplicación en Devnet, conecta la wallet que administra el concesionario y selecciona el concesionario que tiene configurado el programa de fidelización. Si aún no existe, regístralo.
2. **Preparar inventario.** En el módulo **Inventario**, registra al menos dos motos disponibles manualmente o utiliza el botón opcional **Precargar 3 motos**. La precarga dispone de cuatro grupos genéricos de tres motos (12 modelos en total), independientes del nombre y la marca del concesionario. Los primeros cuatro concesionarios de una misma wallet owner reciben automáticamente grupos distintos; los registros de otros usuarios de Devnet no afectan la asignación. Si se reintenta en el mismo concesionario, se conserva el grupo asignado y se omiten las unidades existentes. Cada unidad crea su cuenta de moto y garantía en una transacción que requiere firma. El concesionario debe tener configurada su garantía.
3. **Registrar el cliente.** En **Clientes**, selecciona el concesionario y registra nombre y cédula manualmente, o utiliza **Precargar 3 clientes** para crear datos sintéticos de demostración asociados a ese concesionario. La precarga deriva cédulas de prueba distintas según la dirección del concesionario, consulta las cuentas on-chain antes de crear cada registro y es idempotente: si ya existen los clientes precargados, no los duplica. La identidad Cliente es global para la wallet owner y la cédula; una PDA `AsociacionCliente` vincula esa identidad con un concesionario. Por seguridad, la precarga nunca toma un cliente global ya existente para asociarlo automáticamente a otro concesionario. Si necesitas que la misma persona esté registrada en varios concesionarios, búscala por cédula y realiza el registro/asociación manual desde cada concesionario. Solo clientes asociados pueden seleccionarse en Ventas.
4. **Primera venta.** En **Ventas**, selecciona la primera moto disponible y el cliente, introduce el precio y confirma. Esta compra habilita la vinculación de wallet. Si el comprador todavía no tiene wallet vinculada, la venta se registra sin recompensa.
5. **Vincular la wallet del comprador.** En el dashboard (que permanece conectado con la wallet owner), regresa a **Clientes**, selecciona el mismo cliente y genera el QR. Desde el teléfono del comprador —o desde otra pestaña/ventana del navegador— escanea el QR y abre el enlace. Allí conecta la wallet del comprador y firma la solicitud. Mientras tanto, el owner continúa en el dashboard y completa su autorización. **No desconectes la wallet owner ni la reemplaces por la del comprador.** El programa exige ambas firmas y valida que el cliente ya tenga al menos una moto comprada. El QR es de un solo uso y expira a los cinco minutos.
6. **Segunda venta con recompensa.** Vuelve a **Ventas**, selecciona la segunda moto y el mismo cliente. Si existe wallet vinculada y el concesionario tiene un programa activo, la aplicación prepara una única transacción con: creación idempotente de la ATA Token-2022, `registrar_venta` y `otorgar_puntos`. Es atómica: si falla una instrucción, no se confirma ninguna. La cantidad se toma de la configuración on-chain `ProgramaFidelidad.puntos_por_venta`.
7. **Consultar saldo.** En **Clientes**, selecciona el comprador. La ficha consulta `WalletCliente`, deriva la ATA con el programa Token-2022 y obtiene el saldo directamente desde RPC. No se usa un saldo local como fuente de verdad.
8. **Canjear puntos y quemar tokens.** En el dashboard del owner, abre **Fidelización / Canje**, selecciona un cliente con ventas registradas, una de sus motos vendidas (seleccionada a través de su venta), un servicio y el kilometraje actual. Las motos que aún están disponibles en inventario no son elegibles para prestar estos servicios mediante canje. El owner inicia el canje y genera un QR. El comprador abre ese QR desde el mismo teléfono/ventana que utiliza para su wallet (o desde otro dispositivo), conecta la wallet vinculada y firma. El owner permanece conectado en el dashboard y completa la autorización desde allí. Una vez reunidas ambas firmas, la aplicación envía la transacción. El programa valida cliente, wallet, venta, moto, concesionario, garantía, servicio activo y saldo; después quema los puntos mediante Token-2022 y crea un recibo on-chain `CanjeServicio`.

### Videos demostrativos

> [!NOTE]
> En ambos videos, el dashboard permanece abierto con la **wallet owner** conectada. La wallet del comprador se utiliza desde el teléfono o desde otra pestaña/ventana al abrir el enlace QR; no hace falta desconectar el owner.

Los siguientes videos muestran la interacción coordinada entre el dashboard y la wallet del comprador. Añade los enlaces cuando los videos estén publicados.

**1. Vinculación de la wallet del cliente**

Muestra el flujo desde el dashboard del concesionario (wallet owner conectada) y el teléfono del comprador: generar el QR, abrir el enlace en el móvil, conectar la wallet del comprador, firmar la solicitud y completar la autorización del owner sin cerrar la sesión del dashboard.

[![Demostración: vinculación de la wallet del cliente](https://img.youtube.com/vi/51ciyN25H2g/hqdefault.jpg)](https://youtu.be/51ciyN25H2g)

**Ver video:** [Vinculación de la wallet del cliente](https://youtu.be/51ciyN25H2g)

**2. Reclamo de servicios y quema de puntos**

Muestra el proceso de canje de un servicio: seleccionar cliente, venta y servicio desde el dashboard owner, indicar el kilometraje, generar y escanear el QR, abrirlo en el teléfono/ventana del comprador y firmar con su wallet. El owner permanece conectado y completa su parte desde el dashboard. La demostración incluye la quema de los tokens Token-2022 y el registro del canje en Solana.

[![Demostración: canje de servicio y quema de puntos](https://img.youtube.com/vi/SMV7OkRrnyk/hqdefault.jpg)](https://youtu.be/SMV7OkRrnyk)

**Ver video:** [Reclamo de servicio y canje de puntos](https://youtu.be/SMV7OkRrnyk)

**Importante:** la primera venta habilita la vinculación, pero no genera puntos si aún no existe wallet vinculada. La segunda venta debe usar otra moto. El concesionario debe tener su mint y programa de fidelización configurados antes de intentar emitir recompensas.

### Catálogo inicial

Al inicializar el catálogo de un concesionario, el programa crea estos servicios:

| Servicio | Coste |
| --- | ---: |
| Ajuste de frenos | 60 puntos |
| Cambio de aceite | 80 puntos |
| Revisión general | 120 puntos |
| Mantenimiento preventivo | 150 puntos |

Con 200 puntos por venta, por ejemplo, un cliente podría canjear un cambio de aceite y un ajuste de frenos, si cumple las demás condiciones del programa.

## Configuración del mint y las instrucciones

Desde la sección de fidelización, el owner carga la metadata y crea el mint Token-2022. El mint se configura con 0 decimales, extensión `NonTransferable`, Metadata Pointer y Token Metadata. Su mint authority es la PDA `autoridad_fidelidad` derivada por el programa para el concesionario.

La instrucción `configurar_programa_fidelidad` comprueba que el token program sea Token-2022, que el mint tenga cero decimales, que incluya `NonTransferable` y que la mint authority sea la PDA esperada. `actualizar_puntos_fidelidad` permite al owner cambiar la cantidad fija por venta (debe ser mayor que cero).

| Instrucción | Responsabilidad |
| --- | --- |
| `configurar_programa_fidelidad` | Registra el mint y los puntos por venta; valida token program, decimales, extensión y autoridad. |
| `actualizar_puntos_fidelidad` | Actualiza la recompensa fija por venta. |
| `vincular_wallet_cliente` | Vincula la wallet del comprador después de una compra; requiere owner y comprador. |
| `desvincular_wallet_cliente` | Elimina el vínculo sin borrar identidad ni historial del cliente. |
| `otorgar_puntos` | Emite puntos mediante CPI a Token-2022 y crea un recibo `PuntosVenta`. |
| `inicializar_catalogo_servicios` | Crea el catálogo inicial de canjes. |
| `actualizar_servicio_catalogo` | Modifica los datos o disponibilidad de un servicio. |
| `canjear_servicio` | Valida el canje, quema puntos mediante Token-2022 y crea `CanjeServicio`. |

## Qué valida la red y qué hace la aplicación

**Validaciones on-chain (programa y Token-2022):**

- El owner debe ser propietario del concesionario y firmar las instrucciones que lo requieren.
- El cliente debe pertenecer al owner y tener una asociación activa con el concesionario.
- La wallet vinculada debe firmar; el programa exige que el cliente ya haya comprado al menos una moto.
- La venta usada para emitir puntos debe corresponder al mismo concesionario y cliente.
- El mint debe ser el configurado para ese concesionario, pertenecer a Token-2022, tener 0 decimales y usar la PDA de fidelización como mint authority.
- `PuntosVenta` es una PDA derivada de la venta: su inicialización impide emitir una segunda recompensa por la misma venta.
- Para canjear, el programa valida cliente, wallet, venta, moto, garantía, servicio activo y saldo. El comprador firma como autoridad de su cuenta de tokens para autorizar el burn.
- La quema y el recibo del canje ocurren en una transacción atómica; si falla una validación o el CPI, Solana revierte los cambios de esa transacción.

**Responsabilidades de la aplicación:**

- Presenta formularios, selecciona cuentas, deriva PDAs/ATAs, prepara instrucciones y coordina firmas.
- Consulta el saldo Token-2022 mediante RPC; no mantiene un saldo paralelo.
- Presenta la cantidad configurada y el coste del servicio. El programa vuelve a leer y validar esos valores desde las cuentas on-chain.
- Coordina temporalmente los QR; un QR no sustituye las firmas ni las validaciones de la red.

**Datos que se conservan:**

- `Venta`: relación entre concesionario, cliente y moto, además de fecha y precio.
- `PuntosVenta`: venta, cliente, wallet receptora, cantidad y fecha de emisión. No guarda una copia del saldo acumulado ni una conversión monetaria.
- El saldo agregado vive en la cuenta de tokens Token-2022 del comprador.
- `CanjeServicio`: concesionario, catálogo, cliente, wallet, mint, venta, moto, kilometraje, servicio, puntos quemados, fecha e identificador del canje.
- El precio de venta no determina la recompensa. No se almacena una tasa de cambio entre precio y puntos; la recompensa es fija por concesionario.

## Autoridades y limitaciones

- **Owner del concesionario:** administra el programa y actualiza los puntos por venta.
- **PDA `autoridad_fidelidad`:** mint authority; firma el CPI `MintTo` mediante las seeds del programa. No existe una clave privada exportable para esta PDA.
- **Wallet del comprador:** autoridad de su cuenta de tokens; firma el canje para autorizar el burn.
- **Token-2022:** valida las operaciones del mint y de las cuentas de tokens, incluida la restricción de no transferencia.

El alcance descrito en esta sección corresponde exclusivamente a los puntos y canjes Token-2022: no implementa `PermanentDelegate`, recuperación administrativa de tokens ni reversión de recompensas por anulación de ventas. Los reconocimientos NFT se implementan por separado con Metaplex Core y se documentan en la sección principal de este README.

## Rechazos y cómo reportarlos

Al probar una operación inválida, identifica la capa exacta:

1. **Validación local:** la interfaz bloquea datos incorrectos antes de construir/enviar la transacción. No hay firma on-chain.
2. **Simulación / preflight:** el RPC devuelve un error durante la simulación. No debe reportarse como transacción fallida confirmada en la red.
3. **Ejecución on-chain:** existe una firma y Solana Explorer/RPC muestra `meta.err` distinto de `null`. Incluye la firma y el error del programa.

Un caso negativo relevante es intentar canjear un servicio cuyo coste supere el saldo. El programa exige `token_account.amount >= puntos` y devuelve `SaldoInsuficiente` si no se cumple. También valida que el servicio exista y esté activo, y que las cuentas de venta, moto y garantía correspondan al mismo contexto. No describas un rechazo como on-chain si solo lo bloqueó la interfaz o la simulación.

## Evidencias de Devnet

Las siguientes direcciones y firmas corresponden a datos compartidos durante las pruebas. Las firmas se incluyen solo cuando se conoce qué operación representan.

| Evidencia | Dirección / firma | Alcance comprobado |
| --- | --- | --- |
| Programa MotoLedger | [64dHKqRTBciEidqLJqCvTWEGWkR1QqyYDZgomMt9AWCj](https://explorer.solana.com/address/64dHKqRTBciEidqLJqCvTWEGWkR1QqyYDZgomMt9AWCj?cluster=devnet) | Programa desplegado en Devnet. |
| Creación del mint Token-2022 MOTO KINGS REWARDS (MKTR) | [`5ei9biit2dMYH1V7ioArvzmpwGxhbejKBVp5Bat55J39Wx8D3L7N3rgsT5hrgaQcpzaWPvFS8Cc3fkeG6cA6v2GC`](https://explorer.solana.com/tx/5ei9biit2dMYH1V7ioArvzmpwGxhbejKBVp5Bat55J39Wx8D3L7N3rgsT5hrgaQcpzaWPvFS8Cc3fkeG6cA6v2GC?cluster=devnet) | Transacción de creación del mint **MOTO KINGS REWARDS (MKTR)** en Devnet. |
| Recepción de puntos por compra | [`4Y1uR8ZXdJwrZ3b1fYN65iesr8eprwt2wpFYj1somCT2Vhg4JZD9jQdyCw41WvDp4EVcVBuy1AbX7fZh98eD3o3o`](https://explorer.solana.com/tx/4Y1uR8ZXdJwrZ3b1fYN65iesr8eprwt2wpFYj1somCT2Vhg4JZD9jQdyCw41WvDp4EVcVBuy1AbX7fZh98eD3o3o?cluster=devnet) | Transacción de recepción/emisión de puntos Token-2022 al realizar una compra en Devnet. |
| Canje de servicio y quema de 80 puntos | [`4cCo4S2jY71W3Kegfpa1knVyV6rhQh2L3rLhVkDVwEKeEGU9hVe7DYT3Mec8gg4puWfrbJqBV24kwAjvHoWCHh82`](https://explorer.solana.com/tx/4cCo4S2jY71W3Kegfpa1knVyV6rhQh2L3rLhVkDVwEKeEGU9hVe7DYT3Mec8gg4puWfrbJqBV24kwAjvHoWCHh82?cluster=devnet) | Ejemplo on-chain de un canje de servicio que quema 80 puntos Token-2022 en Devnet. |
| PDA de concesionario mostrada con ese programa | `8WQjh7p1vmnPRVicWVvS5gXxZmibd5YfTfmkGRwufYKS` | Dirección mostrada durante la revisión de la configuración. |
| Registro de Juan Perez | [`4hCUGJUJFynExwZY323trz2aSYGnvgyxNhwqB6iqHpVNPARQrTtR8Ncpz6k7Gjd1UCjKg6r4S9bkdRvz2Xohc5pS`](https://explorer.solana.com/tx/4hCUGJUJFynExwZY323trz2aSYGnvgyxNhwqB6iqHpVNPARQrTtR8Ncpz6k7Gjd1UCjKg6r4S9bkdRvz2Xohc5pS?cluster=devnet) | Transacción confirmada de `RegistrarCliente`; logs: BERA MOTORS, Juan Perez y su PDA de cliente. **No es una transacción de emisión de puntos.** |

## Requisitos e instalación

> **Para probar la versión desplegada no necesitas instalar nada ni configurar Redis/Upstash ni Pinata/IPFS.** La aplicación ya tiene esas integraciones y sus variables de entorno configuradas en Vercel. Esta sección es únicamente para ejecutar MotoLedger en tu equipo.

### Requisitos

- Node.js **24 o superior** y npm.
- Una wallet compatible con Solana (Solflare o Phantom).
- SOL de Devnet para las transacciones.
- Una base de datos gratuita de **Redis en Upstash** para gestionar las sesiones temporales de los QR.

### Configurar Upstash Redis

1. Entra en [Upstash Console](https://console.upstash.com/) y crea una base de datos **Redis**.
2. En la consola de la base de datos, abre la sección **CLI** o ejecuta los comandos ACL con las credenciales administrativas.
3. Crea un token de contraseña seguro con `ACL GENTOKEN` y utiliza el valor generado para crear un usuario dedicado a MotoLedger. La regla ACL recomendada es:

   ```redis
   user MOTOLEDGER on ~moto-ledger:wallet-link:* +@all
   ```

   Si lo creas mediante `ACL SETUSER`, aplica la contraseña generada y la misma regla de acceso. Por ejemplo:

   ```redis
   ACL SETUSER MOTOLEDGER on >TOKEN_GENERADO ~moto-ledger:wallet-link:* +@all -flushall -flushdb -swapdb
   ```

   El patrón `~moto-ledger:wallet-link:*` limita el acceso del usuario a las claves temporales de vinculación QR. Se excluyen además `FLUSHALL`, `FLUSHDB` y `SWAPDB`, porque son comandos globales que no quedan restringidos por el patrón de claves.
4. Genera el token REST de ese usuario con:

   ```redis
   ACL RESTTOKEN MOTOLEDGER TOKEN_GENERADO
   ```

5. Copia la **REST URL** de la base de datos y utiliza el resultado de `ACL RESTTOKEN` como `UPSTASH_REDIS_REST_TOKEN`. No uses el token de solo lectura ni el token estándar de `default` para esta configuración.

Redis se utiliza únicamente para intercambiar temporalmente la información necesaria para vincular la wallet del comprador mediante QR. Las sesiones expiran a los cinco minutos. **No almacena los registros del concesionario ni reemplaza a Solana**: los datos del negocio permanecen on-chain.

### Configurar Pinata e IPFS

MotoLedger utiliza [Pinata](https://pinata.cloud/) para subir a IPFS los archivos de metadata y las imágenes asociados al mint Token-2022.

1. Crea una cuenta o inicia sesión en [Pinata](https://pinata.cloud/).
2. En el panel de Pinata, crea un **API Key** con un JWT que tenga permisos para subir/pinear archivos (pinning/upload). No compartas ese JWT.
3. En **Gateways**, crea o selecciona un gateway público y copia su dominio. Debe tener el formato `https://<tu-gateway>.mypinata.cloud`.
4. Configura las variables en el archivo `.env.local`:

   ```env
   PINATA_JWT=<tu-jwt-de-pinata>
   NEXT_PUBLIC_GATEWAY_URL=https://<tu-gateway>.mypinata.cloud
   ```

   `PINATA_JWT` es una credencial privada que utiliza el servidor para autenticar las cargas a Pinata. **No la conviertas en una variable `NEXT_PUBLIC_*`, no la expongas en el navegador ni la subas al repositorio.**
   
   `NEXT_PUBLIC_GATEWAY_URL` es el gateway público que utiliza la aplicación para construir los enlaces de lectura de IPFS. Introduce únicamente el origen del gateway, sin añadir `/ipfs/` ni un CID al final.
5. Guarda los cambios y reinicia el servidor local para que Next.js cargue las variables.

Los archivos se consultan mediante el gateway con la ruta `/ipfs/<CID>`. Por eso, el gateway debe estar activo y ser accesible públicamente para que la metadata y las imágenes puedan visualizarse. Redis y Pinata cumplen funciones distintas: Redis coordina sesiones QR temporales; Pinata aloja el contenido direccionado por CID en IPFS.

### Instalar y ejecutar

Clona el repositorio e instala las dependencias:

```bash
git clone https://github.com/neocarvajal/moto-ledger-nfts-metaplex-core.git
cd moto-ledger-nfts-metaplex-core
npm install
```

Crea un archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=https://<tu-base-de-datos>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<tu-token-rest>
PINATA_JWT=<tu-jwt-de-pinata>
NEXT_PUBLIC_GATEWAY_URL=https://<tu-gateway>.mypinata.cloud
```

Para probar los QR desde un teléfono, la aplicación debe estar disponible mediante una URL HTTPS pública. En ese caso, cambia `NEXT_PUBLIC_APP_URL` por esa URL y reinicia el servidor.

Inicia la aplicación:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), conecta la wallet owner y selecciona **Devnet**. Puedes obtener SOL desde el [faucet oficial](https://faucet.solana.com/).

## Arquitectura y cuentas on-chain

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| Estilos | Tailwind CSS v4 |
| Blockchain | Solana Devnet |
| Cliente Solana | `@solana/kit` |
| Token | `@solana-program/token-2022` |
| Cliente del programa | Codama |
| Almacenamiento efímero QR | Upstash Redis |
| Metadata del token | Pinata / IPFS |

Cuentas de la integración: `ProgramaFidelidad` (concesionario, mint y puntos por venta), `WalletCliente` (cliente-wallet), `PuntosVenta` (recibo único por venta), `CatalogoServicios` (catálogo y coste), `CanjeServicio` (recibo de quema) y `AsociacionCliente` (relación cliente-concesionario).

Las PDAs se derivan con semillas determinísticas en el programa y en `app/lib/moto-ledger/pdas.ts`. El frontend consulta las cuentas desde RPC; los datos on-chain no dependen de localStorage.

## Pruebas automatizadas

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Las pruebas de integración Devnet existentes son de solo lectura: verifican que el programa desplegado y la PDA del registro global puedan consultarse y decodificarse. No crean mints, ventas ni recompensas.

macOS/Linux:
```bash
MOTO_LEDGER_DEVNET_RPC_URL=https://api.devnet.solana.com npm run test:devnet
```

PowerShell:
```powershell
$env:MOTO_LEDGER_DEVNET_RPC_URL="https://api.devnet.solana.com"
npm run test:devnet
```

## Migración de asociaciones de clientes existentes

`scripts/migrate-customer-associations.mjs` es una utilidad para instalaciones antiguas que tenían clientes globales sin una PDA por relación cliente/concesionario. Reconstruye relaciones a partir de ventas y acepta un mapeo manual verificado. Por defecto ejecuta un **dry run**; solo crea asociaciones con `--execute`.

La migración histórica de esta instalación Devnet ya se completó: se crearon cinco asociaciones y una ejecución posterior de dry run confirmó cinco existentes, cero pendientes y cero errores. No es necesario repetirla.

## Scripts

```bash
npm run dev          # Servidor local
npm run build        # Compilación de producción
npm run start        # Servidor de producción
npm run typecheck    # Verificación TypeScript
npm run lint         # ESLint
npm run test         # Pruebas unitarias y de interfaz
npm run test:devnet  # Pruebas Devnet de solo lectura
npm run ci           # Build, typecheck, lint, formato y tests
```

## Seguridad

- Nunca incluyas claves privadas, keypairs JSON, frases semilla ni tokens de Upstash/Pinata en el repositorio, README, capturas o evidencias.
- Los QR usan tokens aleatorios temporales; no contienen la cédula ni el nombre del cliente.
- El QR coordina firmas, pero no firma por el usuario. Las firmas requeridas deben autorizarse en las wallets.
- La red y el programa son la fuente de verdad para emisión, saldo y canje.
