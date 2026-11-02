import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

window.Native = {
  isNative: Capacitor.isNativePlatform(),
  LocalNotifications,
  Preferences,
  App,
};
