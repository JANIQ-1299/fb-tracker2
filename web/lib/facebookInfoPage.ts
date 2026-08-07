// صفحة HTML عربية بسيطة (RTL) لردود GET على مسارات /facebook/* - هذه المسارات هي route.ts وليست
// page.tsx (لأنها تحتاج التعامل مع POST من Meta على نفس المسار)، لذلك لا يمكنها استخدام تخطيط
// Next.js العادي مباشرة؛ هذه دالة صغيرة تبني توثيقًا بصريًا متسقًا مع ألوان الموقع (globals.css).
export function renderFacebookInfoPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - نضارة</title>
<style>
  :root { --bg:#0f1420; --surface:#171d2b; --border:#2a3345; --text:#e7ecf7; --text-dim:#9aa7c2; --primary:#4f7cff; }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px 20px; background:var(--bg); color:var(--text); direction:rtl;
    font-family:"Segoe UI", Tahoma, "Cairo", Arial, sans-serif; line-height:1.9; }
  main { max-width:640px; margin:0 auto; background:var(--surface); border:1px solid var(--border);
    border-radius:12px; padding:28px 32px; }
  h1 { font-size:20px; margin-top:0; }
  p, li { color:var(--text-dim); }
  a { color:var(--primary); }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
${bodyHtml}
</main>
</body>
</html>`;
}
