import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export async function programarRecordatorio(title: string, body: string, at: Date): Promise<void> {
  if (at.getTime() <= Date.now()) throw new Error('La fecha del recordatorio debe estar en el futuro.');
  if (!Capacitor.isNativePlatform()) {
    if (!('Notification' in window)) throw new Error('Este navegador no admite notificaciones.');
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('No se concedió permiso para notificaciones.');
    const delay = Math.min(at.getTime() - Date.now(), 2147483647);
    window.setTimeout(() => new Notification(title, { body }), delay);
    return;
  }
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') { const requested = await LocalNotifications.requestPermissions(); if (requested.display !== 'granted') throw new Error('No se concedió permiso para notificaciones.'); }
  const id = Math.max(1, Math.floor(Date.now() % 2147483647));
  await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at }, isExactNotification: false, sound: null, attachments: [], actionTypeId: '', extra: { source: 'papeleria-arcoiris' } }] });
}