import "../landing.css";
import ProductCollection from "../../components/ProductCollection";

export const metadata = { title: "منتجات نضارة" };

export default function ProductsPage() {
  return (
    <main className="nadhara-page">
      <header className="n-topbar">
        <a className="n-logo" href="/">نضارة</a>
        <a className="n-topbar-link" href="/">الرئيسية</a>
      </header>
      <ProductCollection titleLevel="h1" />

    </main>
  );
}
