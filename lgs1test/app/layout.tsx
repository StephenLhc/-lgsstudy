
import Navbar from './libs/navbar';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/*
        <head /> will contain the components returned by the nearest parent
        head.tsx. Find out more at https://beta.nextjs.org/docs/api-reference/file-conventions/head
      */}
      <head />
      <body>
        <h1>the header</h1>
        <header><Navbar /></header>
        {children}
      </body>
    </html>
  )
}
