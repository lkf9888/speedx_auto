import { SharedConversationView } from "@/components/workbench/SharedConversationView";
import { getShareStore } from "@/lib/workbench/shares";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

function Gone({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">SPEEDX AUTO</h1>
      <p className="text-sm leading-6 text-ink-600">{text}</p>
    </main>
  );
}

/** A workbench conversation shared by link: read-only, no sign-in, until the link expires or is cancelled. */
export default async function SharePage({ params }: Props) {
  const store = getShareStore();
  if (!store) return <Gone text="分享功能暂时用不了。" />;
  let shared;
  try {
    shared = await store.get((await params).token);
  } catch {
    return <Gone text="暂时打不开，请稍后再试。" />;
  }
  if (!shared) return <Gone text="这个分享链接已经过期或被取消了。需要的话请让店里重新发一个。" />;
  return <SharedConversationView shared={shared} />;
}
