export const DAYCLOSER_SCHEDULE_PATH = "/daycloser-merchant";
export const DAYCLOSER_CAMPAIGNS_PATH = `${DAYCLOSER_SCHEDULE_PATH}/campaigns`;
export const DAYCLOSER_CUSTOMERS_PATH = `${DAYCLOSER_SCHEDULE_PATH}/customers`;

export function dayCloserSectionForPath(pathname: string) {
  switch (pathname.replace(/\/$/, "")) {
    case DAYCLOSER_SCHEDULE_PATH:
      return "schedule";
    case DAYCLOSER_CAMPAIGNS_PATH:
      return "campaigns";
    case DAYCLOSER_CUSTOMERS_PATH:
      return "customers";
  }
}
