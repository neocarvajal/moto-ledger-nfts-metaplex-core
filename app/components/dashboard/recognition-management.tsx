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
import { useCluster } from "../cluster-context";
import {
  deriveWalletClientePda,
} from "../../lib/moto-ledger/pdas";
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
  readRecognitionConfig,
  saveRecognitionConfig,
  type IssuedRecognition,
  type RecognitionConfig,
} from "../../lib/moto-ledger/recognitions";

type CustomerProgress = {
  address: string;
  name: string;
  purchases: number;
  wallet: string | null;
  milestoneSales: Partial<Record<1 | 3 | 5, string>>;
};

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

function explorerAddress(value: string, getExplorerUrl: (path: string) => string) {
  return getExplorerUrl(`address/${value}`);
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

  useEffect(() => {
    const stored = owner
      ? readRecognitionConfig(owner, concesionario, cluster)
      : null;
    setConfig(stored);
    setMetadataUri(stored?.metadataUri ?? "");
    setCollectionInput(stored?.collection ?? "");
    setLastResult("");
    setError("");
  }, [owner, concesionario, cluster]);

  const loadData = useCallback(async () => {
    if (!owner || !concesionario) {
      setCustomers([]);
      setIssued([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
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

      const salesByCustomer = new Map<
        string,
        Array<{ address: string; fechaVenta: bigint }>
      >();
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
          const customer = await client.registro.accounts.cliente.fetch(
            address(customerAddress)
          );
          const [walletPda] = await deriveWalletClientePda(address(customerAddress));
          const walletInfo = await client.rpc.getAccountInfo(
            walletPda,
            { encoding: "base64" }
          ).send();
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

      if (config) {
        const assets = await readIssuedRecognitions(cluster, config.collection);
        setIssued(assets.filter((item) => item.dealership === concesionario));
      } else {
        setIssued([]);
      }
    } catch (loadError) {
      console.error("No se pudieron cargar los reconocimientos:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron consultar las ventas y los NFT del concesionario."
      );
    } finally {
      setLoading(false);
    }
  }, [client, cluster, config, concesionario, owner]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pending = useMemo(() => {
    const issuedKeys = new Set(
      issued.map((item) => `${item.customer}:${item.milestone}`)
    );
    return customers.flatMap((customer) =>
      RECOGNITION_MILESTONES
        .filter(
          (milestone) =>
            customer.purchases >= milestone &&
            !issuedKeys.has(`${customer.address}:${milestone}`)
        )
        .map((milestone) => ({ customer, milestone }))
    );
  }, [customers, issued]);

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
      const next = { collection: built.collection, metadataUri: uri };
      saveRecognitionConfig(owner, concesionario, cluster, next);
      setConfig(next);
      setCollectionInput(built.collection);
      setMetadataUri(uri);
      setLastResult("Colección de reconocimientos creada correctamente.");
      notifyTransactionSuccess(
        "Colección Metaplex Core creada.",
        result.context.signature
      );
    } catch (createError) {
      console.error("No se pudo crear la colección de reconocimientos:", createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear la colección Metaplex Core."
      );
    } finally {
      setBusy(null);
    }
  };

  const restoreCollection = () => {
    if (!owner) return;
    try {
      const uri = normalizeRecognitionMetadataUri(metadataUri);
      const collection = address(collectionInput.trim());
      const next = { collection, metadataUri: uri };
      saveRecognitionConfig(owner, concesionario, cluster, next);
      setConfig(next);
      setLastResult("Colección existente vinculada a este concesionario en este navegador.");
      setError("");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Revisa la dirección de la colección y la URL de metadata."
      );
    }
  };

  const issue = async (customer: CustomerProgress, milestone: number) => {
    if (!connected?.signer || !owner || !config) return;
    if (!customer.wallet) {
      toast.error("El cliente debe vincular su wallet desde el módulo Clientes.");
      return;
    }
    const key = `${customer.address}:${milestone}`;
    setBusy(key);
    setError("");
    setLastResult("");
    try {
      const built = await buildRecognitionAssetInstructions({
        cluster,
        owner,
        ownerSigner: connected.signer,
        collection: config.collection,
        metadataUri: config.metadataUri,
        customerWallet: customer.wallet,
        customer: customer.address,
        dealership: concesionario,
        sale: customer.milestoneSales[milestone as 1 | 3 | 5] ?? "",
        milestone: milestone as 1 | 3 | 5,
      });
      const before = await client.rpc.getBalance(address(owner)).send();
      const result = await client.sendTransaction(built.instructions);
      const after = await client.rpc.getBalance(address(owner)).send();
      const cost = Number(before.value - after.value) / 1_000_000_000;
      setLastResult(
        `Reconocimiento de ${milestone} ${milestone === 1 ? "compra" : "compras"} emitido para ${customer.name}. Costo aproximado: ${cost.toFixed(6)} SOL.`
      );
      notifyTransactionSuccess(
        `Reconocimiento NFT de ${milestone} ${milestone === 1 ? "compra" : "compras"} emitido.`,
        result.context.signature
      );
      await loadData();
    } catch (issueError) {
      console.error("No se pudo emitir el reconocimiento:", issueError);
      setError(
        issueError instanceof Error
          ? issueError.message
          : "No se pudo emitir el reconocimiento NFT."
      );
    } finally {
      setBusy(null);
    }
  };

  const customerName = (customerAddress: string) =>
    customers.find((item) => item.address === customerAddress)?.name ??
    shortAddress(customerAddress);

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
                    <span className="mb-1 block text-[9px] font-semibold text-[#68717b]">Metadata JSON público</span>
                    <input value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} spellCheck={false} className="w-full rounded-lg border border-[#e2e5e8] px-3 py-2 text-[10px] outline-none focus:border-[#e60012]" />
                  </label>
                  <button type="button" onClick={() => { try { const next = { ...config, metadataUri: normalizeRecognitionMetadataUri(metadataUri) }; saveRecognitionConfig(owner, concesionario, cluster, next); setConfig(next); setMetadataUri(next.metadataUri); setError(""); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "URL inválida."); } }} className="mt-3 rounded-lg border border-[#e2e5e8] px-3 py-2 text-[9px] font-semibold text-[#555e68] hover:border-[#e60012]">Guardar URL de metadata</button>
                </>
              ) : (
                <>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-[9px] font-semibold text-[#68717b]">URL HTTPS del JSON de metadata (Pinata/IPFS)</span>
                    <input value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} required placeholder="https://gateway.mypinata.cloud/ipfs/..." spellCheck={false} className="w-full rounded-lg border border-[#e2e5e8] px-3 py-2 text-[10px] outline-none focus:border-[#e60012]" />
                  </label>
                  <button type="button" onClick={() => void createCollection()} disabled={busy !== null || !metadataUri.trim()} className="mt-3 rounded-lg bg-[#e60012] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#c90010] disabled:opacity-50">
                    {busy === "collection" ? "Creando colección…" : "Crear colección"}
                  </button>
                  <div className="mt-4 border-t border-[#eff0f2] pt-3">
                    <p className="text-[9px] font-semibold text-[#68717b]">¿Ya existe una colección para este concesionario?</p>
                    <input value={collectionInput} onChange={(event) => setCollectionInput(event.target.value)} placeholder="Dirección de la colección" spellCheck={false} className="mt-2 w-full rounded-lg border border-[#e2e5e8] px-3 py-2 font-mono text-[9px] outline-none focus:border-[#e60012]" />
                    <button type="button" onClick={restoreCollection} disabled={!collectionInput.trim() || !metadataUri.trim()} className="mt-2 rounded-lg border border-[#e2e5e8] px-3 py-2 text-[9px] font-semibold text-[#555e68] hover:border-[#e60012]">Vincular colección existente</button>
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

      {busy && busy !== "collection" && <p className="rounded-lg bg-[#fff9ef] px-4 py-3 text-[10px] text-[#9a6a20]">Preparando y enviando reconocimiento… revisa tu wallet.</p>}
      {lastResult && <p className="rounded-lg border border-[#ccebdc] bg-[#f0faf5] px-4 py-3 text-[10px] text-[#176b4b]" role="status">{lastResult}</p>}
      {error && <p className="rounded-lg border border-[#f2d1d1] bg-[#fff5f5] px-4 py-3 text-[10px] text-[#c43d3d]" role="alert">{error}</p>}

      <section className="overflow-hidden rounded-xl border border-[#e9ebee] bg-white shadow-[0_2px_8px_rgba(24,32,40,0.025)]">
        <div className="border-b border-[#eff0f2] px-6 py-4">
          <p className="text-[9px] font-bold tracking-[0.16em] text-[#e60012]">PENDIENTES</p>
          <h3 className="mt-1 text-[14px] font-bold text-[#252a30]">Clientes que ya alcanzaron un hito</h3>
        </div>
        {!config ? (
          <p className="p-5 text-[10px] text-[#858d96]">Crea o vincula la colección para consultar y emitir reconocimientos pendientes.</p>
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
                    <a href={explorerAddress(customer.wallet, getExplorerUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-mono text-[9px] text-[#16845a] underline decoration-dotted underline-offset-2">{shortAddress(customer.wallet)} · wallet vinculada ↗</a>
                  ) : (
                    <p className="mt-1 text-[9px] font-semibold text-[#b7791f]">Wallet no vinculada</p>
                  )}
                </div>
                {customer.wallet ? (
                  <button type="button" onClick={() => void issue(customer, milestone)} disabled={busy !== null} className="rounded-lg bg-[#e60012] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#c90010] disabled:opacity-50">
                    {busy === `${customer.address}:${milestone}` ? "Emitiendo…" : "Emitir reconocimiento"}
                  </button>
                ) : (
                  <button type="button" onClick={() => onNavigate("customers")} className="rounded-lg border border-[#e2e5e8] px-4 py-2.5 text-[10px] font-semibold text-[#555e68] hover:border-[#e60012]">Ir a Clientes y vincular wallet</button>
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
