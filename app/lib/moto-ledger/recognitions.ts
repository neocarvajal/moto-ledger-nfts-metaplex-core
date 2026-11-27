import {
  addSignersToInstruction,
  createSignerFromKeyPair,
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
import {
  toKitInstruction,
  toKitKeypair,
} from "@metaplex-foundation/umi-kit-adapters";
import type { ClusterMoniker } from "../solana-client";

export const RECOGNITION_MILESTONES = [1, 3, 5] as const;

export type RecognitionMilestone = (typeof RECOGNITION_MILESTONES)[number];

export type RecognitionConfig = {
  collection: string;
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
    if (
      typeof parsed.collection !== "string" ||
      typeof parsed.metadataUri !== "string"
    ) return null;
    return { collection: parsed.collection, metadataUri: parsed.metadataUri };
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

async function convertBuilder(
  builder: { getInstructions: () => Array<Parameters<typeof toKitInstruction>[0]> },
  ownerSigner: TransactionSigner,
  assetSigner: ReturnType<typeof createSignerFromKeyPair> extends Promise<infer T> ? T : never
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
  const collectionSigner = await createSignerFromKeyPair(
    await toKitKeypair(collection)
  );
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
  const assetSigner = await createSignerFromKeyPair(await toKitKeypair(asset));
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
