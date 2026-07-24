import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Blocks screenshots / screen recording while `active` (Android FLAG_SECURE;
 * iOS ReplayKit restriction where supported).
 */
export function useSecureScreen(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void ScreenCapture.preventScreenCaptureAsync().catch(() => undefined);
    return () => {
      cancelled = true;
      void ScreenCapture.allowScreenCaptureAsync().catch(() => undefined);
      void cancelled;
    };
  }, [active]);
}
