import Nav from "../../components/Nav";
import AuthGuard from "../../components/AuthGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="layout">
        <Nav />
        <main className="main">{children}</main>
      </div>
    </AuthGuard>
  );
}
