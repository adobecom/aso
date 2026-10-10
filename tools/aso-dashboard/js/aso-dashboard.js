import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { initReleasePeriodSettings } from './release-period-settings.js';
import { init as initPreview } from './preview.js';
import { init as initExport } from './export.js';
import { init as initImport } from './import.js';
import { init as initPublish } from './publish-form.js';
import { init as initPublishHistory } from './publish-history.js';
import { setupTabs } from './dashboard-tabs.js';

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    const publishHistory = initPublishHistory({ context, token });
    setupTabs({ publishHistory });
    initReleasePeriodSettings();
    await Promise.all([
      initPreview({ context, token }),
      initExport({ context, token }),
      initImport({ context, token }),
      initPublish({ context, token }),
    ]);
  } catch (error) {
    console.error('Error initializing dashboard:', error);
  }
}());
