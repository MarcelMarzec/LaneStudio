/* eslint-disable no-process-env */

import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const envs = {
  ENV__ID_PRESETS_CDN_URL: JSON.stringify(process.env.ID_PRESETS_CDN_URL || null),
  ENV__ID_OCI_CDN_URL: JSON.stringify(process.env.ID_OCI_CDN_URL || null),
  ENV__ID_NSI_CDN_URL: JSON.stringify(process.env.ID_NSI_CDN_URL || null),
  ENV__ID_WMF_SITEMATRIX_CDN_URL: JSON.stringify(process.env.ID_WMF_SITEMATRIX_CDN_URL || null),

  ENV__ID_API_CONNECTION_URL: JSON.stringify(process.env.ID_API_CONNECTION_URL || null),
  ENV__ID_API_CONNECTION_API_URL: JSON.stringify(process.env.ID_API_CONNECTION_API_URL || null),
  ENV__ID_API_CONNECTION_CLIENT_ID: JSON.stringify(process.env.ID_API_CONNECTION_CLIENT_ID || null),
  ENV__ID_API_CONNECTION: JSON.stringify(process.env.ID_API_CONNECTION || null),

  ENV__ID_TAGINFO_API_URL: JSON.stringify(process.env.ID_TAGINFO_API_URL || null),
  ENV__ID_NOMINATIM_API_URL: JSON.stringify(process.env.ID_NOMINATIM_API_URL || null),

  ENV__ID_SHOW_DONATION_MESSAGE: JSON.stringify(process.env.ID_SHOW_DONATION_MESSAGE || null),

  // Lane Studio: the roads shown over the imagery below zoom 16 (Mapbox serves iD's own overlay only to iD's sites)
  ENV__ID_LOCATOR_OVERLAY_URL: JSON.stringify(process.env.ID_LOCATOR_OVERLAY_URL || null),
  ENV__ID_LOCATOR_OVERLAY_CREDIT: JSON.stringify(process.env.ID_LOCATOR_OVERLAY_CREDIT || null),
};

export default envs;
