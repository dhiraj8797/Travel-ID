export type LegalDocId =
  | 'privacy'
  | 'terms'
  | 'data-privacy'
  | 'open-source';

export type LegalSection = {
  heading: string;
  body: string;
};

export type LegalDocument = {
  id: LegalDocId;
  title: string;
  updated: string;
  summary: string;
  sections: LegalSection[];
};

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updated: '24 July 2026',
    summary:
      'How Travel ID collects, uses, and protects information when you use the boarding-pass wallet.',
    sections: [
      {
        heading: 'Who we are',
        body:
          'Travel ID (“we”, “our”, “the app”) is a mobile boarding-pass wallet for bus, train, flight, hotel, and metro tickets. Optional sign-in uses Google Sign-In so we can show your name and photo on this device.',
      },
      {
        heading: 'Information we store on your device',
        body:
          'Boarding passes you add (PNR, train/flight/bus details, passenger names, coach/seat, QR or barcode payloads), app preferences (for example reminder toggles), and temporary drafts while scanning or uploading a ticket. Pass data is encrypted on-device (AES-256-GCM) with a key kept in the device Keystore/Keychain. Android auto-backup of app data is disabled. Screenshots are blocked while boarding barcodes and official metro gate QRs are on screen.',
      },
      {
        heading: 'Account information',
        body:
          'If you sign in with Google, Travel ID receives your Google account id, name, email, and profile photo (via Google’s ID token and profile). We store a local session and a small profile snapshot on the device so you stay signed in. We do not receive or store your Google password.',
      },
      {
        heading: 'Live train and route data',
        body:
          'When you view live train status, Travel ID may send the train number, journey date, and station codes to RailRadar or similar providers to show running status, delay, ETA, and coach composition. Those requests are made only when you open live tracking and the journey window allows it.',
      },
      {
        heading: 'How we use information',
        body:
          'To show your passes, generate boarding barcodes, send optional trip reminders you enable, display your Google profile in the app, and improve reliability (for example error messages when a live status request fails). We do not sell your personal information.',
      },
      {
        heading: 'Sharing',
        body:
          'Ticket data stays on your device unless you choose to share a pass (system share sheet) or use live status (train number/date to the status provider). Google account data is handled under Google’s privacy policy. We do not share your wallet contents with advertisers.',
      },
      {
        heading: 'Retention and deletion',
        body:
          'Passes remain until you delete them or clear the wallet. You can clear local cache, delete all passes, or sign out from Settings. Signing out removes the Travel ID session from this device. To manage or delete your Google account itself, use Google’s account tools.',
      },
      {
        heading: 'Security',
        body:
          'Google session tokens are stored only in the device Keystore/Keychain (never in plain app preferences). Wallet passes are encrypted at rest. Screenshot capture is blocked on boarding-code screens. Our API proxy rate-limits requests and rejects oversized uploads. You are responsible for protecting your phone with a lock screen and for keeping your Google account secure.',
      },
      {
        heading: 'Children',
        body:
          'Travel ID is not directed at children under 13. Do not create an account for a child without appropriate parental consent where required by law.',
      },
      {
        heading: 'Changes',
        body:
          'We may update this policy as the app evolves. The “Last updated” date at the top of this screen will change when we do. Continued use after an update means you accept the revised policy.',
      },
      {
        heading: 'Contact',
        body:
          'For Travel ID privacy questions, use in-app Settings → About. For Google account privacy, see policies.google.com/privacy.',
      },
    ],
  },

  terms: {
    id: 'terms',
    title: 'Terms & Conditions',
    updated: '20 July 2026',
    summary:
      'The rules for using Travel ID as a personal boarding-pass wallet.',
    sections: [
      {
        heading: 'Agreement',
        body:
          'By downloading or using Travel ID, you agree to these Terms & Conditions and our Privacy Policy. If you do not agree, please uninstall the app and do not create an account.',
      },
      {
        heading: 'What Travel ID provides',
        body:
          'Travel ID helps you store and display boarding passes you already hold (bus, rail, flight). It is a convenience wallet, not a ticket booking agency, railway, airline, or bus operator.',
      },
      {
        heading: 'Not an official travel document issuer',
        body:
          'Operators and station/airport staff may require the original ticket, PNR lookup, or their own app. Always keep your booking confirmation. Travel ID does not guarantee acceptance of a displayed pass in place of an official ticket.',
      },
      {
        heading: 'Your responsibilities',
        body:
          'You must only add tickets you are authorised to use, provide accurate information, keep credentials secure, and comply with applicable transport rules. Do not use the app to forge, alter, or misuse barcodes or booking details.',
      },
      {
        heading: 'Accounts',
        body:
          'Optional sign-in is provided through Google. You must follow Google’s terms as well. You are responsible for activity under your account on this device. We may suspend access if we reasonably believe the app is being abused.',
      },
      {
        heading: 'Live status and third-party data',
        body:
          'Running status, platforms, delays, and related information come from third-party sources and may be incomplete, delayed, or incorrect. Do not rely solely on live status for critical travel decisions.',
      },
      {
        heading: 'Alarms and notifications',
        body:
          'Arrival alarms and trip reminders are best-effort. Device battery settings, OS restrictions, or missing permissions can prevent alerts. Always verify departure and arrival times with the operator.',
      },
      {
        heading: 'Intellectual property',
        body:
          'Travel ID branding, design, and app code are protected. Airline/rail/bus marks shown for recognition belong to their owners. You may not copy, reverse engineer, or redistribute the app except as allowed by law.',
      },
      {
        heading: 'Disclaimer',
        body:
          'The app is provided “as is” without warranties of uninterrupted or error-free service. To the fullest extent permitted by law, we are not liable for missed journeys, denied boarding, incorrect third-party data, or loss arising from reliance on the wallet display.',
      },
      {
        heading: 'Changes and termination',
        body:
          'We may update these terms or discontinue features. We may stop providing the app. You may stop using Travel ID at any time by deleting the app and, if desired, signing out and managing your Google account separately.',
      },
      {
        heading: 'Governing law',
        body:
          'These terms are governed by the laws of India, without regard to conflict-of-law rules. Courts in Bengaluru, Karnataka shall have exclusive jurisdiction, subject to mandatory consumer protections that apply where you live.',
      },
    ],
  },

  'data-privacy': {
    id: 'data-privacy',
    title: 'Data & Privacy Controls',
    updated: '20 July 2026',
    summary:
      'A plain-language guide to what Travel ID stores and how you can control it.',
    sections: [
      {
        heading: 'Data kept only on this phone',
        body:
          'Saved boarding passes, QR/barcode payloads, and UI preferences stay in local storage on your device. Uninstalling the app removes this local wallet unless you restore from a backup of the phone itself.',
      },
      {
        heading: 'Account data (Google)',
        body:
          'Google sign-in stores your Google user id, name, email, and photo on this device, plus a session token so you do not have to sign in every time. Sign out from Settings to remove the session from this device.',
      },
      {
        heading: 'What we send over the network',
        body:
          '• Sign in → Google (account picker / ID token)\n• Profile refresh → Google silent sign-in when available\n• Live train status → RailRadar (train number, date, stations)\nTicket PDFs and photos you scan are processed on-device where possible for extracting pass fields.',
      },
      {
        heading: 'Controls in Settings',
        body:
          '• Clear local cache — removes temporary drafts\n• Delete all passes — wipes the wallet on this device\n• Sign out — clears the Google session locally\n• Trip reminders — turn notifications on or off\nOpen Privacy Policy and Terms anytime from Settings → Legal.',
      },
      {
        heading: 'Your rights',
        body:
          'Depending on where you live, you may have rights to access, correct, or delete personal data. For wallet data on the phone, use the in-app delete controls. For Google account identity data, manage your account at myaccount.google.com.',
      },
      {
        heading: 'Third-party policies',
        body:
          'Google and live-status providers have their own privacy practices. Review Google’s privacy policy from Settings when you use Google sign-in.',
      },
    ],
  },

  'open-source': {
    id: 'open-source',
    title: 'Open Source & Licenses',
    updated: '20 July 2026',
    summary:
      'Travel ID is built with open-source libraries. Key notices for components we rely on.',
    sections: [
      {
        heading: 'Runtime',
        body:
          'Travel ID uses Expo, React Native, React, Expo Router, and related native modules under their respective open-source licenses (typically MIT). Full license texts are available in each package’s repository.',
      },
      {
        heading: 'Fonts',
        body:
          'Outfit and DM Sans are used under the SIL Open Font License via @expo-google-fonts packages.',
      },
      {
        heading: 'Barcodes',
        body:
          'Boarding barcode rendering uses bwip-js (@bwip-js/react-native) under its MIT license.',
      },
      {
        heading: 'Acknowledgements',
        body:
          'Icons via @expo/vector-icons (Ionicons / Material Community Icons). Scene and vehicle artwork are bundled with the app for Travel ID branding.',
      },
    ],
  },
};

export function getLegalDocument(id: string | undefined): LegalDocument | null {
  if (!id) return null;
  return LEGAL_DOCUMENTS[id as LegalDocId] ?? null;
}

export const LEGAL_INDEX: { id: LegalDocId; title: string; blurb: string }[] = [
  {
    id: 'privacy',
    title: 'Privacy Policy',
    blurb: 'How we handle personal and ticket data',
  },
  {
    id: 'terms',
    title: 'Terms & Conditions',
    blurb: 'Rules for using the Travel ID wallet',
  },
  {
    id: 'data-privacy',
    title: 'Data & Privacy',
    blurb: 'On-device storage and your controls',
  },
  {
    id: 'open-source',
    title: 'Open Source',
    blurb: 'Libraries and license notices',
  },
];
