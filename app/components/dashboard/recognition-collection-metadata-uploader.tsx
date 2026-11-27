"use client";

import { useState } from "react";
import type { AppClient, ClusterMoniker } from "../../lib/solana-client";

export function RecognitionCollectionMetadataUploader({
  client, owner, dealership, dealershipName, cluster, onUploaded,
}: {
  client: AppClient;
  owner: string;
  dealership: string;
  dealershipName: string;
  cluster: ClusterMoniker;
  onUploaded: (uri: string) => void;
}) {
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(dealershipName + " | Reconocimientos");
  const [symbol, setSymbol] = useState("MOTO");
  const [description, setDescription] = useState("Colección oficial de reconocimientos digitales de " + dealershipName + ", emitida en MotoLedger.");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const defaultCover = async (dealer: string, id: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo generar la portada.");
    const bg = ctx.createLinearGradient(0, 0, 1024, 1024);
    bg.addColorStop(0, "#111820"); bg.addColorStop(1, "#303b46");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = "#d7a64a"; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(512, 430, 285, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 54px Arial"; ctx.fillText("MOTOLEDGER", 512, 180);
    ctx.font = "bold 56px Arial"; ctx.fillText(dealer.toUpperCase().slice(0, 26), 512, 455);
    ctx.font = "bold 48px Arial"; ctx.fillText("RECONOCIMIENTOS", 512, 810);
    ctx.fillStyle = "#e5bd70"; ctx.font = "bold 38px Arial"; ctx.fillText("CONCESIONARIO #" + id, 512, 880);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo exportar la portada.")), "image/png"));
    return new File([blob], "motoledger-collection-cover.png", { type: "image/png" });
  };

  const upload = async () => {
    if (cluster !== "devnet" && cluster !== "mainnet") throw new Error("La carga de metadata está disponible en Devnet y Mainnet.");
    let image = file;
    let metadataName = name.trim();
    let metadataSymbol = symbol.trim().toUpperCase();
    let metadataDescription = description.trim();
    if (mode === "automatic") {
      const dealer = await client.registro.accounts.concesionario.fetch(dealership as never);
      const dealerName = dealer.data.nombreConcesionario;
      const dealerId = dealer.data.idConcesionario;
      metadataName = dealerName + " | Reconocimientos #" + dealerId;
      metadataSymbol = ("ML" + dealerId).slice(0, 10).toUpperCase();
      metadataDescription = "Colección oficial de reconocimientos digitales del concesionario " + dealerName + ", ID " + dealerId + ", emitida en MotoLedger. Incluye hitos de fidelidad por compras verificadas.";
      image = await defaultCover(dealerName, dealerId);
    }
    if (!image || metadataName.length < 3 || metadataSymbol.length < 2 || metadataDescription.length < 3) {
      throw new Error("Completa los campos e imagen de la colección.");
    }
    const timestamp = Date.now();
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const network = cluster === "mainnet" ? "mainnet-beta" : "devnet";
    const message = ["MotoLedger IPFS metadata upload", "wallet:" + owner, "dealership:" + dealership, "cluster:" + network, "timestamp:" + timestamp, "nonce:" + nonce].join("\\n");
    const signature = await client.wallet.signMessage(new TextEncoder().encode(message));
    const body = new FormData();
    body.set("image", image); body.set("name", metadataName); body.set("symbol", metadataSymbol); body.set("description", metadataDescription);
    body.set("wallet", owner); body.set("dealership", dealership); body.set("cluster", network); body.set("timestamp", String(timestamp));
    body.set("nonce", nonce); body.set("signature", btoa(String.fromCharCode(...signature))); body.set("purpose", "collection");
    body.set("attributes", JSON.stringify([{ trait_type: "Plataforma", value: "MotoLedger" }]));
    const response = await fetch("/api/ipfs/upload", { method: "POST", body });
    const result = await response.json() as { error?: string; metadataUri?: string };
    if (!response.ok || !result.metadataUri) throw new Error(result.error || "No se pudo subir la metadata a Pinata.");
    onUploaded(result.metadataUri);
    setStatus("Metadata de colección subida a Pinata. Ya puedes crear la colección Core.");
  };

  const handleUpload = async () => {
    setBusy(true); setStatus("");
    try { await upload(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo subir la metadata."); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-lg bg-[#f8f9fa] p-3">
      <p className="text-[9px] font-bold text-[#555e68]">Metadata de la colección</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setMode("automatic")} className={"rounded-md px-3 py-2 text-[9px] font-semibold " + (mode === "automatic" ? "bg-[#252a30] text-white" : "border border-[#e2e5e8] text-[#68717b]")}>Automática</button>
        <button type="button" onClick={() => setMode("manual")} className={"rounded-md px-3 py-2 text-[9px] font-semibold " + (mode === "manual" ? "bg-[#252a30] text-white" : "border border-[#e2e5e8] text-[#68717b]")}>Personalizada</button>
      </div>
      {mode === "manual" ? (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la colección" className="w-full rounded-md border border-[#e2e5e8] px-3 py-2 text-[10px]" />
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Símbolo" maxLength={10} className="w-full rounded-md border border-[#e2e5e8] px-3 py-2 text-[10px]" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" maxLength={500} className="w-full rounded-md border border-[#e2e5e8] px-3 py-2 text-[10px]" />
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[9px]" />
        </div>
      ) : (
        <p className="mt-2 text-[9px] text-[#858d96]">Genera un nombre, símbolo, descripción e imagen de portada usando el nombre e ID público del concesionario en Solana.</p>
      )}
      <button type="button" onClick={() => void handleUpload()} disabled={busy} className="mt-3 rounded-md bg-[#e60012] px-3 py-2 text-[9px] font-bold text-white disabled:opacity-50">{busy ? "Subiendo metadata…" : "Generar y subir metadata"}</button>
      {status && <p className="mt-2 text-[9px] text-[#68717b]" role="status">{status}</p>}
    </div>
  );
}
