import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { initReleasePeriodSettings } from './release-period-settings.js';
import { init as initPreview } from './preview.js';
import { init as initExport } from './export.js';
import { init as initImport } from './import.js';
import { init as initPublish, setPublishAccess } from './publish-form.js';
import { init as initPublishHistory } from './publish-history.js';
import { checkPublishAccess } from './publish.js';
import { getStorePublishApi } from './lib/utils.js';
import { setupTabs } from './dashboard-tabs.js';

async function applyPublishAccess({ context, token }) {
  try {
    const apiBase = await getStorePublishApi({ context, token });
    setPublishAccess(await checkPublishAccess({ apiBase, token }));
  } catch (error) {
    // An unreachable check must not lock users out; the service still enforces access.
    console.warn('Could not verify publish access:', error);
  }
}

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    const publishHistory = initPublishHistory({ context, token });
    setupTabs({ publishHistory });
    initReleasePeriodSettings();
    await Promise.all([
      applyPublishAccess({ context, token }),
      initPreview({ context, token }),
      initExport({ context, token }),
      initImport({ context, token }),
      initPublish({ context, token }),
    ]);
  } catch (error) {
    console.error('Error initializing dashboard:', error);
  }
}());
