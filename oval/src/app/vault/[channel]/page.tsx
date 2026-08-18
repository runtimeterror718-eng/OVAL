import { notFound } from "next/navigation";
import { VaultRoom } from "@/components/vault/vault-room";
import { VAULT_CHANNELS } from "@/lib/vault-types";

export default function VaultChannelPage({ params }: { params: { channel: string } }) {
  if (!VAULT_CHANNELS.includes(params.channel as any)) notFound();
  return <VaultRoom />;
}
