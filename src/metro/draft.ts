import {
  formatTravelTime,
  getMetroNetwork,
  getStation,
  planMetroRoute,
} from './router';
import { isMetroNetworkId } from './locateCity';
import { MetroNetworkId, MetroStation } from './types';
import { ParsedTicketDraft } from '../types/ticket';

export function buildMetroDraft(input: {
  from: MetroStation;
  to: MetroStation;
  networkId?: MetroNetworkId;
  qrPayload?: string;
  passengerName?: string;
  departureDate?: string;
  departureTime?: string;
  validUntil?: string;
  ticketId?: string;
}): ParsedTicketDraft {
  const networkId =
    input.networkId && isMetroNetworkId(input.networkId)
      ? input.networkId
      : 'blr';
  const network = getMetroNetwork(networkId);
  const route = planMetroRoute(input.from.id, input.to.id, networkId);
  const fromLabel = input.from.shortName || input.from.name;
  const toLabel = input.to.shortName || input.to.name;
  const lines = route?.legs.map((l) => l.lineName).join(' → ') || 'Metro';
  const travelTime = route
    ? formatTravelTime(route.estimatedMinutes)
    : undefined;
  const today = new Date();
  const dateLabel =
    input.departureDate ||
    today.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const officialQr = Boolean(
    input.qrPayload?.trim() && !/^travelid:\/\//i.test(input.qrPayload.trim())
  );

  return {
    kind: 'metro',
    source: officialQr ? 'qr' : 'manual',
    extractionMethod: officialQr ? 'qr' : 'manual',
    extractionNote: route
      ? `${route.stopCount} stops · ${lines}${
          officialQr ? ' · official QR saved' : ' · add official QR for gate'
        }`
      : `${network.name} route`,
    title: `${fromLabel} → ${toLabel}`,
    operator: network.operator,
    bookingPlatform: network.name,
    bookingStatus: 'Valid',
    bookingId: input.ticketId,
    metroNetworkId: networkId,
    metroFromStationId: input.from.id,
    metroToStationId: input.to.id,
    metroValidUntil: input.validUntil,
    metroHasOfficialQr: officialQr,
    from: fromLabel,
    fromCode: input.from.id,
    to: toLabel,
    toCode: input.to.id,
    boardingPoint: input.from.name,
    droppingPoint: input.to.name,
    departureDate: dateLabel,
    departureTime: input.departureTime || '--:--',
    travelTime,
    classType: lines,
    passengers: [
      {
        name: input.passengerName || 'Commuter',
        status: 'Valid',
      },
    ],
    originalQrValue: officialQr ? input.qrPayload : undefined,
    qrPayload: officialQr ? input.qrPayload : undefined,
    confidence: 0.95,
    needsManualCompletion: !officialQr,
  };
}

export function buildMetroQrImportDraft(input: {
  qrPayload: string;
  networkId?: MetroNetworkId;
}): ParsedTicketDraft {
  const networkId =
    input.networkId && isMetroNetworkId(input.networkId)
      ? input.networkId
      : 'blr';
  const network = getMetroNetwork(networkId);
  const today = new Date();
  return {
    kind: 'metro',
    source: 'qr',
    extractionMethod: 'qr',
    extractionNote:
      'Official metro QR saved. Select From and To — encrypted tickets do not expose stations.',
    title: 'Metro Live Pass',
    operator: network.operator,
    bookingPlatform: network.name,
    bookingStatus: 'Valid',
    metroNetworkId: networkId,
    metroHasOfficialQr: true,
    from: 'Origin',
    to: 'Destination',
    departureDate: today.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    departureTime: '--:--',
    passengers: [{ name: 'Commuter', status: 'Valid' }],
    originalQrValue: input.qrPayload,
    qrPayload: input.qrPayload,
    confidence: 0.7,
    needsManualCompletion: true,
  };
}

export function stationLabel(
  networkId: MetroNetworkId,
  stationId?: string
): string {
  if (!stationId) return '';
  const s = getStation(networkId, stationId);
  return s?.shortName || s?.name || stationId;
}
