"use client";

import { useSyncExternalStore } from "react";

export type AppNotification = {
  id: number;
  message: string;
  signature: string;
  explorerUrl: string;
  createdAt: number;
  read: boolean;
};

const EMPTY_NOTIFICATIONS: AppNotification[] = [];
let notifications: AppNotification[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function addNotification(
  message: string,
  signature: string,
  explorerUrl: string
) {
  notifications = [
    {
      id: nextId++,
      message,
      signature,
      explorerUrl,
      createdAt: Date.now(),
      read: false,
    },
    ...notifications,
  ];
  emit();
}

export function markNotificationsRead() {
  if (notifications.every((item) => item.read)) return;
  notifications = notifications.map((item) => ({ ...item, read: true }));
  emit();
}

export function clearNotifications() {
  if (notifications.length === 0) return;
  notifications = [];
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return notifications;
}

function getServerSnapshot(): AppNotification[] {
  return EMPTY_NOTIFICATIONS;
}

export function useNotifications() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
