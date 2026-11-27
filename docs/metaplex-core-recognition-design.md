# Metaplex Core Customer Recognition Design

## Goal

MotoLedger awards collectible purchase-recognition NFTs to customers at the 1, 3 and 5 purchase milestones for each dealership. Token-2022 loyalty points remain a separate, complementary feature.

The design supports two issuance paths:

- **Automatic:** a newly confirmed sale reaches a milestone and triggers a Core Asset issuance attempt.
- **Retroactive:** the Reconocimientos NFT module scans existing sales and lets the dealership owner issue all eligible historical recognitions individually or in a batch.

## On-chain configuration

Each dealership has one Anchor `ReconocimientoColeccion` PDA derived from:

```text
[b"reconocimiento_coleccion", concesionario_pubkey]
```

The PDA stores:

- Dealership owner and dealership PDA.
- Metaplex Core collection address.
- Collection metadata URI.
- Metadata URIs for milestones 1, 3 and 5.
- PDA bump.

The owner registers the collection with `registrar_coleccion_reconocimientos` and updates its metadata URIs with `actualizar_metadata_reconocimientos`. Both instructions require the dealership owner's signature. The frontend verifies that the supplied address resolves to a Metaplex Core Collection before registering it.

The Anchor PDA is the source of truth for collection configuration. No browser `localStorage` value is required to recover the collection or milestone metadata.

## Purchase counting

MotoLedger supports multiple dealerships. The global `Cliente` account can be associated with more than one dealership, so `Cliente.total_motos_cliente` is not a valid dealership-specific recognition counter.

Confirmed purchases are stored as `Venta` accounts. Recognition progress is calculated from records matching both:

- `concesionario`: selected dealership PDA.
- `cliente`: customer PDA.

The progress scope is therefore:

```text
(concesionario PDA, cliente PDA) -> confirmed Venta count
```

Only confirmed on-chain sales count. Milestones are cumulative and independent: 1, 3 and 5 purchases. The Asset for each milestone references the sale that originally reached that milestone (the 1st, 3rd or 5th sale).

## Prerequisites for NFT issuance

Before an NFT can be issued:

1. The dealership must have a Metaplex Core Collection.
2. Its address and collection metadata URI must be registered in the dealership's `ReconocimientoColeccion` PDA.
3. The metadata JSON URI for the corresponding milestone must be uploaded to Pinata/IPFS and saved in the PDA.
4. The customer must have a linked wallet in `WalletCliente`.

The dealership owner is the collection update authority and pays transaction fees and account rent. The linked customer wallet owns the NFT.

## Automatic issuance from Sales

When a new sale is submitted:

1. MotoLedger prepares the existing `registrar_venta` instruction.
2. It checks the customer's prior sale count for the selected dealership and determines whether the new sale reaches 1, 3 or 5.
3. If the collection, milestone metadata and customer wallet are available, it checks the Core collection for an existing Asset with the same customer, dealership and milestone Attributes.
4. The sale is confirmed first. If Token-2022 rewards apply, ATA creation, sale registration and `otorgar_puntos` remain atomic with one another.
5. The Metaplex Core Asset is sent in a separate transaction after the sale confirms.

The NFT is deliberately not included in the sale transaction. A failed Core transaction, wallet rejection or metadata preparation error must not roll back a valid sale. The UI reports the milestone as pending and the Reconocimientos NFT module can retry it.

If the progress or collection lookup fails before the sale, the app continues with the sale transaction; the historical scan can identify the eligible milestone later.

## Retroactive issuance and batch processing

The Reconocimientos NFT module queries the dealership's sales and groups them by customer. For each customer it evaluates the 1, 3 and 5 milestones and compares them with the Assets already present in that dealership's collection.

The pending list includes eligible milestones that do not yet have a matching Asset. It also shows customers without a linked wallet or milestones whose metadata is not configured.

- **Individual issuance:** issue one pending recognition.
- **Batch issuance:** process all pending entries that have both a destination wallet and configured milestone metadata.
- **Retry behavior:** each entry is checked against the collection again immediately before issuance. A failed entry does not stop the rest of the batch and remains available for a later retry.
- **History:** issued Core Assets are listed with the customer, milestone, owner and Solana Explorer link.

The batch is sequential rather than a single large transaction. Each NFT has its own Core transaction, so a failure does not undo other successful issuances.

## Metaplex Core Asset

Each dealership has its own Core Collection. Each recognition Asset:

- Is owned by the customer's linked wallet.
- Is paid for and created under the dealership owner's authority.
- Uses the milestone's public HTTPS metadata URI.
- Includes the `Attributes` plugin with:
  - `hito`: 1, 3 or 5.
  - `cliente`: customer PDA.
  - `concesionario`: dealership PDA.
  - `venta`: milestone sale PDA.
- Uses `PermanentFreezeDelegate` with `frozen: true` and the collection update authority.

Customer name, national ID, email, phone and motorcycle VIN are not written into public NFT metadata.

## Metadata and IPFS

Images and JSON metadata are stored off-chain in Pinata/IPFS. Their public HTTPS gateway URIs are stored in the Anchor PDA. The private `PINATA_JWT` is used only on the server; `NEXT_PUBLIC_GATEWAY_URL` identifies the public gateway origin.

The three default JPG images are versioned in `assets/recognitions/`. The owner can replace them through the dashboard. The uploader clears a selected file only after its metadata URI has been successfully saved on-chain, allowing a retry if the Anchor update fails.

## Duplicate prevention and limitations

Before issuing an Asset, the frontend reads the collection's existing Assets and checks the `cliente`, `concesionario` and `hito` Attributes. The individual and batch flows repeat this check immediately before creating the Asset.

This is application-level duplicate prevention, not an on-chain uniqueness guarantee. The Anchor program does not currently validate milestone eligibility or store a unique issuance-receipt PDA. Two independent clients issuing the same recognition concurrently could race between the preflight check and Asset creation. A stricter production design would add an on-chain receipt/claim PDA per dealership, customer and milestone and validate it in a program instruction.

The program also does not deserialize the Core Collection account to validate its owner internally. The frontend performs the Core Collection check before registering the address.

Public RPC account scans and collection Asset scans may be rate-limited as usage grows. A dedicated RPC provider or indexer may be appropriate for a production deployment.

## Implementation status

- Anchor program: includes the dealership-level recognition collection PDA and registration/metadata update instructions.
- IDL and Codama-generated clients: include `ReconocimientoColeccion` and its instructions.
- Collection configuration: read from Solana, not local browser storage.
- Sales: automatic Core issuance attempt runs after sale confirmation.
- Historical sales: individual and sequential batch issuance are available from Reconocimientos NFT.
- Token-2022 rewards: remain separate from Core NFT issuance and retain their existing sale/reward transaction behavior.
