import * as FileSystem from 'expo-file-system/legacy';
import { Ticket } from '../types/ticket';

async function safeDelete(uri: string | null | undefined) {
  const path = uri?.trim();
  if (!path || !path.startsWith('file:')) return;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore missing / permission errors
  }
}

/** Remove local PDF / photo / barcode image files tied to a pass. */
export async function deleteTicketLocalFiles(ticket: Ticket | undefined | null) {
  if (!ticket) return;
  await Promise.all([
    safeDelete(ticket.originalPdfUri),
    safeDelete(ticket.hotelPhotoUri),
    safeDelete(ticket.boardingCode?.imageUri),
  ]);
}

export async function deleteTicketsLocalFiles(tickets: Ticket[]) {
  await Promise.all(tickets.map((t) => deleteTicketLocalFiles(t)));
}
