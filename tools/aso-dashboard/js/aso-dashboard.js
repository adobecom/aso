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

// Never rejects: an unreachable check must not lock users out (the service still enforces access).
async function resolvePublishAccess({ context, token }) {
  let apiBase;
  try {
    apiBase = await getStorePublishApi({ context, token });
  } catch (error) {
    console.warn('Could not load store publish configuration:', error);
    return { allowed: false, message: error.message };
  }
  try {
    return await checkPublishAccess({ apiBase, token });
  } catch (error) {
    console.warn('Could not verify publish access:', error);
    return { allowed: true };
  }
}

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    const accessReady = resolvePublishAccess({ context, token });
    accessReady.then(setPublishAccess);
    const publishHistory = initPublishHistory({ context, token, accessReady });
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
