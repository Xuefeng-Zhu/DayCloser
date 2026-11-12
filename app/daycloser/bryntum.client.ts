import "@bryntum/core-enterprise/fontawesome/css/fontawesome.css";
import "@bryntum/core-enterprise/fontawesome/css/solid.css";
import "@bryntum/core-enterprise/core.thin.css";
import "@bryntum/core-enterprise/svalbard.css";

export function registerBryntumLicense() {
  const licenseKey = import.meta.env.VITE_BRYNTUM_LICENSE_KEY?.trim();
  if (licenseKey && globalThis.bryntum.licenseKey !== licenseKey) {
    globalThis.bryntum.licenseKey = licenseKey;
  }
}
