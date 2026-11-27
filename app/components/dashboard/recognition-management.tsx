"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  address,
  getBase58Decoder,
  getBase64Encoder,
  type Base58EncodedBytes,
} from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { toast } from "sonner";
import { useAppClient } from "../../lib/client-provider";
import { notifyTransactionSuccess } from "../../lib/transaction-toast";
import { RecognitionMilestoneUploader } from "./recognition-milestone-uploader";
import { RecognitionCollectionMetadataUploader } from "./recognition-collection-metadata-uploader";
import { useCluster } from "../cluster-context";
import {
  deriveReconocimientoColeccionPda,
  deriveWalletClientePda,
} from "../../lib/moto-ledger/pdas";
import {
  fetchReconocimientoColeccion,
} from "../../lib/moto-ledger/src/generated/accounts/reconocimientoColeccion";
import {
  getActualizarMetadataReconocimientosInstruction,
  getRegistrarColeccionReconocimientosInstruction,
} from "../../lib/moto-ledger/src/generated/instructions";
import {
  getVentaDecoder,
  getVentaDiscriminatorBytes,
} from "../../lib/moto-ledger/src/generated/accounts/venta";
import { REGISTRO_PROGRAM_ADDRESS } from "../../lib/moto-ledger/src/generated/programs";
import {
  RECOGNITION_MILESTONES,
  buildRecognitionAssetInstructions,
  buildRecognitionCollectionInstructions,
  normalizeRecognitionMetadataUri,
  readIssuedRecognitions,
  recognitionAlreadyIssued,
  verifyRecognitionCoreCollection,
  type IssuedRecognition,
  type RecognitionConfig,
  type RecognitionMetadata,
  type RecognitionMilestone,
} from "../../lib/moto-ledger/recognitions";

type CustomerProgress = {
  address: string;
  name: string;
  purchases: number;
  wallet: string | null;
  milestoneSales: Partial<Record<RecognitionMilestone, string>>;
};

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

function explorerAddress(value: string, getExplorerUrl: (path: string) => string) {
  return getExplorerUrl(`address/${value}`);
}

function metadataFromUri(uri: string, milestone?: RecognitionMilestone): RecognitionMetadata | undefined {
  if (!uri) return undefined;
  return {
    name: milestone ? `Reconocimiento ${milestone}` : "Colección de reconocimientos",
    symbol: milestone ? `ML-HITO-${milestone}` : "MOTO",
    description: milestone ? `Hito de compra ${milestone}` : "Colección de reconocimientos MotoLedger",
    imageUri: "",
    metadataUri: uri,
  };
}

export function RecognitionManagement({
  concesionario,
  nombreConcesionario,
  onNavigate,
}: {
  concesionario: string;
  nombreConcesionario: string;
  onNavigate: (module: string) => void;
}) {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { cluster, getExplorerUrl } = useCluster();
  const owner = connected?.account.address ?? "";
  const [config, setConfig] = useState<RecognitionConfig | null>(null);
  const [metadataUri, setMetadataUri] = useState("");
  const [collectionInput, setCollectionInput] = useState("");
  const [customers, setCustomers] = useState<CustomerProgress[]>([]);
  const [issued, setIssued] = useState<IssuedRecognition[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState("");
  const [collectionPda, setCollectionPda] = useState("");

  const applyOnChainConfig = useCallback((data: {
    collection: string;
    collectionMetadataUri: string;
    hito1MetadataUri: string;
    hito3MetadataUri: string;
    hito5MetadataUri: string;
  }) => {
    const next: RecognitionConfig = {
      collection: data.collection,
      metadataUri: data.collectionMetadataUri,
      collectionMetadata: metadataFromUri(data.collectionMetadataUri),
      milestones: {
        1: metadataFromUri(data.hito1MetadataUri, 1),
        3: metadataFromUri(data.hito3MetadataUri, 3),
        5: metadataFromUri(data.hito5MetadataUri, 5),
      },
    };
    setConfig(next);
    setMetadataUri(data.collectionMetadataUri);
    setCollectionInput(data.collection);
  }, []);

  const loadCollectionConfig = useCallback(async () => {
    if (!concesionario || !owner) {
      setConfig(null);
      setCollectionPda("");
      return null;
    }
    const [pda] = await deriveReconocimientoColeccionPda(address(concesionario));
    setCollectionPda(pda);
    const info = await client.rpc.getAccountInfo(pda, { encoding: "base64" }).send();
    if (!info.value) {
      setConfig(null);
      setMetadataUri("");
      setCollectionInput("");
      return null;
    }
    const account = await fetchReconocimientoColeccion(client.rpc, pda);
    if (account.data.concesionario !== concesionario || account.data.owner !== owner) {
      throw new Error("La configuración NFT on-chain no corresponde al owner y concesionario seleccionados.");
    }
    applyOnChainConfig(account.data);
    return account.data;
  }, [applyOnChainConfig, client, concesionario, owner]);

  useEffect(() => {
    setError("");
    setLastResult("");
    void loadCollectionConfig().catch((loadError) => {
      console.error("No se pudo consultar la configuración NFT on-chain:", loadError);
      setError(loadError instanceof Error ? loadError.message : "No se pudo consultar la colección on-chain.");
    });
  }, [loadCollectionConfig, owner, cluster]);

  const persistMetadata = useCallback(async (next: RecognitionConfig) => {
    if (!connected?.signer || !owner || !collectionPda) {
      throw new Error("Conecta la wallet owner para actualizar la metadata on-chain.");
    }
    const collectionMetadataUri = normalizeRecognitionMetadataUri(
      next.collectionMetadata?.metadataUri ?? next.metadataUri
    );
    const ix = getActualizarMetadataReconocimientosInstruction({
      owner: connected.signer,
      concesionario: address(concesionario),
      reconocimientoColeccion: address(collectionPda),
      collectionMetadataUri,
      hito1MetadataUri: next.milestones?.[1]?.metadataUri ?? "",
      hito3MetadataUri: next.milestones?.[3]?.metadataUri ?? "",
      hito5MetadataUri: next.milestones?.[5]?.metadataUri ?? "",
    });
    const result = await client.sendTransaction([ix]);
    const refreshed = await fetchReconocimientoColeccion(client.rpc, address(collectionPda));
    applyOnChainConfig(refreshed.data);
    notifyTransactionSuccess("Metadata de reconocimientos actualizada en Solana.", result.context.signature);
  }, [applyOnChainConfig, client, collectionPda, connected?.signer, concesionario, owner]);

  const loadData = useCallback(async () => {
    if (!owner || !concesionario) {
      setCustomers([]);
      setIssued([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const onChainConfig = await loadCollectionConfig();
      const dealerFilter = address(concesionario) as Base58EncodedBytes;
      const saleDiscriminator = getBase58Decoder().decode(
        getVentaDiscriminatorBytes()
      ) as Base58EncodedBytes;
      const sales = await client.rpc.getProgramAccounts(
        REGISTRO_PROGRAM_ADDRESS,
        {
          encoding: "base64",
          filters: [
            { memcmp: { offset: 0n, bytes: saleDiscriminator, encoding: "base58" } },
            { memcmp: { offset: 8n, bytes: dealerFilter, encoding: "base58" } },
          ],
        }
      ).send();

      const salesByCustomer = new Map<string, Array<{ address: string; fechaVenta: bigint }>>();
      for (const item of sales) {
        const sale = getVentaDecoder().decode(
          getBase64Encoder().encode(item.account.data[0])
        );
        const customerSales = salesByCustomer.get(sale.cliente) ?? [];
        customerSales.push({ address: item.pubkey, fechaVenta: sale.fechaVenta });
        salesByCustomer.set(sale.cliente, customerSales);
      }

      const progress = await Promise.all(
        [...salesByCustomer.entries()].map(async ([customerAddress, customerSales]) => {
          customerSales.sort((a, b) =>
            a.fechaVenta < b.fechaVenta ? -1 : a.fechaVenta > b.fechaVenta ? 1 : 0
          );
          const customer = await client.registro.accounts.cliente.fetch(address(customerAddress));
          const [walletPda] = await deriveWalletClientePda(address(customerAddress));
          const walletInfo = await client.rpc.getAccountInfo(walletPda, { encoding: "base64" }).send();
          let wallet: string | null = null;
          if (walletInfo.value) {
            const linked = await client.registro.accounts.walletCliente.fetch(walletPda);
            wallet = linked.data.wallet;
          }
          return {
            address: customerAddress,
            name: customer.data.nombreCliente,
            purchases: customerSales.length,
            wallet,
            milestoneSales: {
              1: customerSales[0]?.address,
              3: customerSales[2]?.address,
              5: customerSales[4]?.address,
            },
          };
        })
      );
      progress.sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
      setCustomers(progress);

      if (onChainConfig) {
        const assets = await readIssuedRecognitions(cluster, onChainConfig.collection);
        setIssued(assets.filter((item) => item.dealership === concesionario));
      } else {
        setIssued([]);
      }
    } catch (loadError) {
      console.error("No se pudieron cargar los reconocimientos:", loadError);
      setError(loadError instanceof Error ? loadError.message : "No se pudieron consultar las ventas y los NFT del concesionario.");
    } finally {
      setLoading(false);
    }
  }, [client, cluster, concesionario, loadCollectionConfig, owner]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pending = useMemo(() => {
    const issuedKeys = new Set(issued.map((item) => `${item.customer}:${item.milestone}`));
    return customers.flatMap((customer) =>
      RECOGNITION_MILESTONES
        .filter((milestone) => customer.purchases >= milestone && !issuedKeys.has(`${customer.address}:${milestone}`))
        .map((milestone) => ({ customer, milestone }))
    );
  }, [customers, issued]);
  const readyPending = useMemo(
    () => pending.filter(({ customer, milestone }) =>
      Boolean(customer.wallet && config?.milestones?.[milestone]?.metadataUri)
    ),
    [pending, config]
  );

  const registerCollection = async (collectionAddress: string, uriValue: string) => {
    if (!connected?.signer || !owner) throw new Error("Conecta la wallet owner del concesionario.");
    const collection = address(collectionAddress.trim());
    const uri = normalizeRecognitionMetadataUri(uriValue);
    await verifyRecognitionCoreCollection(cluster, collection);
    const [pda] = await deriveReconocimientoColeccionPda(address(concesionario));
    const current = await client.rpc.getAccountInfo(pda, { encoding: "base64" }).send();
    if (current.value) throw new Error("Este concesionario ya tiene una colección registrada on-chain. Actualiza su metadata en lugar de registrar otra.");
    const ix = getRegistrarColeccionReconocimientosInstruction({
      owner: connected.signer,
      concesionario: address(concesionario),
      collection,
      reconocimientoColeccion: pda,
      collectionMetadataUri: uri,
    });
    const result = await client.sendTransaction([ix]);
    const account = await fetchReconocimientoColeccion(client.rpc, pda);
    applyOnChainConfig(account.data);
    setLastResult("Colección Core registrada en Solana para este concesionario.");
    notifyTransactionSuccess("Colección de reconocimientos registrada on-chain.", result.context.signature);
    await loadData();
  };

  const createCollection = async () => {
    if (!connected?.signer || !owner) {
      toast.error("Conecta la wallet propietaria del concesionario.");
      return;
    }
    setBusy("collection");
    setError("");
    setLastResult("");
    try {
      const uri = normalizeRecognitionMetadataUri(metadataUri);
      const built = await buildRecognitionCollectionInstructions({
        cluster,
        owner,
        ownerSigner: connected.signer,
        dealershipName: nombreConcesionario,
        metadataUri: uri,
      });
      const result = await client.sendTransaction(built.instructions);
      setCollectionInput(built.collection);
      setLastResult("Colección Core creada. Registrando su dirección en Solana…");
      notifyTransactionSuccess("Colección Metaplex Core creada.", result.context.signature);
      try {
        await registerCollection(built.collection, uri);
      } catch (registrationError) {
        setError(
          (registrationError instanceof Error ? registrationError.message : "No se pudo registrar la colección en Anchor.") +
          " La colección Core ya fue creada; conserva esta dirección y reintenta el registro, sin crear otra colección."
        );
      }
    } catch (createError) {
      console.error("No se pudo crear la colección de reconocimientos:", createError);
      setError(createError instanceof Error ? createError.message : "No se pudo crear la colección Metaplex Core.");
    } finally {
      setBusy(null);
    }
  };

  const recoverRegistration = async () => {
    setBusy("register");
    setError("");
    try {
      await registerCollection(collectionInput, metadataUri);
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : "No se pudo registrar la colección existente.");
    } finally {
      setBusy(null);
    }
  };

  const issue = async (customer: CustomerProgress, milestone: RecognitionMilestone) => {
    if (!connected?.signer || !owner || !config) return;
    const metadataUriForMilestone = config.milestones?.[milestone]?.metadataUri;
    if (!metadataUriForMilestone) {
      toast.error("Primero configura la metadata on-chain de este hito.");
      return;
    }
    if (!customer.wallet) {
      toast.error("El cliente debe tener una wallet destinataria asociada.");
      return;
    }
    const key = `${customer.address}:${milestone}`;
    setBusy(key);
    setError("");
    setLastResult("");
    try {
      const alreadyIssued = await recognitionAlreadyIssued(
        cluster,
        config.collection,
        customer.address,
        concesionario,
        milestone
      );
      if (alreadyIssued) {
        setLastResult(`El reconocimiento del hito ${milestone} ya existe en la colección; no se emitió un duplicado.`);
        await loadData();
        return;
      }
      const built = await buildRecognitionAssetInstructions({
        cluster,
        owner,
        ownerSigner: connected.signer,
        collection: config.collection,
        metadataUri: metadataUriForMilestone,
        customerWallet: customer.wallet,
        customer: customer.address,
        dealership: concesionario,
        sale: customer.milestoneSales[milestone] ?? "",
        milestone,
      });
      const before = await client.rpc.getBalance(address(owner)).send();
      const result = await client.sendTransaction(built.instructions);
      const after = await client.rpc.getBalance(address(owner)).send();
      const cost = Number(before.value - after.value) / 1_000_000_000;
      setLastResult(`Reconocimiento de ${milestone} ${milestone === 1 ? "compra" : "compras"} emitido para ${customer.name}. Costo aproximado: ${cost.toFixed(6)} SOL.`);
      notifyTransactionSuccess(`Reconocimiento NFT de ${milestone} ${milestone === 1 ? "compra" : "compras"} emitido.`, result.context.signature);
      await loadData();
    } catch (issueError) {
      console.error("No se pudo emitir el reconocimiento:", issueError);
      setError(issueError instanceof Error ? issueError.message : "No se pudo emitir el reconocimiento NFT.");
    } finally {
      setBusy(null);
    }
  };

  const issueAllPending = async () => {
    if (!connected?.signer || !owner || !config) return;
    if (readyPending.length === 0) {
      toast.info("No hay reconocimientos listos para emitir. Revisa las wallets y la metadata de los hitos.");
      return;
    }
    setBusy("batch");
    setError("");
    setLastResult("");
    let emitted = 0;
    let alreadyPresent = 0;
    const failures: string[] = [];
    try {
      for (const { customer, milestone } of readyPending) {
        try {
          const exists = await recognitionAlreadyIssued(
            cluster,
            config.collection,
            customer.address,
            concesionario,
            milestone
          );
          if (exists) {
            alreadyPresent += 1;
            continue;
          }
          const metadataUriForMilestone = config.milestones?.[milestone]?.metadataUri;
          if (!metadataUriForMilestone || !customer.wallet) continue;
          const built = await buildRecognitionAssetInstructions({
            cluster,
            owner,
            ownerSigner: connected.signer,
            collection: config.collection,
            metadataUri: metadataUriForMilestone,
            customerWallet: customer.wallet,
            customer: customer.address,
            dealership: concesionario,
            sale: customer.milestoneSales[milestone] ?? "",
            milestone,
          });
          await client.sendTransaction(built.instructions);
          emitted += 1;
        } catch (issueError) {
          failures.push(`${customer.name} · hito ${milestone}: ${issueError instanceof Error ? issueError.message : "error de emisión"}`);
        }
      }
      await loadData();
      setLastResult(`Proceso por lote finalizado: ${emitted} NFT emitido(s), ${alreadyPresent} ya existente(s), ${failures.length} pendiente(s) por error.`);
      if (failures.length > 0) {
        setError(`No se pudieron emitir algunos reconocimientos. Puedes reintentarlos individualmente o volver a ejecutar el lote. ${failures.slice(0, 3).join(" | ")}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const customerName = (customerAddress: string) =>
    customers.find((item) => item.address === customerAddress)?.name ?? shortAddress(customerAddress);

  const onMilestonesSaved = async (next: RecognitionConfig) => {
    setBusy("metadata");
    setError("");
    try {
      await persistMetadata(next);
      setLastResult("Las URI de los hitos quedaron guardadas en la PDA de Solana.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la metadata on-chain.");
      throw saveError;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#e9ebee] bg-white p-6 shadow-[0_2px_8px_rgba(24,32,40,0.025)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold tracking-[0.16em] text-[#e60012]">METAPLEX CORE · NFT</p>
            <h2 className="mt-2 text-[15px] font-bold text-[#252a30]">Reconocimientos por compras</h2>
            <p className="mt-1 text-[10px] text-[#858d96]">Hitos independientes por concesionario: 1, 3 y 5 ventas confirmadas.</p>
          </div>
          <button type="button" onClick={() => void loadData()} disabled={loading || busy !== null} className="rounded-lg border border-[#e2e5e8] px-3 py-2 text-[10px] font-semibold text-[#555e68] hover:bg-[#f7f8fa] disabled:opacity-50">
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {!owner ? (
          <p className="mt-5 rounded-lg bg-[#f7f8fa] p-4 text-[10px] text-[#858d96]">Conecta la wallet propietaria del concesionario para administrar su colección.</p>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-[#edf0f2] p-4">
              <p className="text-[10px] font-bold text-[#555e68]">Colección del concesionario</p>
              {config ? (
                <>
                  <p className="mt-3 break-all font-mono text-[9px] text-[#68717b]">{config.collection}</p>
                  <a href={explorerAddress(config.collection, getExplorerUrl)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[9px] font-semibold text-[#e60012] underline decoration-dotted underline-offset-2">Ver colección en Explorer ↗</a>
                  <label className="mt-4 block">
                    <span className="mb-1 block text-[9px] font-semibold text-[#68717b]">Metadata JSON de la colección</span>
                    <input value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} spellCheck={false} className="w-full rounded-lg border border-[#e2e5e8] px-3 py-2 text-[10px] outline-none focus:border-[#e60012]" />
                  </label>
                  <button type="button" onClick={() => void onMilestonesSaved({ ...config, metadataUri, collectionMetadata: metadataFromUri(metadataUri) })} disabled={busy !== null || !metadataUri.trim()} className="mt-3 rounded-lg border border-[#e2e5e8] px-3 py-2 text-[9px] font-semibold text-[#555e68] hover:border-[#e60012] disabled:opacity-50">Guardar metadata on-chain</button>
                </>
              ) : (
                <>
                  <RecognitionCollectionMetadataUploader client={client} owner={owner} dealership={concesionario} dealershipName={nombreConcesionario} cluster={cluster} onUploaded={setMetadataUri} />
                  <label className="mt-3 block">
                    <span className="mb-1 block text-[9px] font-semibold text-[#68717b]">URL HTTPS del JSON de metadata (Pinata/IPFS)</span>
                    <input value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} required placeholder="https://gateway.mypinata.cloud/ipfs/…" spellCheck={false} className="w-full rounded-lg border border-[#e2e5e8] px-3 py-2 text-[10px] outline-none focus:border-[#e60012]" />
                  </label>
                  <button type="button" onClick={() => void createCollection()} disabled={busy !== null || !metadataUri.trim()} className="mt-3 rounded-lg bg-[#e60012] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#c90010] disabled:opacity-50">
                    {busy === "collection" ? "Creando colección…" : "Crear colección Core"}
                  </button>
                  <div className="mt-4 border-t border-[#eff0f2] pt-3">
                    <p className="text-[9px] font-semibold text-[#68717b]">Recuperación / migración de una colección Core ya creada</p>
                    <p className="mt-1 text-[9px] text-[#9299a1]">Utiliza esta opción solo si la colección ya existe en Core y falta registrar su dirección en la PDA de este concesionario. No crea una colección nueva.</p>
                    <input value={collectionInput} onChange={(event) => setCollectionInput(event.target.value)} placeholder="Dirección de la colección Core existente" spellCheck={false} className="mt-2 w-full rounded-lg border border-[#e2e5e8] px-3 py-2 font-mono text-[9px] outline-none focus:border-[#e60012]" />
                    <button type="button" onClick={() => void recoverRegistration()} disabled={busy !== null || !collectionInput.trim() || !metadataUri.trim()} className="mt-2 rounded-lg border border-[#e2e5e8] px-3 py-2 text-[9px] font-semibold text-[#555e68] hover:border-[#e60012] disabled:opacity-50">{busy === "register" ? "Registrando…" : "Registrar colección existente en Solana"}</button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-lg border border-[#edf0f2] p-4">
              <p className="text-[10px] font-bold text-[#555e68]">Progreso de clientes</p>
              <p className="mt-1 text-[9px] text-[#9299a1]">El conteo se calcula con las cuentas Venta de este concesionario, no con el contador global del cliente.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {RECOGNITION_MILESTONES.map((milestone) => (
                  <div key={milestone} className="rounded-lg bg-[#f7f8fa] p-3 text-center">
                    <p className="text-[17px] font-bold text-[#252a30]">{milestone}</p>
                    <p className="text-[8px] text-[#858d96]">{milestone === 1 ? "compra" : "compras"}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] text-[#9299a1]">{customers.length} cliente(s) con ventas registradas · {pending.length} reconocimiento(s) pendiente(s).</p>
            </div>
          </div>
        )}
      </section>

      {busy && busy !== "collection" && <p className="rounded-lg bg-[#fff9ef] px-4 py-3 text-[10px] text-[#9a6a20]">{busy === "batch" ? "Procesando el lote de reconocimientos. Aprueba las transacciones en tu wallet." : "Procesando reconocimiento… revisa tu wallet."}</p>}
      {lastResult && <p className="rounded-lg border border-[#ccebdc] bg-[#f0faf5] px-4 py-3 text-[10px] text-[#176b4b]" role="status">{lastResult}</p>}
      {error && <p className="rounded-lg border border-[#f2d1d1] bg-[#fff5f5] px-4 py-3 text-[10px] text-[#c43d3d]" role="alert">{error}</p>}

      {config && owner && (
        <RecognitionMilestoneUploader client={client} owner={owner} dealership={concesionario} cluster={cluster} config={config} onSaved={onMilestonesSaved} />
      )}

      <section className="overflow-hidden rounded-xl border border-[#e9ebee] bg-white shadow-[0_2px_8px_rgba(24,32,40,0.025)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eff0f2] px-6 py-4">
          <div>
            <p className="text-[9px] font-bold tracking-[0.16em] text-[#e60012]">PENDIENTES</p>
            <h3 className="mt-1 text-[14px] font-bold text-[#252a30]">Clientes que ya alcanzaron un hito</h3>
            <p className="mt-1 text-[9px] text-[#9299a1]">{readyPending.length} listo(s) para emitir · {pending.length - readyPending.length} requieren wallet o metadata</p>
          </div>
          <button type="button" onClick={() => void issueAllPending()} disabled={busy !== null || readyPending.length === 0} className="rounded-lg bg-[#e60012] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#c90010] disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "batch" ? "Emitiendo lote…" : `Emitir todos los disponibles (${readyPending.length})`}
          </button>
        </div>
        {!config ? (
          <p className="p-5 text-[10px] text-[#858d96]">Registra la colección en Solana para consultar y emitir reconocimientos pendientes.</p>
        ) : pending.length === 0 ? (
          <p className="p-5 text-[10px] text-[#858d96]">No hay reconocimientos pendientes. Los próximos hitos se detectarán al registrar ventas.</p>
        ) : (
          <div className="divide-y divide-[#f0f1f3]">
            {pending.map(({ customer, milestone }) => (
              <div key={`${customer.address}:${milestone}`} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-[#252a30]">{customer.name} · {milestone} {milestone === 1 ? "compra" : "compras"}</p>
                  <p className="mt-1 text-[9px] text-[#858d96]">{customer.purchases} ventas en este concesionario</p>
                  {customer.wallet ? (
                    <a href={explorerAddress(customer.wallet, getExplorerUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-mono text-[9px] text-[#16845a] underline decoration-dotted underline-offset-2">{shortAddress(customer.wallet)} · wallet destinataria ↗</a>
                  ) : (
                    <p className="mt-1 text-[9px] font-semibold text-[#b7791f]">Cliente sin wallet destinataria asociada</p>
                  )}
                </div>
                {customer.wallet ? (
                  <button type="button" onClick={() => void issue(customer, milestone)} disabled={busy !== null || !config.milestones?.[milestone]?.metadataUri} className="rounded-lg bg-[#e60012] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#c90010] disabled:opacity-50">
                    {busy === `${customer.address}:${milestone}` ? "Emitiendo…" : "Emitir reconocimiento"}
                  </button>
                ) : (
                  <button type="button" onClick={() => onNavigate("customers")} className="rounded-lg border border-[#e2e5e8] px-4 py-2.5 text-[10px] font-semibold text-[#555e68] hover:border-[#e60012]">Ir a Clientes</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e9ebee] bg-white shadow-[0_2px_8px_rgba(24,32,40,0.025)]">
        <div className="flex items-center justify-between border-b border-[#eff0f2] px-6 py-4">
          <div>
            <p className="text-[9px] font-bold tracking-[0.16em] text-[#e60012]">HISTORIAL NFT</p>
            <h3 className="mt-1 text-[14px] font-bold text-[#252a30]">Reconocimientos emitidos</h3>
          </div>
          <span className="rounded-md bg-[#f4f5f6] px-2 py-1 text-[9px] font-bold text-[#737b84]">{issued.length} assets</span>
        </div>
        {issued.length === 0 ? (
          <p className="p-5 text-[10px] text-[#858d96]">Todavía no hay reconocimientos en esta colección.</p>
        ) : (
          <div className="divide-y divide-[#f0f1f3]">
            {issued.map((item) => (
              <div key={item.address} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-[#252a30]">Reconocimiento {item.milestone} {item.milestone === 1 ? "compra" : "compras"} · {customerName(item.customer)}</p>
                  <p className="mt-1 font-mono text-[9px] text-[#858d96]">{shortAddress(item.address)} · Owner {shortAddress(item.owner)}</p>
                </div>
                <a href={explorerAddress(item.address, getExplorerUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] font-semibold text-[#e60012] underline decoration-dotted underline-offset-2">Ver Asset en Explorer ↗</a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
