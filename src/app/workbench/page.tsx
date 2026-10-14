import { headers } from "next/headers";
import { Workbench } from "@/components/workbench/Workbench";
import { staffUser } from "@/lib/workbench/access";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const user = await staffUser(await headers());
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold">维修工作台</h1>
        <p className="text-sm leading-6 text-ink-600">
          请从网站的“员工登录 → 维修工作台”进入，用店里的员工账号登录后再打开这个页面。
        </p>
      </main>
    );
  }
  return <Workbench email={user.email} />;
}
