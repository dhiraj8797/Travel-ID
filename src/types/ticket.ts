export type TicketKind = 'rail' | 'bus' | 'flight';

export type TicketSource = 'pdf' | 'qr' | 'demo' | 'manual' | 'email';

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
  /** Operator or railway / airline name */
  operator: string;
  /** Booking platform e.g. Scapia, RedBus, IRCTC */
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
  departureDate: string;
  departureTime: string;
  /** Arrive-early reporting time for bus boarding */
  reportingTime?: string;
  arrivalDate?: string;
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
  createdAt: string;
};

export type ParsedTicketDraft = Omit<Ticket, 'id' | 'createdAt'> & {
  confidence: number;
  needsManualCompletion?: boolean;
  extractionNote?: string;
};

export type TicketType = 'BUS' | 'TRAIN' | 'FLIGHT' | 'UNKNOWN';
