import { CustomersGrid } from "@/daycloser/customers-grid";

import { useMerchantWorkspace } from "./daycloser-merchant";

export const meta = () => [{ title: "Customers · DayCloser" }];

export default function StudioCustomers() {
  const { dashboard } = useMerchantWorkspace();

  return (
    <>
      <h1 id="dc-merchant-title" className="text-xl font-semibold tracking-tight">
        Customers
      </h1>
      <CustomersGrid
        contacts={dashboard.contacts}
        conversations={dashboard.conversations}
        timezone={dashboard.studio.timezone}
      />
    </>
  );
}
