import {
  AccountRole,
  addSignersToInstruction,
  address,
  createKeyPairSignerFromBytes,
  type TransactionSigner,
} from "@solana/kit";
import {
  createNoopSigner,
  generateSigner,
  publicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import {
  create,
  createCollection,
  fetchAssetsByCollection,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import type { ClusterMoniker } from "../solana-client";

export const RECOGNITION_MILESTONES = [1, 3, 5] as const;

export type RecognitionMilestone = (typeof RECOGNITION_MILESTONES)[number];

export type RecognitionMetadata = {
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  metadataUri: string;
  imageCid?: string;
  metadataCid?: string;
};

export type RecognitionConfig = {
  collection: string;
  collectionMetadata?: RecognitionMetadata;
  milestones?: Partial<Record<RecognitionMilestone, RecognitionMetadata>>;
  /** Legacy collection metadata URI; retained for old local configurations. */
  metadataUri: string;
};

export type IssuedRecognition = {
  address: string;
  owner: string;
  milestone: number;
  customer: string;
  dealership: string;
  sale: string;
};

const RPC_URLS: Record<ClusterMoniker, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

export function recognitionRpcUrl(cluster: ClusterMoniker) {
  return RPC_URLS[cluster];
}

export function recognitionMilestone(purchases: number): RecognitionMilestone | null {
  return RECOGNITION_MILESTONES.includes(purchases as RecognitionMilestone)
    ? (purchases as RecognitionMilestone)
    : null;
}

function storageKey(owner: string, dealership: string, cluster: ClusterMoniker) {
  return `moto-ledger:recognitions:${cluster}:${owner}:${dealership}`;
}

export function readRecognitionConfig(
  owner: string,
  dealership: string,
  cluster: ClusterMoniker
): RecognitionConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(owner, dealership, cluster));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecognitionConfig>;
    if (typeof parsed.collection !== "string") return null;
    const legacyUri = typeof parsed.metadataUri === "string" ? parsed.metadataUri : undefined;
    const collectionMetadata =
      parsed.collectionMetadata && typeof parsed.collectionMetadata.metadataUri === "string"
        ? parsed.collectionMetadata
        : legacyUri
          ? { name: "", symbol: "", description: "", imageUri: "", metadataUri: legacyUri }
          : undefined;
    const milestones = parsed.milestones && typeof parsed.milestones === "object"
      ? parsed.milestones
      : {};
    return {
      collection: parsed.collection,
      ...(collectionMetadata ? { collectionMetadata } : {}),
      milestones,
      metadataUri: legacyUri ?? collectionMetadata?.metadataUri ?? "",
    };
  } catch {
    return null;
  }
}

export function saveRecognitionConfig(
  owner: string,
  dealership: string,
  cluster: ClusterMoniker,
  config: RecognitionConfig | null
) {
  try {
    const key = storageKey(owner, dealership, cluster);
    if (config) localStorage.setItem(key, JSON.stringify(config));
    else localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in private browsing contexts.
  }
}

export function normalizeRecognitionMetadataUri(value: string) {
  let uri = value.trim();
  const githubBlob = uri.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/
  );
  if (githubBlob) {
    uri = `https://raw.githubusercontent.com/${githubBlob[1]}/${githubBlob[2]}/${githubBlob[3]}`;
  }
  if (!/^https:\/\/\S+$/.test(uri)) {
    throw new Error("La metadata debe ser una URL HTTPS pública de Pinata o IPFS.");
  }
  if (uri.length > 200) {
    throw new Error("La URL de metadata supera los 200 caracteres.");
  }
  return uri;
}

function createRecognitionUmi(cluster: ClusterMoniker): Umi {
  return createUmi(RPC_URLS[cluster]).use(mplCore());
}

type UmiInstruction = {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: Uint8Array;
};

function toKitInstruction(instruction: UmiInstruction) {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.keys.map((account) => ({
      address: address(account.pubkey),
      role: account.isSigner
        ? account.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : account.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: instruction.data,
  };
}

async function convertBuilder(
  builder: { getInstructions: () => UmiInstruction[] },
  ownerSigner: TransactionSigner,
  assetSigner: TransactionSigner
) {
  return builder.getInstructions().map((instruction) =>
    addSignersToInstruction(
      [ownerSigner, assetSigner],
      toKitInstruction(instruction)
    )
  );
}

export async function buildRecognitionCollectionInstructions({
  cluster,
  owner,
  ownerSigner,
  dealershipName,
  metadataUri,
}: {
  cluster: ClusterMoniker;
  owner: string;
  ownerSigner: TransactionSigner;
  dealershipName: string;
  metadataUri: string;
}) {
  const umi = createRecognitionUmi(cluster);
  const collection = generateSigner(umi);
  const authority = createNoopSigner(publicKey(owner));
  const builder = createCollection(umi, {
    collection,
    name: `Reconocimientos ${dealershipName.trim()}`,
    uri: normalizeRecognitionMetadataUri(metadataUri),
    payer: authority,
    updateAuthority: authority.publicKey,
  });
  const collectionSigner = await createKeyPairSignerFromBytes(collection.secretKey);
  const instructions = await convertBuilder(
    builder,
    ownerSigner,
    collectionSigner
  );
  return {
    collection: collection.publicKey,
    instructions,
  };
}

export async function buildRecognitionAssetInstructions({
  cluster,
  owner,
  ownerSigner,
  collection,
  metadataUri,
  customerWallet,
  customer,
  dealership,
  sale,
  milestone,
}: {
  cluster: ClusterMoniker;
  owner: string;
  ownerSigner: TransactionSigner;
  collection: string;
  metadataUri: string;
  customerWallet: string;
  customer: string;
  dealership: string;
  sale: string;
  milestone: RecognitionMilestone;
}) {
  const umi = createRecognitionUmi(cluster);
  const asset = generateSigner(umi);
  const authority = createNoopSigner(publicKey(owner));
  const builder = create(umi, {
    asset,
    collection: {
      publicKey: publicKey(collection),
      oracles: [],
      lifecycleHooks: [],
    },
    owner: publicKey(customerWallet),
    authority,
    payer: authority,
    name: `Reconocimiento ${milestone} ${milestone === 1 ? "compra" : "compras"}`,
    uri: normalizeRecognitionMetadataUri(metadataUri),
    plugins: [
      {
        type: "Attributes",
        attributeList: [
          { key: "hito", value: String(milestone) },
          { key: "cliente", value: customer },
          { key: "concesionario", value: dealership },
          { key: "venta", value: sale },
        ],
      },
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
        authority: { type: "UpdateAuthority" },
      },
    ],
  });
  const assetSigner = await createKeyPairSignerFromBytes(asset.secretKey);
  const instructions = await convertBuilder(builder, ownerSigner, assetSigner);
  return { asset: asset.publicKey, instructions };
}

export async function readIssuedRecognitions(
  cluster: ClusterMoniker,
  collection: string
): Promise<IssuedRecognition[]> {
  const umi = createRecognitionUmi(cluster);
  const assets = await fetchAssetsByCollection(umi, publicKey(collection));
  return assets.map((asset) => {
    const attributes = Object.fromEntries(
      (asset.attributes?.attributeList ?? []).map((item) => [
        item.key,
        item.value,
      ])
    );
    return {
      address: asset.publicKey,
      owner: asset.owner,
      milestone: Number(attributes.hito),
      customer: attributes.cliente ?? "",
      dealership: attributes.concesionario ?? "",
      sale: attributes.venta ?? "",
    };
  });
}

export async function recognitionAlreadyIssued(
  cluster: ClusterMoniker,
  collection: string,
  customer: string,
  dealership: string,
  milestone: number
) {
  const issued = await readIssuedRecognitions(cluster, collection);
  return issued.some(
    (item) =>
      item.customer === customer &&
      item.dealership === dealership &&
      item.milestone === milestone
  );
}
