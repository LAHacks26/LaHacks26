import { Kitchen } from "@/components/kitchen/Kitchen";

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ allergies?: string | string[] }>;
}) {
  const { allergies } = await searchParams;
  const openAllergies = allergies === "1";
  return <Kitchen key={String(openAllergies)} initialAllergiesOpen={openAllergies} />;
}
