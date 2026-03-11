export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle data-slot="logo-mark-shadow" cx="10" cy="12" r="4" fill="var(--icon-weak-base)" />
      <circle
        data-slot="logo-mark-ring"
        cx="10"
        cy="10"
        r="7"
        stroke="var(--icon-strong-base)"
        stroke-width="4"
      />
    </svg>
  )
}

export const Splash = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="62" r="18" fill="var(--icon-base)" />
      <circle cx="50" cy="50" r="30" stroke="var(--icon-strong-base)" stroke-width="12" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <circle cx="18" cy="24" r="6" fill="var(--icon-weak-base)" />
      <circle cx="18" cy="18" r="10" stroke="var(--icon-base)" stroke-width="6" />
      <text
        x="36"
        y="28"
        fill="var(--icon-strong-base)"
        font-family="IBM Plex Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        font-size="22"
        font-weight="700"
        letter-spacing="1"
      >
        REALSEECODE
      </text>
    </svg>
  )
}
