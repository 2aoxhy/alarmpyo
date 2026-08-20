import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import type { AppData } from '../../models/app-data';
import { requestPreparedAlarmPyoWidgetPin } from '../../services/widget-pin-service';

export type WidgetPinRequestOutcome =
  | { status: 'requested' }
  | { status: 'installed' }
  | { status: 'manual' }
  | { status: 'failed' }
  | { status: 'ignored' };

/** Owns the native widget preparation and pin request for the display screen. */
export function useDisplaySettingsController(data: AppData) {
  const [widgetPinBusy, setWidgetPinBusy] = useState(false);
  const androidWidgetSupported = Platform.OS === 'android';

  const requestWidget = useCallback(async (): Promise<WidgetPinRequestOutcome> => {
    if (widgetPinBusy || !androidWidgetSupported) return { status: 'ignored' };
    setWidgetPinBusy(true);
    try {
      const result = await requestPreparedAlarmPyoWidgetPin(data);
      return result.status === 'requested'
        ? { status: 'requested' }
        : result.status === 'installed'
          ? { status: 'installed' }
          : { status: 'manual' };
    } catch {
      return { status: 'failed' };
    } finally {
      setWidgetPinBusy(false);
    }
  }, [androidWidgetSupported, data, widgetPinBusy]);

  return {
    androidWidgetSupported,
    requestWidget,
    widgetPinBusy,
  };
}
