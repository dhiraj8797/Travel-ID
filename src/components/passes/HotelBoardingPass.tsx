import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BusAmenity, Ticket } from '../../types/ticket';
import { useTickets } from '../../context/TicketContext';
import { buildHotelPassQr } from '../../utils/ticketFormat';
import { getPassPhase } from '../../utils/passTime';
import {
  NOT_AVAILABLE,
  ROOM_PENDING,
  isPlaceholderHotelValue,
} from '../../parsers/hotelDetect';
import { googleMapsSearchUrl } from '../../services/mapsGeocode';
import { useSecureScreen } from '../../hooks/useSecureScreen';

const Orange = '#FF6500';
const OrangeDeep = '#E65100';
const Ink = '#1A1A1A';
const Muted = '#8A8A8A';
const LabelOrange = '#FF8A3D';
const CardBg = '#F7F7F7';

/** 10 curated room photos — one is picked per booking for hero + navbar. */
const HOTEL_ROOM_IMAGES = [
  require('../../../assets/scenes/hotel-rooms/hotel-room-01.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-02.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-03.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-04.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-05.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-06.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-07.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-08.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-09.jpg'),
  require('../../../assets/scenes/hotel-rooms/hotel-room-10.jpg'),
];

const DEFAULT_FOOTER_AMENITIES: BusAmenity[] = [
  { name: 'Free Wi-Fi', available: true },
  { name: 'Breakfast Included', available: true },
  { name: '24x7 Front Desk', available: true },
  { name: 'Secure Stay', available: true },
  { name: 'Airport Transfer', available: true },
];

type Props = {
  ticket: Ticket;
  onBack?: () => void;
  onMenu?: () => void;
  embedded?: boolean;
};

type AmenityIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function displayValue(value?: string | null, fallback = NOT_AVAILABLE): string {
  if (isPlaceholderHotelValue(value)) return fallback;
  return String(value).trim();
}

function amenityIcon(name: string): AmenityIcon {
  const n = name.toLowerCase();
  if (/wi[\-\s]?fi|internet|wireless/.test(n)) return 'wifi';
  if (/breakfast|meal|food|dining/.test(n)) return 'room-service-outline';
  if (/front\s*desk|24|reception/.test(n)) return 'bell-ring-outline';
  if (/secure|safe|cctv|security/.test(n)) return 'shield-check-outline';
  if (/airport|transfer|cab|taxi/.test(n)) return 'car-outline';
  if (/park/.test(n)) return 'parking';
  if (/pool|swim/.test(n)) return 'pool';
  if (/gym|fitness/.test(n)) return 'dumbbell';
  if (/\bac\b|air/.test(n)) return 'air-conditioner';
  if (/laundry/.test(n)) return 'washing-machine';
  if (/power|generator/.test(n)) return 'flash';
  if (/room\s*service/.test(n)) return 'room-service';
  return 'check-circle-outline';
}

function digitTel(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : cleaned.replace(/^0/, '');
}

function mergeAmenities(ticket: Ticket): BusAmenity[] {
  const fromTicket = (ticket.amenities || []).filter((a) => a.available !== false);
  if (fromTicket.length) return fromTicket;
  return DEFAULT_FOOTER_AMENITIES;
}

/** Stable room image index from ticket id / booking id. */
function pickRoomImage(ticket: Ticket) {
  const seed = `${ticket.id || ''}${ticket.bookingId || ticket.pnr || ''}${ticket.hotelName || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return HOTEL_ROOM_IMAGES[hash % HOTEL_ROOM_IMAGES.length];
}

function resolveHotelPhoto(ticket: Ticket) {
  const uri = (ticket.hotelPhotoUri || '').trim();
  if (uri && /\.(jpe?g|png|webp|heic)$/i.test(uri)) {
    return { uri };
  }
  if (uri && !/\.pdf$/i.test(uri) && /^(file|content|https?):/i.test(uri)) {
    return { uri };
  }
  return pickRoomImage(ticket);
}

/** Primary guest + "+1 +2 +3" for additional guests. */
function formatGuestLabel(passengers: Ticket['passengers']): string {
  const names = (passengers || [])
    .map((g) => g.name?.trim())
    .filter((n): n is string => Boolean(n) && !isPlaceholderHotelValue(n));
  if (!names.length) return NOT_AVAILABLE;
  const primary = names[0];
  const extraCount = Math.max(0, (passengers?.length || names.length) - 1);
  if (extraCount <= 0) return primary;
  const badges = Array.from({ length: Math.min(extraCount, 9) }, (_, i) => `+${i + 1}`);
  return `${primary}  ${badges.join(' ')}`;
}

/**
 * Hotel boarding pass — navbar title is "Hotel Boarding Pass";
 * booking ID has no mini-QR; amenities live in the footer.
 */
export function HotelBoardingPass({ ticket, onBack, onMenu, embedded }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { updateTicket } = useTickets();
  const contentWidth = Math.min(width - 16, 420);
  const phase = getPassPhase(ticket);
  useSecureScreen(true);

  const guests = ticket.passengers?.length ? ticket.passengers : [];
  const guestName = formatGuestLabel(guests);
  const guestCountLabel =
    guests.length > 0
      ? `${guests.length} Adult${guests.length === 1 ? '' : 's'}`
      : NOT_AVAILABLE;
  const bookingId = displayValue(ticket.bookingId || ticket.pnr);
  const bookedThrough = displayValue(ticket.bookingPlatform);
  const qr = buildHotelPassQr(ticket);
  const hotelNameDisplay = displayValue(
    ticket.hotelName || ticket.to || ticket.title || ticket.operator,
    'Hotel'
  );
  const hotelName = hotelNameDisplay.toUpperCase();
  const city = displayValue(ticket.from, '');
  const address =
    displayValue(ticket.hotelAddress || ticket.boardingAddress, '') ||
    [ticket.hotelName || ticket.to, city].filter((x) => !isPlaceholderHotelValue(x)).join(', ');
  const roomType = displayValue(ticket.roomType || ticket.classType);
  const storedRoom = (
    ticket.roomNumber ||
    guests.find((g) => g.seat)?.seat ||
    ''
  ).trim();
  const roomAssigned = Boolean(storedRoom);
  const roomNo = roomAssigned ? storedRoom : ROOM_PENDING;
  const canEditRoom = !embedded;
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomDraft, setRoomDraft] = useState(storedRoom);
  const [roomSaving, setRoomSaving] = useState(false);
  const stars = ticket.starRating || '';
  const tagline = ticket.hotelTagline || 'YOUR STAY, OUR PRIVILEGE.';
  const phone = ticket.operatorContact || ticket.supportNumber || '';
  const email = ticket.hotelEmail || '';
  const status = displayValue(ticket.bookingStatus, 'Confirmed').toUpperCase();
  const amenities = mergeAmenities(ticket);
  const hotelPhoto = resolveHotelPhoto(ticket);

  const checkInDate = displayValue(ticket.departureDate);
  const checkInTime = displayValue(ticket.departureTime);
  const checkOutDate = displayValue(ticket.arrivalDate);
  const checkOutTime = displayValue(ticket.arrivalTime);

  const mapsUrl = useMemo(() => {
    const q = address || [hotelName, city].filter(Boolean).join(', ');
    if (!q) return null;
    return googleMapsSearchUrl(q);
  }, [address, hotelName, city]);

  const openMaps = () => {
    if (mapsUrl) void Linking.openURL(mapsUrl);
  };
  const openCall = () => {
    if (phone) void Linking.openURL(`tel:${digitTel(phone)}`);
  };
  const openEmail = () => {
    if (email) void Linking.openURL(`mailto:${email.trim()}`);
  };

  const openRoomEditor = useCallback(() => {
    if (!canEditRoom) return;
    setRoomDraft(storedRoom);
    setRoomModalOpen(true);
  }, [canEditRoom, storedRoom]);

  const saveRoomNumber = useCallback(
    async (nextRoom: string) => {
      const cleaned = nextRoom.trim().replace(/\s+/g, ' ');
      setRoomSaving(true);
      try {
        const passengers = (ticket.passengers || []).map((p, i) =>
          i === 0
            ? { ...p, seat: cleaned || undefined }
            : p
        );
        await updateTicket({
          ...ticket,
          roomNumber: cleaned || undefined,
          passengers,
        });
        setRoomModalOpen(false);
      } finally {
        setRoomSaving(false);
      }
    },
    [ticket, updateTicket]
  );

  const topBar = !embedded ? (
    <View style={{ width: contentWidth, marginBottom: 8 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.topBarCenter}>
          <Image source={hotelPhoto} style={styles.topBarThumb} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.topTitle} numberOfLines={1}>
              Hotel Boarding Pass
            </Text>
            <Text style={styles.topSubtitle} numberOfLines={1}>
              {hotelNameDisplay}
            </Text>
          </View>
        </View>
        <Pressable onPress={onMenu} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  ) : null;

  const passBody = (
    <View style={[styles.passCard, { width: contentWidth }]}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[OrangeDeep, Orange, '#FF8A3D']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.heroBrand}
        >
          <MaterialCommunityIcons name="flower-tulip" size={28} color="#fff" />
          <Text style={styles.heroName} numberOfLines={3}>
            {hotelName}
          </Text>
          <Text style={styles.heroStars}>{stars}</Text>
          <Text style={styles.heroTag} numberOfLines={2}>
            {tagline}
          </Text>
        </LinearGradient>
        <ImageBackground
          source={hotelPhoto}
          style={styles.heroImage}
          imageStyle={styles.heroImageInner}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)']}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>
      </View>

      <View style={styles.body}>
        <View style={styles.row}>
          <Detail icon="account" label="GUEST NAME" value={guestName} flex={1.15} />
          <Detail icon="identifier" label="BOOKING ID" value={bookingId} flex={1} />
        </View>

        <View style={styles.divider} />

        <Detail
          icon="storefront-outline"
          label="BOOKING THROUGH"
          value={bookedThrough}
        />

        <View style={styles.divider} />

        <View style={styles.row}>
          <Detail icon="calendar" label="CHECK-IN DATE" value={checkInDate} />
          <Detail icon="clock-outline" label="CHECK-IN TIME" value={checkInTime} />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Detail icon="calendar" label="CHECK-OUT DATE" value={checkOutDate} />
          <Detail icon="clock-outline" label="CHECK-OUT TIME" value={checkOutTime} />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Detail icon="bed" label="ROOM TYPE" value={roomType} />
          <Detail icon="account-group" label="NO. OF GUESTS" value={guestCountLabel} />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Pressable
            onPress={openRoomEditor}
            disabled={!canEditRoom}
            style={({ pressed }) => [
              styles.detail,
              { flex: 1 },
              canEditRoom && pressed && { opacity: 0.85 },
            ]}
          >
            <MaterialCommunityIcons name="door" size={18} color={Orange} />
            <View style={{ flex: 1 }}>
              <View style={styles.roomLabelRow}>
                <Text style={styles.fieldLabel}>ROOM NUMBER</Text>
                {canEditRoom ? (
                  <View style={styles.roomEditChip}>
                    <Ionicons
                      name={roomAssigned ? 'create-outline' : 'add-circle-outline'}
                      size={12}
                      color={Orange}
                    />
                    <Text style={styles.roomEditChipText}>
                      {roomAssigned ? 'Edit' : 'Add'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.fieldValue,
                  !roomAssigned && styles.roomPendingValue,
                ]}
                numberOfLines={2}
              >
                {roomNo}
              </Text>
              {canEditRoom || !roomAssigned ? (
                <Text style={styles.hint}>
                  {roomAssigned
                    ? 'Tap to edit room number'
                    : canEditRoom
                      ? 'Tap to add your room after check-in'
                      : "We'll update it after you check in"}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Detail
            icon="target"
            label="STATUS"
            value={status}
            valueColor={Orange}
            hint={
              phase === 'past'
                ? 'Stay completed'
                : phase === 'ongoing'
                  ? 'Checked in'
                  : 'Your booking is confirmed'
            }
          />
        </View>

        <View style={styles.divider} />

        <Pressable
          onPress={openMaps}
          disabled={!mapsUrl}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color={Orange} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>HOTEL ADDRESS</Text>
            <Text style={[styles.fieldValue, styles.linkText]} numberOfLines={4}>
              {address || 'Address not found — tap to search on Maps'}
            </Text>
            <Text style={styles.linkHint}>Open in Google Maps</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={Orange} />
        </Pressable>

        <View style={styles.divider} />

        <View style={styles.contactRow}>
          <MaterialCommunityIcons name="phone" size={20} color={Orange} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldLabel}>HOTEL CONTACT DETAILS</Text>
            {phone ? (
              <Pressable onPress={openCall} hitSlop={6}>
                <Text style={[styles.fieldValue, styles.linkText]}>{phone}</Text>
              </Pressable>
            ) : (
              <Text style={styles.fieldValue}>Phone not found on booking</Text>
            )}
            {email ? (
              <Pressable onPress={openEmail} hitSlop={6}>
                <Text style={[styles.fieldValue, styles.linkText, { fontSize: 13 }]}>
                  {email}
                </Text>
              </Pressable>
            ) : null}
            {phone ? <Text style={styles.linkHint}>Tap number to call</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.notchRow} pointerEvents="none">
        <View style={styles.notch} />
        <View style={styles.dashRow}>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
        <View style={[styles.notch, styles.notchRight]} />
      </View>

      <View style={styles.qrSection}>
        <Text style={styles.qrSectionTitle}>CHECK-IN QR CODE</Text>
        <View style={styles.qrFrame}>
          <QRCode
            value={qr || bookingId}
            size={168}
            backgroundColor="#fff"
            color="#111"
            ecl="M"
          />
        </View>
        <Text style={styles.qrHint}>Show this QR code at the hotel front desk</Text>
        <Text style={styles.qrHintOrange}>Present a valid ID proof at check-in</Text>
      </View>

      <View style={styles.amenitiesFooter}>
        <Text style={styles.amenitiesFooterTitle}>ALL AMENITIES</Text>
        <View style={styles.amenitiesGrid}>
          {amenities.map((a) => (
            <View key={`f-${a.name}`} style={styles.amenityCell}>
              <MaterialCommunityIcons
                name={amenityIcon(a.name)}
                size={20}
                color={Orange}
              />
              <Text style={styles.amenityLabel} numberOfLines={2}>
                {a.name.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <LinearGradient
        colors={[Orange, OrangeDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.thanks}
      >
        <Text style={styles.thanksTitle}>Thank you!</Text>
        <Text style={styles.thanksBody}>We wish you a pleasant stay.</Text>
      </LinearGradient>
    </View>
  );

  const roomEditor = (
    <Modal
      visible={roomModalOpen}
      transparent
      animationType="fade"
      onRequestClose={() => !roomSaving && setRoomModalOpen(false)}
    >
      <View style={styles.roomBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => !roomSaving && setRoomModalOpen(false)}
        />
        <View style={styles.roomCard}>
          <View style={styles.roomIconWrap}>
            <MaterialCommunityIcons name="door" size={26} color={Orange} />
          </View>
          <Text style={styles.roomModalTitle}>
            {roomAssigned ? 'Edit room number' : 'Add room number'}
          </Text>
          <Text style={styles.roomModalBody}>
            Enter the room assigned at check-in. You can change it anytime.
          </Text>
          <TextInput
            value={roomDraft}
            onChangeText={setRoomDraft}
            placeholder="e.g. 1204 / 5A"
            placeholderTextColor={Muted}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={24}
            editable={!roomSaving}
            style={styles.roomInput}
            returnKeyType="done"
            onSubmitEditing={() => void saveRoomNumber(roomDraft)}
          />
          <Pressable
            style={[styles.roomPrimary, roomSaving && { opacity: 0.7 }]}
            disabled={roomSaving}
            onPress={() => void saveRoomNumber(roomDraft)}
          >
            {roomSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.roomPrimaryText}>Save room</Text>
            )}
          </Pressable>
          {roomAssigned ? (
            <Pressable
              style={styles.roomDanger}
              disabled={roomSaving}
              onPress={() => void saveRoomNumber('')}
            >
              <Text style={styles.roomDangerText}>Clear room number</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.roomSecondary}
            disabled={roomSaving}
            onPress={() => setRoomModalOpen(false)}
          >
            <Text style={styles.roomSecondaryText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (embedded) {
    return (
      <View style={styles.embeddedWrap}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {passBody}
        </ScrollView>
        {roomEditor}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: 4 }]}>
        {topBar}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {passBody}
        </ScrollView>
      </View>
      {roomEditor}
    </View>
  );
}

function Detail({
  icon,
  label,
  value,
  hint,
  valueColor,
  flex = 1,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
  flex?: number;
}) {
  return (
    <View style={[styles.detail, { flex }]}>
      <MaterialCommunityIcons name={icon} size={18} color={Orange} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text
          style={[styles.fieldValue, valueColor ? { color: valueColor } : null]}
          numberOfLines={3}
        >
          {value}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF8F3' },
  embeddedWrap: { alignItems: 'center', maxHeight: 700 },
  content: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  scroll: { flex: 1, width: '100%' },
  scrollContent: { alignItems: 'center', flexGrow: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Orange,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 4,
  },
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  topBarThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  topTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  topSubtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  amenityNav: {
    backgroundColor: OrangeDeep,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    maxHeight: 42,
  },
  amenityNavContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  amenityChipText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    color: '#fff',
    maxWidth: 120,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,101,0,0.18)',
  },
  hero: { flexDirection: 'row', height: 148 },
  heroBrand: {
    flex: 1.05,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 4,
  },
  heroName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#fff',
    lineHeight: 17,
    letterSpacing: 0.3,
  },
  heroStars: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: '#FFE082',
    letterSpacing: 1,
  },
  heroTag: {
    marginTop: 2,
    fontFamily: 'DMSans_500Medium',
    fontSize: 9,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.6,
  },
  heroImage: { flex: 1 },
  heroImageInner: {},
  body: {
    backgroundColor: CardBg,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bookingBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  miniQr: {
    padding: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,101,0,0.25)',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  roomLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 2,
  },
  roomEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,101,0,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roomEditChipText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 9,
    color: Orange,
    letterSpacing: 0.3,
  },
  roomPendingValue: {
    color: Muted,
    fontStyle: 'italic',
  },
  roomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,16,31,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  roomCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,101,0,0.2)',
    zIndex: 2,
  },
  roomIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,101,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  roomModalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: Ink,
    textAlign: 'center',
  },
  roomModalBody: {
    marginTop: 6,
    marginBottom: 14,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: Muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  roomInput: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,101,0,0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: Ink,
    textAlign: 'center',
    letterSpacing: 1,
    backgroundColor: '#FFF8F3',
  },
  roomPrimary: {
    marginTop: 14,
    backgroundColor: Orange,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  roomPrimaryText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  roomDanger: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  roomDangerText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: '#C62828',
  },
  roomSecondary: {
    marginTop: 2,
    paddingVertical: 10,
    alignItems: 'center',
  },
  roomSecondaryText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: Muted,
  },
  fieldLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: LabelOrange,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fieldValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: Ink,
    lineHeight: 18,
  },
  hint: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 10,
    color: Muted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingBottom: 8,
  },
  linkText: {
    color: OrangeDeep,
    textDecorationLine: 'underline',
  },
  linkHint: {
    marginTop: 3,
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: Orange,
  },
  notchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CardBg,
  },
  notch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF8F3',
    marginLeft: -9,
  },
  notchRight: { marginLeft: 0, marginRight: -9 },
  dashRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dash: {
    width: 5,
    height: 1.5,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  qrSection: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  qrSectionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: LabelOrange,
    letterSpacing: 1,
    marginBottom: 10,
  },
  qrFrame: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  qrHint: {
    marginTop: 12,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: Ink,
    textAlign: 'center',
  },
  qrHintOrange: {
    marginTop: 4,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: Orange,
    textAlign: 'center',
  },
  amenitiesFooter: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  amenitiesFooterTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    color: LabelOrange,
    letterSpacing: 0.8,
    marginBottom: 10,
    textAlign: 'center',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  amenityCell: {
    width: '30%',
    minWidth: 90,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  amenityLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 8,
    color: Orange,
    textAlign: 'center',
    lineHeight: 10,
  },
  amenityEmpty: {
    marginTop: 6,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: Muted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  thanks: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  thanksTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: '#fff',
    fontStyle: 'italic',
  },
  thanksBody: {
    marginTop: 2,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
  },
});
