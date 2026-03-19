import { type ParentProps } from "solid-js"

export default function AdminLayout(props: ParentProps) {
  return (
    <div class="mx-auto max-w-6xl p-6 lg:p-8">
      <h1 class="mb-8 text-2xl font-semibold text-color-primary">管理后台</h1>

      {props.children}
    </div>
  )
}
