# Metaplex Core Customer Recognition Design

## Goal

Add collectible purchase-recognition NFTs to MotoLedger without changing or replacing the existing Token-2022 points and service-redemption flow.

The NFT represents a confirmed motorcycle purchase milestone. It is not a points reward and is never burned when a customer redeems a service.

## Bootcamp implementation pattern

This implementation follows the Taller 3 guide and its prompt:

- **The deployed Anchor program does not change.**
- Codama remains the client for the existing `registrar_venta` instruction.
- Metaplex Core and Umi build the collection and Asset instructions.
- Umi instructions are converted to Solana Kit instructions with `@metaplex-foundation/umi-kit-adapters`.
- The existing connected owner wallet signs and pays for the transaction; the generated Core collection/Asset keypair signs only the new account creation.
- When a sale reaches a milestone and the customer has a linked wallet, the sale and Core Asset creation are submitted in the same Kit transaction.

The current Anchor program, IDL and generated Codama client therefore require no update or redeployment for this frontend integration.

## MotoLedger-specific purchase counting

The bootcamp reference has a single business and can use the customer's purchase counter. MotoLedger supports multiple dealerships and a global `Cliente` account can be associated with more than one dealership.

For that reason, `Cliente.total_motos_cliente` is **not** the recognition counter: it is global to the customer identity and does not represent purchases at the currently selected dealership.

MotoLedger already stores each confirmed purchase in a `Venta` account with:

- `concesionario`: dealership PDA.
- `cliente`: global customer PDA.
- `moto`: motorcycle PDA.
- `fecha_venta` and `precio_venta`.

The recognition module queries the `Venta` accounts for the selected dealership and counts only records whose `cliente` matches the customer. The sales module already uses the dealership filter when loading its sales history. A motorcycle can be sold only once because `Venta` is initialized at the motorcycle-derived PDA; the current program has no sale-refund/decrement instruction.

This gives the intended progress scope:

    (concesionario PDA, cliente PDA) -> confirmed Venta count

It avoids changing the existing `Cliente` account layout or adding a global counter that would mix dealerships.

## Product rules

- Recognition progress is calculated independently for each dealership/customer pair.
- Milestones are cumulative: 1, 3 and 5 confirmed purchases.
- Each milestone is checked against the selected dealership's Core collection before issuing.
- Earlier NFTs remain in the customer's wallet after reaching a later milestone.
- Only confirmed on-chain `Venta` records advance progress.
- The customer must have a `WalletCliente` account before automatic or manual NFT issuance.
- The linked customer wallet owns the NFT.
- The dealership owner pays transaction fees and Core account rent and is the collection update authority.
- Each dealership has its own Metaplex Core collection.
- NFT Attributes contain only on-chain account addresses and milestone data; customer name, national ID, email, phone and motorcycle VIN are not written into public NFT metadata.

## Wallet and pending-recognition behavior

MotoLedger already has a customer-to-wallet link stored in the `WalletCliente` PDA derived from the customer PDA.

- If the customer has a linked wallet and the sale reaches 1, 3 or 5 purchases, the NFT is included automatically in the sale transaction when a collection is configured.
- If no collection is configured or the customer has not linked a wallet, the sale still works normally. The eligible milestone appears under **Reconocimientos NFT → Pendientes**.
- After the customer links a wallet, the dealership owner can issue the pending recognition without changing the historical sale.
- For a pending recognition, the Asset Attributes reference the `Venta` that originally reached that milestone (the 1st, 3rd or 5th sale), not an arbitrary later sale.

## Metaplex Core configuration

- Standard: Metaplex Core.
- Collection: one collection per dealership.
- Collection update authority: dealership owner wallet.
- NFT owner: customer's linked `WalletCliente.wallet`.
- Payer: dealership owner wallet.
- Metadata: public HTTPS JSON URI, expected to be hosted on Pinata/IPFS using the configured public gateway.
- Asset plugins: `Attributes` and `PermanentFreezeDelegate` with `frozen: true`, following the bootcamp example.

Each Asset stores these Attributes as strings:

- `hito`: 1, 3 or 5.
- `cliente`: customer PDA.
- `concesionario`: dealership PDA.
- `venta`: milestone sale PDA.

The metadata JSON should describe the recognition and dealership brand. It must not contain customer identity information.

## Dashboard experience

The **Reconocimientos NFT** module is separate from **Fidelización**:

- Create a collection for the selected dealership or restore its address.
- Configure the public Pinata/IPFS metadata URI.
- View each customer's dealership-specific purchase count.
- View pending milestones and whether the customer's wallet is linked.
- Issue pending recognitions and show the approximate SOL cost.
- List issued Core Assets with owner and Explorer links.

Collection configuration is stored in browser `localStorage`, scoped by cluster, owner wallet and dealership. If the owner changes browser or clears local storage, the collection can be restored by entering its address and metadata URI.

## Atomicity

When a sale reaches a milestone:

1. The client builds the existing Codama `registrar_venta` instruction.
2. It reads the dealership/customer sale count and checks the collection for an existing recognition.
3. It builds the Metaplex Core `create` instruction with the linked customer wallet as owner and the dealership owner as payer/authority.
4. If Token-2022 rewards also apply, the existing ATA creation and `otorgar_puntos` instructions remain in the same transaction.
5. The app sends the combined instruction list with `client.sendTransaction`.

If the sale, points reward or Core Asset instruction fails, the transaction is atomic and none of its state changes are committed. A pending recognition is issued in its own transaction because its sale has already been confirmed.

## Security and scope limitations

This is the bootcamp's **frontend-controlled recognition pattern**, not an on-chain milestone authorization system:

- The Anchor program does not validate the 1/3/5 milestone and does not store a unique recognition receipt PDA.
- Duplicate prevention is performed by reading the Core collection Attributes before the app issues an Asset. It is not a program-level uniqueness constraint.
- The collection update authority is the dealership owner. That authority can create an Asset in its collection outside the dashboard; a user with that authority could bypass the app's milestone checks.
- The app's local collection configuration is not an on-chain registry.
- Public RPC account scans can be rate-limited. A dedicated RPC/indexer may be needed as a dealership's sale history grows.

A future production-hardening iteration could add Anchor progress and issuance-receipt PDAs, but that is intentionally outside this bootcamp-aligned implementation and would require a new program build, IDL and Codama client.

## Implementation status

- Anchor program: unchanged.
- Program ID and deployed address: unchanged.
- IDL and Codama-generated client: unchanged.
- Token-2022 rewards and service redemption: unchanged.
- New work: Metaplex Core/Umi helpers, a dealership-level Reconocimientos NFT module and atomic NFT issuance from the sales flow.
