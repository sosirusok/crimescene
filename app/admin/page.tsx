import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionUser, sessionSignOutPath } from "../session-auth";
import { getAdminAccess } from "./access";
import { AdminDashboard } from "./admin-dashboard";

export const metadata: Metadata = { title: "운영 콘솔 | 크라임씬플레이" };

export default async function AdminPage() {
  const user = await requireSessionUser("/admin");
  const access = await getAdminAccess();

  if (!access.configured) {
    return (
      <AdminGate
        title="관리자 설정이 필요합니다"
        description="사이트 환경변수 ADMIN_EMAILS에 허용할 운영자 이메일을 쉼표로 구분해 등록해 주세요."
        email={user.email}
      />
    );
  }
  if (!access.allowed) {
    return (
      <AdminGate
        title="접근 권한이 없습니다"
        description="로그인은 확인했지만 관리자 허용 목록에 포함되지 않은 계정입니다."
        email={user.email}
      />
    );
  }

  return (
    <AdminDashboard
      userName={user.displayName}
      userEmail={user.email}
      signOutPath={sessionSignOutPath("/")}
    />
  );
}

function AdminGate({
  title,
  description,
  email,
}: {
  title: string;
  description: string;
  email: string;
}) {
  return (
    <main className="admin-gate">
      <div>
        <span>CRIME SCENE · SECURE CONSOLE</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <dl>
          <dt>현재 로그인</dt>
          <dd>{email}</dd>
        </dl>
        <Link href="/">고객 사이트로 돌아가기</Link>
      </div>
    </main>
  );
}
