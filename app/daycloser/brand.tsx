import { IconSunrise } from "@tabler/icons-react";

export function Brand({ name }: { name: string }) {
  return (
    <div className="dc-brand">
      <IconSunrise aria-hidden="true" size={36} stroke={1.5} />
      <span>{name}</span>
    </div>
  );
}
