export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  
  const header = (
    <header>
      <div>
        <h1>Stephen's blog</h1>
        <p>Welcome to my tech blog.</p>
        <br />
      </div>
    </header>
  );

  const footer = (
    <footer>
      <div>
        <br />
        <h1>Developed by Stephen</h1>
      </div>
    </footer>
  );

  return (
    <html>
      <head />
        <body>
          {header}
          {children}
          {footer}
        </body>
    </html>
  )
}
