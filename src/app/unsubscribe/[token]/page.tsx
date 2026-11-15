import { UnsubscribeButton } from "@/components/UnsubscribeButton";

type Props = { params: Promise<{ token: string }> };

/** Opened from a follow-up email's footer. A button, not an automatic unsubscribe: mail scanners open links too. */
export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">SPEEDX AUTO</h1>
      <p className="text-sm leading-6 text-ink-600">
        不想再收到我们的维修优惠邮件？点下面的按钮退订。
        <br />
        Don&apos;t want our repair offers by email? Unsubscribe below.
      </p>
      <UnsubscribeButton token={token} />
    </main>
  );
}
