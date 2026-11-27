"use client";

import { useState } from "react";
import milestone1Image from "@/assets/recognitions/milestone-1.jpg";
import milestone3Image from "@/assets/recognitions/milestone-3.jpg";
import milestone5Image from "@/assets/recognitions/milestone-5.jpg";
import type { AppClient } from "../../lib/solana-client";
import type { ClusterMoniker } from "../../lib/solana-client";
import {
  saveRecognitionConfig,
  type RecognitionConfig,
  type RecognitionMilestone,
} from "../../lib/moto-ledger/recognitions";

const MILESTONES: RecognitionMilestone[] = [1, 3, 5];
const DEFAULT_IMAGES = { 1: milestone1Image, 3: milestone3Image, 5: milestone5Image };
const LABELS: Record<RecognitionMilestone, { name: string; description: string }> = {
  1: { name: "PRIMERA COMPRA", description: "El comienzo de una gran relación" },
  3: { name: "CLIENTE FRECUENTE", description: "Tu confianza nos impulsa" },
  5: { name: "CLIENTE DESTACADO", description: "Una relación que merece reconocimiento" },
};

export function RecognitionMilestoneUploader({
  client,
  owner,
  dealership,
  cluster,
  config,
  onSaved,
}: {
  client: AppClient;
  owner: string;
  dealership: string;
  cluster: ClusterMoniker;
  config: RecognitionConfig;
  onSaved: (config: RecognitionConfig) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<RecognitionMilestone, File>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const resolveImageFile = async (milestone: RecognitionMilestone) => {
    const selected = files[milestone];
    if (selected) return selected;
    const image = DEFAULT_IMAGES[milestone];
    const response = await fetch(image.src);
    if (!response.ok) throw new Error("No se pudo cargar la imagen JPG del hito " + milestone + ".");
    const blob = await response.blob();
    return new File([blob], "milestone-" + milestone + ".jpg", { type: "image/jpeg" });
  };

  const upload = async (milestone: RecognitionMilestone, file: File) => {
    if (cluster !== "devnet" && cluster !== "mainnet") {
      throw new Error("La carga de metadata está disponible en Devnet y Mainnet.");
    }
    const timestamp = Date.now();
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const network = cluster === "mainnet" ? "mainnet-beta" : "devnet";
    const message = [
      "MotoLedger IPFS metadata upload",
      "wallet:" + owner,
      "dealership:" + dealership,
      "cluster:" + network,
      "timestamp:" + timestamp,
      "nonce:" + nonce,
    ].join("\n");
    const signature = await client.wallet.signMessage(new TextEncoder().encode(message));
    const body = new FormData();
    body.set("image", file);
    body.set("name", LABELS[milestone].name);
    body.set("symbol", "ML-HITO-" + milestone);
    body.set("description", LABELS[milestone].description);
    body.set("wallet", owner);
    body.set("dealership", dealership);
    body.set("cluster", network);
    body.set("timestamp", String(timestamp));
    body.set("nonce", nonce);
    body.set("signature", btoa(String.fromCharCode(...signature)));
    body.set("purpose", "milestone");
    body.set("milestone", String(milestone));
    body.set("attributes", JSON.stringify([
      { trait_type: "Hito", value: milestone },
      { trait_type: "Plataforma", value: "MotoLedger" },
    ]));
    const response = await fetch("/api/ipfs/upload", { method: "POST", body });
    const result = await response.json() as {
      error?: string;
      imageUri: string;
      metadataUri: string;
      imageCid: string;
      metadataCid: string;
    };
    if (!response.ok) throw new Error(result.error || "No se pudo subir la metadata a Pinata.");
    return {
      name: LABELS[milestone].name,
      symbol: "ML-HITO-" + milestone,
      description: LABELS[milestone].description,
      imageUri: result.imageUri,
      metadataUri: result.metadataUri,
      imageCid: result.imageCid,
      metadataCid: result.metadataCid,
    };
  };

  const saveMilestone = async (milestone: RecognitionMilestone, baseConfig: RecognitionConfig = config): Promise<RecognitionConfig> => {
    const file = await resolveImageFile(milestone);
    const metadata = await upload(milestone, file);
    const next: RecognitionConfig = {
      ...baseConfig,
      milestones: { ...(baseConfig.milestones ?? {}), [milestone]: metadata },
    };
    saveRecognitionConfig(owner, dealership, cluster, next);
    onSaved(next);
    setFiles((current) => ({ ...current, [milestone]: undefined }));
    return next;
  };

  const uploadOne = async (milestone: RecognitionMilestone) => {
    setBusy(true);
    setStatus("");
    try {
      await saveMilestone(milestone);
      setStatus("Metadata del hito " + milestone + " guardada en Pinata.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo completar la carga.");
    } finally {
      setBusy(false);
    }
  };

  const uploadAll = async () => {
    const missing = MILESTONES.filter((milestone) =>
      !DEFAULT_IMAGES[milestone] && !files[milestone] && !config.milestones?.[milestone]
    );
    if (missing.length) {
      setStatus("Faltan imágenes para los hitos: " + missing.join(", ") + ".");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      let current = config;
      for (const milestone of MILESTONES) {
        if (files[milestone] || !current.milestones?.[milestone]) {
          current = await saveMilestone(milestone, current);
        }
      }
      setStatus("Las tres metadata de reconocimiento están cargadas.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo completar la carga.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#e9ebee] bg-white p-6 shadow-[0_2px_8px_rgba(24,32,40,0.025)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold tracking-[0.16em] text-[#e60012]">METADATA IPFS</p>
          <h3 className="mt-1 text-[14px] font-bold text-[#252a30]">Imágenes de los hitos</h3>
          <p className="mt-1 text-[10px] text-[#858d96]">Cada hito tendrá su propia imagen y JSON público en Pinata.</p>
        </div>
        <button type="button" onClick={() => void uploadAll()} disabled={busy} className="rounded-lg bg-[#e60012] px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-50">
          {busy ? "Subiendo…" : "Subir los tres hitos"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {MILESTONES.map((milestone) => {
          const saved = config.milestones?.[milestone];
          return (
            <div key={milestone} className="rounded-lg border border-[#edf0f2] p-3">
              <p className="text-[10px] font-bold text-[#252a30]">Hito {milestone} · {LABELS[milestone].name}</p>
              <p className="mt-1 text-[9px] text-[#858d96]">{saved ? "Metadata configurada" : "JPG incluido en assets/recognitions"}</p>
              <input type="file" accept="image/jpeg" onChange={(event) => setFiles((current) => ({ ...current, [milestone]: event.target.files?.[0] }))} className="mt-3 block w-full text-[9px] text-[#68717b] file:mr-2 file:rounded-md file:border-0 file:bg-[#f2f3f5] file:px-2 file:py-1.5 file:text-[9px] file:font-semibold" />
              {saved?.metadataUri && <a href={saved.metadataUri} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-[9px] text-[#16845a] underline">Ver JSON en IPFS ↗</a>}
              <button type="button" onClick={() => void uploadOne(milestone)} disabled={busy} className="mt-3 rounded-md border border-[#e2e5e8] px-3 py-2 text-[9px] font-semibold text-[#555e68] disabled:opacity-40">Subir solo este hito</button>
            </div>
          );
        })}
      </div>
      {status && <p className="mt-3 text-[10px] text-[#68717b]" role="status">{status}</p>}
      <p className="mt-3 text-[9px] text-[#9299a1]">Se utilizan por defecto los JPG versionados en assets/recognitions. Puedes sustituir cualquiera desde el selector. La wallet propietaria firma cada carga; las imágenes y JSON se suben a Pinata.</p>
    </section>
  );
}
