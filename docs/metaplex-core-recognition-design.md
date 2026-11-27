# Metaplex Core Customer Recognition Design

## Goal

Add collectible purchase-recognition NFTs to MotoLedger without changing or replacing the existing Token-2022 points and service-redemption flow.

The NFT represents a confirmed purchase milestone. It is not a points reward and is never burned when a customer redeems a service.

## Product rules

- Recognition progress is calculated independently for each dealership and customer pair.
- Milestones are cumulative: 1, 3 and 5 confirmed purchases.
- Each milestone can be issued only once for a given dealership/customer pair.
- Earlier NFTs remain in the customer's wallet after reaching a later milestone.
- Only a confirmed on-chain sale advances progress.
- The customer must have a wallet linked to their MotoLedger customer record before an NFT can be issued.
- The dealership owner pays the minting and transaction costs; the linked customer wallet is the NFT owner.
- Each dealership owns its own Metaplex Core collection.
- NFT metadata must not contain customer PII (name, national ID, email or phone).

## On-chain design

### Purchase progress PDA

Introduce a ProgresoReconocimiento account derived from:

    ["progreso_reconocimiento", concesionario, cliente]

Suggested fields:

- owner: dealership owner authority.
- concesionario: dealership public key.
- cliente: global customer PDA.
- compras_confirmadas: purchase count for this dealership/customer pair.
- bump: PDA bump.

The registrar_venta instruction increments this account in the same transaction that marks the motorcycle as sold and creates the Venta account. This makes the counter reflect confirmed sales, not browser state or a separately indexed history.

### Issued-recognition PDA

Introduce a ReconocimientoEmitido account derived from:

    ["reconocimiento_emitido", concesionario, cliente, hito]

The milestone identifier is restricted to 1, 3 or 5. The account records the dealership, customer, milestone, Core asset address and issuance timestamp.

The recognition instruction validates the dealership authority, customer association, linked customer wallet and sufficient purchase count. Initializing the milestone PDA makes duplicate issuance impossible for the same customer, dealership and milestone.

### Atomic NFT issuance

The client prepares a single transaction containing:

1. The Anchor instruction that initializes the milestone receipt and validates eligibility.
2. The Metaplex Core instruction that creates the NFT in the dealership collection, owned by the linked customer wallet and paid by the dealership owner.

Both instructions must be in the same transaction. If Core asset creation fails, the receipt initialization rolls back too; if the milestone PDA already exists, the transaction is rejected before a duplicate can be created.

The Core asset address must be known when preparing the receipt instruction. The frontend generates the asset keypair/address before composing the transaction.

## Metaplex Core configuration

- Standard: Metaplex Core.
- Collection: one collection per dealership.
- Collection update authority: dealership owner.
- NFT owner: customer's linked wallet.
- Payer: dealership owner.
- Storage: Pinata/IPFS metadata and image URLs using the configured public gateway.
- Transfer policy: start with the workshop's PermanentFreezeDelegate and frozen=true approach. This is a reversible freeze controlled by the delegate; it should not be described as an irreversible Soulbound guarantee.

Metadata should describe the milestone and dealership brand, without customer identity fields. Suggested public attributes include Milestone, Purchases, Dealership and Network.

## Dashboard experience

Add a dedicated Reconocimientos NFT module, separate from Fidelización:

- Collection status and collection address for the selected dealership.
- Customer list with confirmed purchase count and next eligible milestone.
- Wallet-link status and eligibility explanation.
- Mint action for an eligible milestone.
- Issued NFT history with Core asset address, milestone, date and Explorer link.
- Customer detail should show NFT recognitions separately from Token-2022 balance and service-redemption history.

If a customer reaches a milestone before linking a wallet, keep the milestone pending. Once the wallet is linked, the owner can issue the recognition without changing the historical sale.

## Implementation sequence

1. Add dealership/customer purchase progress and milestone receipt accounts to the Anchor program.
2. Update the Anchor IDL and regenerate the Codama client.
3. Add Metaplex Core collection creation and asset minting helpers.
4. Add the dashboard module and customer recognition history.
5. Add tests for per-dealership counting, 1/3/5 thresholds, duplicate prevention, missing wallet links and atomic rollback.
6. Document Devnet setup, Pinata configuration and the end-to-end test flow.

## Current status

This document captures the implementation contract and product decisions. It does not mean the Anchor program has been updated or deployed yet. The existing Token-2022 flow remains unchanged.
