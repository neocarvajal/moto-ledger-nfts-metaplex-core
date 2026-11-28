"use client";

import { toast } from "sonner";
import { addNotification } from "./notifications";

export function notifyTransactionSuccess(message: string, signature: string) {
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  addNotification(message, signature, explorerUrl);

  toast.success(message, {
    duration: 5000,
    closeButton: true,
    description: (
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2"
      >
        Ver transacción en Solana Explorer ↗
      </a>
    ),
  });
}
