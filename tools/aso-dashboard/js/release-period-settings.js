import {
  getDefaultReleasePeriod,
  populateReleasePeriodDropdowns,
} from './lib/content-taxonomy.js';

const RELEASE_PERIOD_PREFIX = 'release-period-';

function readReleasePeriod() {
  return {
    year: document.getElementById(`${RELEASE_PERIOD_PREFIX}year`)?.value?.trim() || '',
    quarter: document.getElementById(`${RELEASE_PERIOD_PREFIX}quarter`)?.value?.trim() || '',
    month: document.getElementById(`${RELEASE_PERIOD_PREFIX}month`)?.value?.trim() || '',
  };
}

function isReleasePeriodComplete(releasePeriod = readReleasePeriod()) {
  return Boolean(releasePeriod.year && releasePeriod.quarter && releasePeriod.month);
}

function initReleasePeriodSettings(onChange) {
  populateReleasePeriodDropdowns(RELEASE_PERIOD_PREFIX);
  ['year', 'quarter', 'month'].forEach((key) => {
    const element = document.getElementById(`${RELEASE_PERIOD_PREFIX}${key}`);
    if (element && onChange) element.addEventListener('change', onChange);
  });
}

export {
  RELEASE_PERIOD_PREFIX,
  getDefaultReleasePeriod,
  initReleasePeriodSettings,
  isReleasePeriodComplete,
  readReleasePeriod,
};
