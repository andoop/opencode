import { Link, Meta } from "@solidjs/meta"

export const Favicon = () => {
  return (
    <>
      <Link rel="icon" type="image/png" href="/favicon-32x32-v4.png" sizes="32x32" />
      <Link rel="icon" type="image/png" href="/favicon-96x96-v4.png" sizes="96x96" />
      <Link rel="icon" type="image/svg+xml" href="/favicon-v4.svg" />
      <Link rel="shortcut icon" href="/favicon-32x32-v4.png" />
      <Link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v4.png" />
      <Link rel="manifest" href="/site.webmanifest" />
      <Meta name="apple-mobile-web-app-title" content="RealseeCode" />
    </>
  )
}
