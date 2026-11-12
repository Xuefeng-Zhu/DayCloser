import Studio from "@/components/daycloser/Studio";

const SEO_TITLE = "DayCloser — Turn open hours into paid bookings";
const SEO_DESCRIPTION =
  "An outbound sales agent for appointment businesses: finds unused capacity, invites opted-in customers, adapts the offer to their reply and collects a PayPal deposit.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return <Studio />;
}
