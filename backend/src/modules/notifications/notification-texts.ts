import type { NotificationType } from '../../infra/push/push.port';

export function notificationText(type: NotificationType): {
  title: string;
  body: string;
} {
  switch (type) {
    case 'incident_fall':
      return {
        title: 'Caída detectada',
        body: 'Hay una caída que no se canceló.',
      };
    case 'incident_manual':
      return {
        title: 'Emergencia manual',
        body: 'La persona pidió ayuda.',
      };
    case 'incident_delayed':
      return {
        title: 'Aviso atrasado',
        body: 'Llegó una caída con retraso.',
      };
    case 'incident_update':
      return {
        title: 'Actualización de incidencia',
        body: 'Hay un cambio en la incidencia.',
      };
    case 'postpone_reminder':
      return {
        title: 'Atención pospuesta',
        body: 'La atención sigue pospuesta.',
      };
    case 'postpone_collective':
      return {
        title: 'Atención pospuesta',
        body: 'Los cuidadores siguen con la atención pospuesta.',
      };
    case 'followup_question':
      return {
        title: 'Seguimiento',
        body: 'Hay una pregunta de seguimiento.',
      };
    case 'reminder_occurrence':
      return {
        title: 'Recordatorio',
        body: 'Hay un recordatorio pendiente.',
      };
  }
}
