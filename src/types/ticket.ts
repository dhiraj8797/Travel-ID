export type TicketKind = 'rail' | 'bus' | 'flight' | 'hotel' | 'metro';

export type TicketSource = 'pdf' | 'qr' | 'demo' | 'manual';

export type ExtractionMethod = 'embedded-text' | 'ocr' | 'qr' | 'manual' | 'demo';

export type Passenger = {
  name: string;
  age?: string;
  gender?: string;
  seat?: string;
  seatType?: string;
  deck?: string;
  berth?: string;
  coach?: string;
  status?: string;
  currentStatus?: string;
  fareType?: string;
  specialAssistance?: string;
};

export type BusAmenity = {
  name: string;
  available: boolean;
};

/** Original airline / operator boarding barcode (IATA BCBP etc.). */
export type BoardingCodeType = 'PDF417' | 'QR' | 'AZTEC' | 'DATAMATRIX' | 'UNKNOWN';

export type BoardingCode = {
  /** Symbology from the scanner / document */
  type: BoardingCodeType;
  /** Decoded payload (e.g. M1… BCBP). Prefer this for gate-compatible re-render. */
  rawValue?: string;
  /** Optional saved image of the original barcode region */
  imageUri?: string;
  /** Optional format / BCBP version hint */
  formatVersion?: string;
};

export type Ticket = {
  id: string;
  kind: TicketKind;
  source: TicketSource;
  extractionMethod?: ExtractionMethod;
  title: string;
  /** Operator or railway / airline / hotel chain name */
  operator: string;
  /** Booking platform e.g. Scapia, RedBus, IRCTC, Booking.com */
  bookingPlatform?: string;
  bookingStatus?: string;
  pnr?: string;
  bookingId?: string;
  bookingDate?: string;
  trainNumber?: string;
  trainName?: string;
  busNumber?: string;
  busRegistration?: string;
  serviceName?: string;
  vehicleType?: string;
  seatingConfiguration?: string;
  flightNumber?: string;
  /** IATA airline code e.g. 6E, AI — used for Cirium */
  airlineCode?: string;
  /** Departure terminal (flight) */
  terminal?: string;
  /** Arrival terminal (flight) */
  arrivalTerminal?: string;
  /** Live / last-known flight status from Cirium */
  flightStatus?: string;
  /** Delay in minutes (departure), if any */
  delayMinutes?: number;
  estimatedDeparture?: string;
  estimatedArrival?: string;
  /** Cirium flightStatus.flightId for follow-up polls */
  ciriumFlightId?: string;
  /** ISO timestamp of last Cirium refresh */
  lastStatusAt?: string;
  /** Hotel property name (hotel passes) */
  hotelName?: string;
  /** Full hotel street address */
  hotelAddress?: string;
  /** Room category e.g. Deluxe Twin */
  roomType?: string;
  /** Assigned room number if known */
  roomNumber?: string;
  /** Meal plan e.g. CP, MAP, EP */
  mealPlan?: string;
  /** Star rating label e.g. 4★ */
  starRating?: string;
  /** Hotel contact email */
  hotelEmail?: string;
  /** Short hotel tagline for pass hero */
  hotelTagline?: string;
  /** Optional hotel property photo URI for pass navbar / hero */
  hotelPhotoUri?: string;
  /** Metro network id e.g. blr (Namma Metro) */
  metroNetworkId?: string;
  /** Embedded metro station ids for offline routing */
  metroFromStationId?: string;
  metroToStationId?: string;
  /** Ticket validity end (ISO or display string) when known */
  metroValidUntil?: string;
  /** True when originalQrValue is an operator/AFC gate QR (not Travel ID) */
  metroHasOfficialQr?: boolean;
  from: string;
  fromCode?: string;
  to: string;
  toCode?: string;
  boardingPoint?: string;
  boardingLandmark?: string;
  boardingAddress?: string;
  droppingPoint?: string;
  droppingLandmark?: string;
  droppingAddress?: string;
  /** Check-in date (hotel) or departure date (transport) */
  departureDate: string;
  /** Check-in time (hotel) or departure time (transport) */
  departureTime: string;
  /** Arrive-early reporting time for bus boarding */
  reportingTime?: string;
  /** Check-out date (hotel) or arrival date (transport) */
  arrivalDate?: string;
  /** Check-out time (hotel) or arrival time (transport) */
  arrivalTime?: string;
  platform?: string;
  gate?: string;
  classType?: string;
  quota?: string;
  distance?: string;
  travelTime?: string;
  passengers: Passenger[];
  fare?: string;
  amenities?: BusAmenity[];
  operatorContact?: string;
  supportNumber?: string;
  trackingUrl?: string;
  boardingInstructions?: string;
  qrPayload?: string;
  /** Original QR raw value from scan (may be encrypted / URL / JSON). */
  originalQrValue?: string;
  /**
   * Airline-issued boarding barcode. Do not replace with a newly generated
   * Travel ID code — airport scanners expect this exact payload + symbology.
   */
  boardingCode?: BoardingCode;
  /** Local file URI of copied PDF for official presentation. */
  originalPdfUri?: string;
  rawText?: string;
  /**
   * User/import marked this trip as finished (old boarding pass archive).
   * Forces Past / completed UI and skips live tracking.
   */
  journeyCompleted?: boolean;
  createdAt: string;
};

export type ParsedTicketDraft = Omit<Ticket, 'id' | 'createdAt'> & {
  confidence: number;
  needsManualCompletion?: boolean;
  extractionNote?: string;
};

export type TicketType =
  | 'BUS'
  | 'TRAIN'
  | 'FLIGHT'
  | 'HOTEL'
  | 'METRO'
  | 'UNKNOWN';
