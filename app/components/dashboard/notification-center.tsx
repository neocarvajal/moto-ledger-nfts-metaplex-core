"use client";

import { useState } from "react";
import {
  clearNotifications,
  markNotificationsRead,
  useNotifications,
} from "../../lib/notifications";

export function NotificationCenter() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((item) => !item.read).length;

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) markNotificationsRead();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notificaciones: ${unread} sin leer`}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[#e9ebee] text-[#555e68] transition hover:bg-[#f7f8fa]"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e60012] px-1 text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#e5e8eb] bg-white shadow-[0_12px_40px_rgba(24,32,40,0.16)]">
          <div className="flex items-center justify-between border-b border-[#eff0f2] px-4 py-3">
            <div>
              <p className="text-[12px] font-bold text-[#252a30]">Notificaciones</p>
              <p className="mt-0.5 text-[9px] text-[#9299a1]">{notifications.length} durante esta sesión</p>
            </div>
            <button
              type="button"
              onClick={clearNotifications}
              disabled={notifications.length === 0}
              className="text-[9px] font-semibold text-[#858d96] hover:text-[#e60012] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpiar
            </button>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[10px] text-[#9299a1]">No hay notificaciones en esta sesión.</p>
            ) : (
              <ul className="divide-y divide-[#f0f1f3]">
                {notifications.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#16a36a]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold leading-relaxed text-[#343a40]">{item.message}</p>
                        <p className="mt-1 text-[9px] text-[#9299a1]">
                          {new Date(item.createdAt).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <a
                          href={item.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-[9px] font-semibold text-[#16845a] underline decoration-dotted underline-offset-2"
                        >
                          Ver transacción en Explorer ↗
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-[#eff0f2] px-4 py-2">
            <p className="text-[8px] text-[#a0a6ad]">Las notificaciones se eliminan al cerrar o recargar la sesión.</p>
          </div>
        </div>
      )}
    </div>
  );
}
