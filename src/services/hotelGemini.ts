import { BusAmenity, ParsedTicketDraft } from '../types/ticket';
import { NOT_AVAILABLE, ROOM_PENDING } from '../parsers/hotelDetect';
import { pdfLog, pdfLogError } from '../parsers/pdfDiagnostics';
import { proxyFetch } from './apiProxy';
import { builtinGeminiApiKey, builtinGeminiModel } from './geminiSecrets';

/**
 * Gemini structured-output schema for hotel boarding pass fields.
 * Matches the visual UI — Gemini fills JSON; the app renders the pass.
 */
export const HOTEL_PASS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_hotel_booking: {
      type: 'BOOLEAN',
      description: 'True only if this document is a hotel booking / stay voucher',
    },
    hotel_name: { type: 'STRING', nullable: true },
    booking_status: { type: 'STRING', nullable: true },
    booking_id: { type: 'STRING', nullable: true },
    guest_name: { type: 'STRING', nullable: true },
    number_of_guests: { type: 'STRING', nullable: true },
    check_in_date: { type: 'STRING', nullable: true },
    check_in_time: { type: 'STRING', nullable: true },
    check_out_date: { type: 'STRING', nullable: true },
    check_out_time: { type: 'STRING', nullable: true },
    room_type: { type: 'STRING', nullable: true },
    room_number: {
      type: 'STRING',
      nullable: true,
      description:
        'Actual room number if assigned; otherwise null (do not invent)',
    },
    hotel_address: { type: 'STRING', nullable: true },
    contact_phone: { type: 'STRING', nullable: true },
    contact_email: { type: 'STRING', nullable: true },
    booking_platform: { type: 'STRING', nullable: true },
    city: { type: 'STRING', nullable: true },
    total_paid: {
      type: 'STRING',
      nullable: true,
      description:
        'Final amount paid / total booking amount only (e.g. "12800" or "₹12,800"). Null if unknown.',
    },
    amenities: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        'Included amenities / perks from the PDF (e.g. Free Wi-Fi, Breakfast Included)',
    },
  },
  required: ['is_hotel_booking'],
} as const;

const PDF_EXTRACT_PROMPT = `Extract hotel boarding-pass fields from this PDF.

Return JSON matching the schema.
- Set is_hotel_booking=false if this is a train/bus/flight ticket or unrelated document.
- Do not invent missing values — use null.
- room_number must be null unless an assigned room number appears in the document.
- Prefer dates like "21 May 2026" and times like "02:00 PM".
- amenities: only inclusions explicitly mentioned (Wi-Fi, breakfast, transfer, etc.).
- total_paid: final / total amount paid if shown; do not invent.`;

export type HotelBookingJson = {
  is_hotel_booking?: boolean | null;
  hotelName?: string | null;
  guestName?: string | null;
  bookingId?: string | null;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  roomType?: string | null;
  roomNumber?: string | null;
  numberOfGuests?: number | string | null;
  guestDetails?: string | null;
  hotelAddress?: string | null;
  bookingStatus?: string | null;
  bookingPlatform?: string | null;
  hotelPhone?: string | null;
  hotelEmail?: string | null;
  city?: string | null;
  amenities?: string[] | null;
  totalPaid?: string | null;
  total_paid?: string | null;
  // snake_case aliases from Gemini schema
  hotel_name?: string | null;
  booking_status?: string | null;
  booking_id?: string | null;
  guest_name?: string | null;
  number_of_guests?: string | number | null;
  check_in_date?: string | null;
  check_in_time?: string | null;
  check_out_date?: string | null;
  check_out_time?: string | null;
  room_type?: string | null;
  room_number?: string | null;
  hotel_address?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  booking_platform?: string | null;
  total_paid?: string | null;
};

function clean(value?: string | number | null): string | undefined {
  if (value == null) return undefined;
  const v = String(value).trim();
  if (!v || /^(null|undefined|n\/?a|none|tbd|tba)$/i.test(v)) return undefined;
  if (/to be assigned|assigned at check/i.test(v)) return undefined;
  return v;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Normalize snake_case / camelCase Gemini output into one shape. */
export function normalizeHotelJson(
  raw: HotelBookingJson | Record<string, unknown> | null
): HotelBookingJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as HotelBookingJson;
  const guestDetails =
    clean(r.guestDetails) ||
    clean(r.number_of_guests as string) ||
    clean(r.numberOfGuests as string);

  const amenitiesRaw = r.amenities;
  const amenities = Array.isArray(amenitiesRaw)
    ? amenitiesRaw.map((a) => String(a).trim()).filter(Boolean)
    : [];

  return {
    is_hotel_booking:
      typeof r.is_hotel_booking === 'boolean' ? r.is_hotel_booking : undefined,
    hotelName: clean(r.hotelName) || clean(r.hotel_name),
    guestName: clean(r.guestName) || clean(r.guest_name),
    bookingId: clean(r.bookingId) || clean(r.booking_id),
    checkInDate: clean(r.checkInDate) || clean(r.check_in_date),
    checkInTime: clean(r.checkInTime) || clean(r.check_in_time),
    checkOutDate: clean(r.checkOutDate) || clean(r.check_out_date),
    checkOutTime: clean(r.checkOutTime) || clean(r.check_out_time),
    roomType: clean(r.roomType) || clean(r.room_type),
    roomNumber: clean(r.roomNumber) || clean(r.room_number),
    guestDetails,
    numberOfGuests: r.numberOfGuests ?? r.number_of_guests ?? null,
    hotelAddress: clean(r.hotelAddress) || clean(r.hotel_address),
    bookingStatus: clean(r.bookingStatus) || clean(r.booking_status),
    bookingPlatform: clean(r.bookingPlatform) || clean(r.booking_platform),
    hotelPhone: clean(r.hotelPhone) || clean(r.contact_phone),
    hotelEmail: clean(r.hotelEmail) || clean(r.contact_email),
    city: clean(r.city),
    totalPaid: clean(r.totalPaid) || clean(r.total_paid),
    amenities,
  };
}

function amenitiesToTicket(list?: string[] | null): BusAmenity[] {
  if (!list?.length) return [];
  return list.map((name) => ({ name, available: true }));
}

/** Map Gemini JSON → ParsedTicketDraft for the Hotel Boarding Pass UI. */
export function hotelJsonToDraft(
  bookingIn: HotelBookingJson,
  base?: Partial<ParsedTicketDraft>
): ParsedTicketDraft {
  const booking = normalizeHotelJson(bookingIn) || bookingIn;
  const hotelName = clean(booking.hotelName);
  const guestName = clean(booking.guestName);
  const bookingId = clean(booking.bookingId);
  const city = clean(booking.city);
  const checkInDate = clean(booking.checkInDate);
  const checkInTime = clean(booking.checkInTime);
  const checkOutDate = clean(booking.checkOutDate);
  const checkOutTime = clean(booking.checkOutTime);
  const roomType = clean(booking.roomType);
  const roomNumber = clean(booking.roomNumber);
  const address = clean(booking.hotelAddress);
  const phone = clean(booking.hotelPhone);
  const email = clean(booking.hotelEmail);
  const status = clean(booking.bookingStatus);
  const platform = clean(booking.bookingPlatform);
  const fare = clean(booking.totalPaid);
  const amenities =
    amenitiesToTicket(booking.amenities) || base?.amenities || [];

  const passengers = guestName
    ? [{ name: guestName, status: status || 'Confirmed' }]
    : base?.passengers || [];

  const hasCore = Boolean(hotelName && guestName && bookingId && checkInDate);

  return {
    kind: 'hotel',
    source: base?.source || 'pdf',
    title: hotelName || base?.title || 'Hotel Pass',
    operator: hotelName || NOT_AVAILABLE,
    hotelName,
    hotelAddress: address,
    hotelEmail: email,
    hotelTagline: base?.hotelTagline || 'YOUR STAY, OUR PRIVILEGE.',
    from: city || base?.from || NOT_AVAILABLE,
    to: hotelName || NOT_AVAILABLE,
    departureDate: checkInDate || NOT_AVAILABLE,
    departureTime: checkInTime || NOT_AVAILABLE,
    arrivalDate: checkOutDate || NOT_AVAILABLE,
    arrivalTime: checkOutTime || NOT_AVAILABLE,
    roomType,
    roomNumber: roomNumber || undefined,
    mealPlan: base?.mealPlan,
    starRating: base?.starRating,
    classType: roomType,
    pnr: bookingId,
    bookingId,
    bookingStatus: status,
    bookingPlatform: platform,
    fare: fare || base?.fare,
    operatorContact: phone,
    supportNumber: phone,
    amenities,
    boardingInstructions:
      base?.boardingInstructions ||
      'Show this QR at the hotel front desk. Present a valid ID proof at check-in.',
    passengers,
    originalPdfUri: base?.originalPdfUri,
    hotelPhotoUri: base?.hotelPhotoUri,
    rawText: base?.rawText,
    extractionMethod: base?.extractionMethod || 'ocr',
    extractionNote: [
      'Gemini PDF structured extract',
      clean(booking.guestDetails)
        ? `Guests: ${clean(booking.guestDetails)}`
        : undefined,
      roomNumber ? undefined : ROOM_PENDING,
    ]
      .filter(Boolean)
      .join(' · '),
    confidence: hasCore ? 0.95 : 0.55,
    needsManualCompletion: !hasCore,
  };
}

function geminiRequestBody(parts: unknown[]) {
  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: HOTEL_PASS_RESPONSE_SCHEMA,
    },
  };
}

/** REST JSON uses camelCase (inlineData), not proto snake_case. */
function pdfPart(pdfBase64: string, fileName?: string) {
  return [
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64,
      },
    },
    {
      text: `${PDF_EXTRACT_PROMPT}${fileName ? `\nFile name: ${fileName}` : ''}`,
    },
  ];
}

async function callGeminiGenerate(
  parts: unknown[]
): Promise<HotelBookingJson | null> {
  const apiKey = builtinGeminiApiKey();
  if (!apiKey) {
    pdfLog('gemini: no API key');
    return null;
  }
  const models = [
    builtinGeminiModel(),
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = '';
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try {
      pdfLog('gemini call', model);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify(geminiRequestBody(parts)),
      });
      const json = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        lastError = json.error?.message || `HTTP ${res.status}`;
        pdfLog('gemini model miss', { model, lastError });
        continue;
      }
      const raw =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('') || '';
      const booking = normalizeHotelJson(extractJsonObject(raw));
      if (booking) return booking;
      lastError = 'empty JSON';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      pdfLogError(`gemini ${model}`, err);
    }
  }
  pdfLog('gemini all models failed', lastError);
  return null;
}

/**
 * Primary path: send the PDF bytes to Gemini (multimodal) with JSON schema.
 * Gemini reads the document; the app only renders the Hotel Boarding Pass UI.
 */
export async function extractHotelFromPdfBase64(
  pdfBase64: string,
  fileName?: string
): Promise<HotelBookingJson | null> {
  if (!pdfBase64 || pdfBase64.length < 80) return null;
  if (pdfBase64.length > 20_000_000) {
    pdfLog('pdf too large for gemini', pdfBase64.length);
    return null;
  }

  const parts = pdfPart(pdfBase64, fileName);

  // Direct Gemini first for PDFs — proxy often lacks the route / rejects large bodies
  try {
    pdfLog('gemini PDF direct', { bytes: pdfBase64.length, fileName });
    const booking = await callGeminiGenerate(parts);
    if (booking) {
      pdfLog('gemini PDF booking', {
        isHotel: booking.is_hotel_booking,
        hotelName: booking.hotelName,
        bookingId: booking.bookingId,
        checkIn: booking.checkInDate,
        amenities: booking.amenities?.length,
      });
      return booking;
    }
  } catch (err) {
    pdfLogError('gemini PDF direct', err);
  }

  // Proxy fallback (when Railway has GEMINI_API_KEY + /hotel-booking/extract)
  try {
    pdfLog('gemini PDF via proxy');
    const res = await proxyFetch('/hotel-booking/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfBase64,
        fileName,
        mimeType: 'application/pdf',
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      booking?: HotelBookingJson;
      error?: { message?: string };
    };
    if (res.ok && json.success && json.booking) {
      const booking = normalizeHotelJson(json.booking);
      pdfLog('gemini PDF proxy booking', {
        isHotel: booking?.is_hotel_booking,
        hotelName: booking?.hotelName,
        bookingId: booking?.bookingId,
      });
      return booking;
    }
    pdfLog('gemini PDF proxy miss', json.error?.message || res.status);
  } catch (err) {
    pdfLogError('gemini PDF proxy', err);
  }

  return null;
}

/** Text-only fallback when PDF multimodal is unavailable. */
export async function extractHotelBookingWithAi(
  text: string
): Promise<HotelBookingJson | null> {
  const trimmed = text.trim();
  if (trimmed.length < 40) return null;

  try {
    pdfLog('gemini text via proxy');
    const res = await proxyFetch('/hotel-booking/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed.slice(0, 12000) }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      booking?: HotelBookingJson;
      error?: { message?: string };
    };
    if (res.ok && json.success && json.booking) {
      return normalizeHotelJson(json.booking);
    }
  } catch (err) {
    pdfLogError('gemini text proxy', err);
  }

  try {
    return await callGeminiGenerate([
      { text: `${PDF_EXTRACT_PROMPT}\n\nDocument text:\n${trimmed.slice(0, 12000)}` },
    ]);
  } catch (err) {
    pdfLogError('gemini text direct', err);
    return null;
  }
}

export function isHotelGeminiHit(booking: HotelBookingJson | null): boolean {
  if (!booking) return false;

  const hasHotelSignals = Boolean(
    booking.hotelName ||
      booking.checkInDate ||
      booking.roomType ||
      booking.hotelAddress ||
      (booking.amenities && booking.amenities.length > 0)
  );

  // Explicit non-hotel only when there are ZERO hotel field signals
  if (booking.is_hotel_booking === false && !hasHotelSignals) return false;

  if (booking.is_hotel_booking === true) return hasHotelSignals || Boolean(booking.bookingId);

  // Flag missing / null — trust hotel fields
  return hasHotelSignals || Boolean(booking.hotelName && booking.guestName);
}

/** Merge AI fields over regex draft — prefer Gemini values. */
export function mergeHotelDraft(
  regexDraft: ParsedTicketDraft,
  ai: HotelBookingJson
): ParsedTicketDraft {
  const fromAi = hotelJsonToDraft(ai, regexDraft);
  const pick = (aiVal?: string, regexVal?: string) =>
    clean(aiVal) || clean(regexVal) || undefined;

  const hotelName = pick(fromAi.hotelName, regexDraft.hotelName);
  const bookingId = pick(fromAi.bookingId, regexDraft.bookingId || regexDraft.pnr);
  const guest = pick(fromAi.passengers[0]?.name, regexDraft.passengers[0]?.name);
  const amenities =
    fromAi.amenities?.length ? fromAi.amenities : regexDraft.amenities || [];

  return {
    ...regexDraft,
    ...fromAi,
    hotelName,
    operator: hotelName || regexDraft.operator,
    title: hotelName || regexDraft.title,
    to: hotelName || regexDraft.to,
    from:
      pick(fromAi.from, regexDraft.from) ||
      (regexDraft.from !== NOT_AVAILABLE ? regexDraft.from : NOT_AVAILABLE),
    departureDate:
      pick(fromAi.departureDate, regexDraft.departureDate) || NOT_AVAILABLE,
    departureTime:
      pick(fromAi.departureTime, regexDraft.departureTime) || NOT_AVAILABLE,
    arrivalDate:
      pick(fromAi.arrivalDate, regexDraft.arrivalDate) || NOT_AVAILABLE,
    arrivalTime:
      pick(fromAi.arrivalTime, regexDraft.arrivalTime) || NOT_AVAILABLE,
    roomType: pick(fromAi.roomType, regexDraft.roomType),
    roomNumber: pick(fromAi.roomNumber, regexDraft.roomNumber),
    hotelAddress: pick(fromAi.hotelAddress, regexDraft.hotelAddress),
    hotelEmail: pick(fromAi.hotelEmail, regexDraft.hotelEmail),
    bookingPlatform: pick(fromAi.bookingPlatform, regexDraft.bookingPlatform),
    bookingStatus: pick(fromAi.bookingStatus, regexDraft.bookingStatus),
    fare: pick(fromAi.fare, regexDraft.fare),
    operatorContact: pick(fromAi.operatorContact, regexDraft.operatorContact),
    supportNumber: pick(fromAi.supportNumber, regexDraft.supportNumber),
    amenities,
    pnr: bookingId,
    bookingId,
    passengers: guest
      ? [{ name: guest, status: fromAi.bookingStatus || 'Confirmed' }]
      : regexDraft.passengers,
    confidence: Math.max(regexDraft.confidence || 0, fromAi.confidence || 0),
    needsManualCompletion:
      !hotelName ||
      !bookingId ||
      !guest ||
      !pick(fromAi.departureDate, regexDraft.departureDate),
    extractionNote: fromAi.extractionNote || regexDraft.extractionNote,
  };
}
